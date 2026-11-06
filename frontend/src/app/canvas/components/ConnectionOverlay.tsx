"use client";

// Full-screen SVG overlay that renders committed connection wires and
// the live drag-preview wire while the user is dragging from an output port.
// Sits on the Z_INDEX.wires layer — below nodes and ports, above the Konva canvas.
// Being on that layer is also what keeps a wire's delete button (#458) under
// an open Create form, the dock and the rail.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useConnectionStore, type Connection, type DragState } from "@/store/connection.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useViewport } from "@/store/viewport.store";
import { useToolStore } from "@/store/tool.store";
import { useSettings } from "@/store/settings.store";
import { boardKeyAllowed } from "@/lib/canvas/boardKeys";
import { COLORS, OUTPUT_HIT_RADIUS, SNAP_RADIUS, Z_INDEX } from "@/constants/canvas.constants";
import { boardCandidates } from "@/store/hover.store";
import { useLayerOrder } from "@/store/layerOrder.store";
import { hoverTargetAt } from "@/lib/canvas/hoverTarget";
import { boundsOf, type Bounds } from "@/lib/canvas/bounds";
import { useGenerating } from "@/store/generating.store";
import { toScreen, type Point } from "@/lib/canvas/coords";
import { inputPoint, outputPoint } from "@/lib/canvas/ports";
import {
  WIRE_BLOCK_REASONS, isLinkStyle, snapPort, sourceSpan, wireBlock, wireEnds, wirePath, wireStart,
} from "@/lib/canvas/wires";
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

  // Every output port: a source kind's, and an image's on the board (#460).
  const outputPorts: InputPortEntry[] = [
    ...panels
      .filter((p) => kindSpec(p.kind).isSource !== false)
      .map((p) => ({ nodeId: p.id, ...toScreen(outputPoint(p), vp) })),
    ...Object.values(konvaNodes)
      .filter((n) => !n.shape && !n.text)
      .map((n) => ({ nodeId: n.id, ...toScreen(outputPoint(n), vp) })),
  ];

  // The wire the pointer is over, for its delete button (#458).
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Whether a node can be wired into at all: a Create node with an input.
  const takesInput = (id: string) => {
    const p = panelById.get(id);
    return !!p && kindSpec(p.kind).acceptsInput !== false;
  };

  // A node's box on the board, panel or image.
  const boxOf = (id: string): Bounds | null => {
    const node = panelById.get(id) ?? konvaNodes[id];
    return node ? boundsOf(node) : null;
  };

  /**
   * The node under the pointer that wiring cares about, found as for hover,
   * topmost first (#458): a Create node or an image. A drawn shape, text or
   * a frame isn't wired at all, so over one counts as over nothing (#460).
   */
  const nodeUnder = (at: Point): string | null => {
    const point = { x: (at.x - vp.x) / vp.scale, y: (at.y - vp.y) / vp.scale };
    const id = hoverTargetAt(point, boardCandidates(), vp.scale, useLayerOrder.getState().topLayer);
    if (!id) return null;
    if (panelById.has(id)) return id;
    const k = konvaNodes[id];
    return k && !k.shape && !k.text ? id : null;
  };

  /**
   * Where the dragged wire would land with the pointer at `at`: the nearest
   * input port in snap range that can take it, else the input of the node
   * under the pointer (#458). Nodes are found as for hover, topmost first.
   */
  const dropTarget = (at: Point): InputPortEntry | null => {
    if (!drag || outputAt(at)) return null;
    const ports = inputPorts.filter((p) => wireBlock(p.nodeId, drag, connections, true) === null);
    const snapped = snapPort(ports, at, drag.fromNodeId);
    if (snapped) return snapped;
    const under = nodeUnder(at);
    return ports.find((p) => p.nodeId === under) ?? null;
  };

  /** Within snap range of a node's box on screen. */
  const nearBox = (at: Point, b: Bounds) =>
    at.x >= b.x * vp.scale + vp.x - SNAP_RADIUS && at.x <= (b.x + b.w) * vp.scale + vp.x + SNAP_RADIUS &&
    at.y >= b.y * vp.scale + vp.y - SNAP_RADIUS && at.y <= (b.y + b.h) * vp.scale + vp.y + SNAP_RADIUS;

  /**
   * The output port the pointer is on (#460), unless another node covers it
   * there: a covered port isn't drawn, and the pointer is on that node.
   */
  const outputAt = (at: Point): InputPortEntry | null => {
    const port = snapPort(outputPorts, at, null, OUTPUT_HIT_RADIUS);
    if (!port) return null;
    const under = nodeUnder(at);
    return !under || under === port.nodeId ? port : null;
  };

  // Set once the pointer has been clear of the source since the press, so
  // the source isn't red the moment a wire leaves it (#460).
  const leftSourceRef = useRef(false);

  /**
   * The node that can't take the wire with the pointer at `at`, why, and
   * which port shows it (#460): the node whose output the pointer is on;
   * else the owner of an input port in snap range when no port that can take
   * it is; else the node under the pointer. Undefined while the wire would
   * land somewhere, or over nothing.
   */
  const blockedAt = (at: Point): DragState["blocked"] => {
    if (!drag || dropTarget(at)) return undefined;
    const source = boxOf(drag.fromNodeId);
    if (source && !leftSourceRef.current && !nearBox(at, source)) leftSourceRef.current = true;
    const isSource = (id: string) => id === drag.fromNodeId;
    const out = outputAt(at);
    if (out) {
      if (isSource(out.nodeId) && !leftSourceRef.current) return undefined;
      return { nodeId: out.nodeId, block: isSource(out.nodeId) ? "self" : "output", port: "output" };
    }
    const nodeId = snapPort(inputPorts, at, null)?.nodeId ?? nodeUnder(at);
    if (!nodeId || (isSource(nodeId) && !leftSourceRef.current)) return undefined;
    const block = wireBlock(nodeId, drag, connections, takesInput(nodeId));
    return block ? { nodeId, block, port: "input" } : undefined;
  };

  // Always-fresh refs so pointer handlers never see stale data.
  const dropTargetRef = useRef(dropTarget);
  dropTargetRef.current = dropTarget;
  const blockedAtRef = useRef(blockedAt);
  blockedAtRef.current = blockedAt;

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
    leftSourceRef.current = false;

    const onMove = (e: PointerEvent) => {
      const store = useConnectionStore.getState();
      store.updateDrag(e.clientX, e.clientY);
      store.setBlocked(blockedAtRef.current({ x: e.clientX, y: e.clientY }));
      store.setLanding(dropTargetRef.current({ x: e.clientX, y: e.clientY })?.nodeId);
    };

    const onUp = (e: PointerEvent) => {
      const store = useConnectionStore.getState();
      // Escape already ended it.
      if (!store.drag) return;
      const before = store.connections;
      const target = dropTargetRef.current({ x: e.clientX, y: e.clientY });
      if (target) store.commitConnection(target.nodeId);
      // Over nothing, or a node that can't take it (#460): a new wire is
      // dropped, a moved one removed (#458).
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

  // The pointer shows it can't drop here (#460). On the root, so whatever
  // the pointer is over, its own cursor doesn't win.
  const blocked = drag?.blocked;
  useEffect(() => {
    if (!blocked) return;
    document.documentElement.classList.add("wire-blocked");
    return () => document.documentElement.classList.remove("wire-blocked");
  }, [blocked]);

  // Where the wire would land if let go now. Shown on the port only: the
  // node's blue outline (#458) went with #460, like red, on the connector.
  const snapTarget = drag ? dropTarget({ x: drag.cursorX, y: drag.cursorY }) : null;
  const targetBox = snapTarget ? boxOf(snapTarget.nodeId) : null;

  // An armed link tool draws every link in its style; otherwise the one
  // chosen in Settings (#214). Links store no style of their own.
  const linkStyle = isLinkStyle(activeTool) ? activeTool : settingsLinkStyle;

  // The live drag preview starts here; null once its source is gone.
  const fromPt = drag ? wireStart(drag, panelById, konvaNodes, vp) : null;
  const fromSpan = drag ? sourceSpan(drag, panelById, konvaNodes, vp) : null;

  return (
    <>
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
      </svg>

      {/* Why it can't (#460). Kept mounted through the drag so a screen reader
          hears each new reason. */}
      {drag && (
        <div
          role="status"
          className="board-wire-reason"
          style={{ left: drag.cursorX + 12, top: drag.cursorY + 16, zIndex: Z_INDEX.labels }}
        >
          {blocked ? WIRE_BLOCK_REASONS[blocked.block] : ""}
        </div>
      )}
    </>
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
