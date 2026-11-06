"use client";

// Full-screen SVG overlay that renders committed connection wires and
// the live drag-preview wire while the user is dragging from an output port.
// Sits on the Z_INDEX.wires layer — below nodes and ports, above the Konva canvas.
// Being on that layer is also what keeps a wire's delete button (#458) under
// an open Create form, the dock and the rail.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useConnectionStore, type Connection } from "@/store/connection.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useViewport } from "@/store/viewport.store";
import { useToolStore } from "@/store/tool.store";
import { useSettings } from "@/store/settings.store";
import { boardKeyAllowed } from "@/lib/canvas/boardKeys";
import { COLORS, NODE_CORNER_RADIUS, Z_INDEX } from "@/constants/canvas.constants";
import { boardCandidates } from "@/store/hover.store";
import { useLayerOrder } from "@/store/layerOrder.store";
import { hoverTargetAt } from "@/lib/canvas/hoverTarget";
import { boundsOf } from "@/lib/canvas/bounds";
import { useGenerating } from "@/store/generating.store";
import { toScreen, type Point } from "@/lib/canvas/coords";
import { inputPoint } from "@/lib/canvas/ports";
import { canTake, isLinkStyle, snapPort, sourceSpan, wireEnds, wirePath, wireStart } from "@/lib/canvas/wires";
import { canvasHistory } from "@/lib/canvas/history";
import { selectOnly } from "@/lib/canvas/selection";
import { kindSpec } from "./NodePanel/kinds";
import { trackPointer } from "@/lib/dom/pointer";
import { listen } from "@/lib/dom/listen";
import "./Connections.scss";

interface InputPortEntry extends Point {
  nodeId: string;
}

export default function ConnectionOverlay() {
  const { connections, drag, selectedIds } = useConnectionStore();
  const panels     = useNodePanel((s) => s.panels);
  const konvaNodes = useKonvaNodes((s) => s.nodes);
  const vp         = useViewport();
  const activeTool = useToolStore((s) => s.activeTool);
  const settingsLinkStyle = useSettings((s) => s.settings.linkStyle);
  // Wires into a node that is generating move (#456).
  const generating = useGenerating((s) => s.ids);
  const panelById = useMemo(() => new Map(panels.map((p) => [p.id, p])), [panels]);

  // Only panels have input ports (konva nodes are output-only sources), and
  // not every kind: a Compose box takes no input (#181).
  const inputPorts: InputPortEntry[] = panels
    .filter((p) => kindSpec(p.kind).acceptsInput !== false)
    .map((p) => ({ nodeId: p.id, ...toScreen(inputPoint(p), vp) }));

  // The wire the pointer is over, for its delete button (#458).
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  /**
   * Where the dragged wire would land with the pointer at `at`: the nearest
   * input port in snap range that can take it, else the input of the node
   * under the pointer (#458). Nodes are found as for hover, topmost first.
   */
  const dropTarget = (at: Point): InputPortEntry | null => {
    if (!drag) return null;
    const ports = inputPorts.filter((p) => canTake(p.nodeId, drag, connections));
    const snapped = snapPort(ports, at, drag.fromNodeId);
    if (snapped) return snapped;
    const point = { x: (at.x - vp.x) / vp.scale, y: (at.y - vp.y) / vp.scale };
    const under = hoverTargetAt(point, boardCandidates(), vp.scale, useLayerOrder.getState().topLayer);
    return ports.find((p) => p.nodeId === under) ?? null;
  };

  // Always-fresh ref so pointer handlers never see stale data.
  const dropTargetRef = useRef(dropTarget);
  dropTargetRef.current = dropTarget;

  // The wires slice of the shared undo timeline, so undoing a delete brings
  // back the wires along with the nodes they joined. Every store setter
  // builds a new array, so holding it is a valid snapshot.
  useEffect(() => {
    return canvasHistory.register("connections", {
      capture: () => useConnectionStore.getState().connections,
      restore: (snap) => useConnectionStore.getState().replaceConnections(snap as Connection[]),
    });
  }, []);

  // Global pointer listeners — registered only while a drag is active.
  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      useConnectionStore.getState().updateDrag(e.clientX, e.clientY);
    };

    const onUp = (e: PointerEvent) => {
      const store = useConnectionStore.getState();
      // Escape already ended it.
      if (!store.drag) return;
      const before = store.connections;
      const target = dropTargetRef.current({ x: e.clientX, y: e.clientY });
      if (target) store.commitConnection(target.nodeId);
      // Over nothing: a new wire is dropped, a moved one removed (#458).
      else store.dropNowhere();
      // Duplicates, self-links and a wire put back where it was change nothing.
      if (useConnectionStore.getState().connections !== before) canvasHistory.commit();
    };

    // Escape lets go of the wire without a change (#458). Capture phase, and
    // stopped there, so it doesn't also close a panel.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      useConnectionStore.getState().cancelDrag();
    };
    const offKey = listen(window, "keydown", onKey, { capture: true });

    // A cancelled drag drops the wire: it used to stay on the pointer.
    const offPointer = trackPointer({ onMove, onUp, onCancel: () => useConnectionStore.getState().cancelDrag() });
    return () => {
      offKey();
      offPointer();
    };
  // Re-register only when a new drag starts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag ? `${drag.fromNodeId}:${drag.movingId ?? ""}` : null]);

  // Delete key removes all selected connections.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Capture phase runs before a modal can stop the event, so the guard
      // has to skip a dialog's keys itself; see NodePanel.
      if (!boardKeyAllowed(e)) return;
      if (e.code !== "Delete" && e.code !== "Backspace") return;
      const { selectedIds } = useConnectionStore.getState();
      if (!selectedIds.length) return;
      e.preventDefault();
      // No stopImmediatePropagation: when nodes are selected alongside the
      // wires (Ctrl+A, Ctrl+click), their Delete handlers must run too.
      selectedIds.forEach((id) => useConnectionStore.getState().removeConnection(id));
      canvasHistory.commit(e);
    };
    return listen(window, "keydown", handler, { capture: true });
  }, []);

  // Where the wire would land if let go now.
  const snapTarget = drag ? dropTarget({ x: drag.cursorX, y: drag.cursorY }) : null;
  const targetPanel = snapTarget ? panelById.get(snapTarget.nodeId) : undefined;
  const targetBox = targetPanel ? boundsOf(targetPanel) : null;

  // An armed link tool draws every link in its style; otherwise the one
  // chosen in Settings (#214). Links store no style of their own.
  const linkStyle = isLinkStyle(activeTool) ? activeTool : settingsLinkStyle;

  // The live drag preview starts here; null once its source is gone.
  const fromPt = drag ? wireStart(drag, panelById, konvaNodes, vp) : null;
  const fromSpan = drag ? sourceSpan(drag, panelById, konvaNodes, vp) : null;

  return (
    <svg
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: Z_INDEX.wires,
        overflow: "visible",
      }}
    >
      {/* Committed connection wires */}
      {connections.map((conn) => {
        // A wire picked up by its end is drawn as the drag preview instead.
        if (conn.id === drag?.movingId) return null;
        const ends = wireEnds(conn, panelById, konvaNodes, vp);
        if (!ends) return null;
        const d          = wirePath(ends.from, ends.to, linkStyle, ends.around);
        const isSelected = selectedIds.includes(conn.id);
        const className  = ["board-wire", isSelected && "is-selected", generating.has(conn.toNodeId) && "is-flowing"]
          .filter(Boolean)
          .join(" ");
        return (
          <g
            key={conn.id}
            className={className}
            onPointerEnter={() => setHoveredId(conn.id)}
            onPointerLeave={() => setHoveredId((id) => (id === conn.id ? null : id))}
          >
            {isSelected && <path d={d} className="board-wire-halo" />}
            {/* Wide invisible hit area so thin lines are easy to click */}
            <path
              d={d}
              fill="none"
              stroke={COLORS.ink}
              strokeWidth={12}
              strokeLinecap="round"
              opacity={0}
              style={{ pointerEvents: "stroke", cursor: "pointer" }}
              onClick={(e) => {
                e.stopPropagation();
                if (e.shiftKey || e.ctrlKey || e.metaKey) {
                  useConnectionStore.getState().addToSelection(conn.id);
                } else {
                  // Through selectOnly like every other click path. This one
                  // cleared nodes and panels by hand and so missed frames
                  // (#127) -- and the node transformer's chrome with them.
                  selectOnly("wire");
                  useConnectionStore.getState().select(conn.id);
                }
              }}
            />
            {/* Visible wire: colour and width follow hover and selection in Connections.scss */}
            <path d={d} className="board-wire-line" />
            {!drag && (isSelected || hoveredId === conn.id) && <DeleteButton d={d} id={conn.id} />}
          </g>
        );
      })}

      {/* Live drag preview */}
      {drag && fromPt && (
        <path
          d={wirePath(fromPt, snapTarget ?? { x: drag.cursorX, y: drag.cursorY }, linkStyle, {
            from: fromSpan ?? undefined,
            to: targetBox ? { top: targetBox.y * vp.scale + vp.y, bottom: (targetBox.y + targetBox.h) * vp.scale + vp.y } : undefined,
          })}
          className="board-wire-preview"
        />
      )}

      {/* Snap highlight ring around the target input port */}
      {drag && snapTarget && (
        <circle cx={snapTarget.x} cy={snapTarget.y} r={10} className="board-wire-snap" />
      )}

      {/* The node the wire would land on (#458) */}
      {drag && targetBox && (
        <rect
          x={targetBox.x * vp.scale + vp.x - 3}
          y={targetBox.y * vp.scale + vp.y - 3}
          width={targetBox.w * vp.scale + 6}
          height={targetBox.h * vp.scale + 6}
          rx={NODE_CORNER_RADIUS * vp.scale + 3}
          className="board-wire-target"
        />
      )}
    </svg>
  );
}

/**
 * A round x at the middle of a wire, deleting it in one undo step (#458).
 * The middle is measured off the drawn path, so it sits on the line
 * whatever its style or route.
 */
function DeleteButton({ d, id }: { d: string; id: string }) {
  const measure = useRef<SVGPathElement>(null);
  const [mid, setMid] = useState<Point | null>(null);
  useLayoutEffect(() => {
    const path = measure.current;
    if (!path) return;
    const pt = path.getPointAtLength(path.getTotalLength() / 2);
    setMid({ x: pt.x, y: pt.y });
  }, [d]);
  return (
    <>
      <path ref={measure} d={d} fill="none" stroke="none" />
      {mid && (
        <g
          className="board-wire-delete"
          transform={`translate(${mid.x} ${mid.y})`}
          role="button"
          aria-label="Delete link"
          // Not a press on the board: no pan, no marquee, no deselect.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            useConnectionStore.getState().removeConnection(id);
            canvasHistory.commit();
          }}
        >
          <title>Delete link</title>
          <circle r={10} className="board-wire-delete-bg" />
          <path d="M -3.5 -3.5 L 3.5 3.5 M 3.5 -3.5 L -3.5 3.5" className="board-wire-delete-x" />
        </g>
      )}
    </>
  );
}
