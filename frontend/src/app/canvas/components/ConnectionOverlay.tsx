"use client";

// Full-screen SVG overlay that renders committed connection wires and
// the live drag-preview wire while the user is dragging from an output port.
// Sits on the Z_INDEX.wires layer — below nodes and ports, above the Konva canvas.

import { useEffect, useMemo, useRef } from "react";
import { useConnectionStore, type Connection } from "@/store/connection.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useViewport } from "@/store/viewport.store";
import { useToolStore } from "@/store/tool.store";
import { useSettings } from "@/store/settings.store";
import { boardKeyAllowed } from "@/lib/canvas/boardKeys";
import { COLORS, Z_INDEX } from "@/constants/canvas.constants";
import { useGenerating } from "@/store/generating.store";
import { toScreen, type Point } from "@/lib/canvas/coords";
import { inputPoint } from "@/lib/canvas/ports";
import { isLinkStyle, snapPort, sourceSpan, wireEnds, wirePath, wireStart } from "@/lib/canvas/wires";
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

  // Always-fresh ref so pointer handlers never see stale data.
  const inputPortsRef = useRef<InputPortEntry[]>(inputPorts);
  inputPortsRef.current = inputPorts;

  const dragFromIdRef = useRef<string | null>(null);
  if (drag) dragFromIdRef.current = drag.fromNodeId;

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
      const snap = snapPort(inputPortsRef.current, { x: e.clientX, y: e.clientY }, dragFromIdRef.current);
      if (snap) {
        const before = useConnectionStore.getState().connections;
        useConnectionStore.getState().commitConnection(snap.nodeId);
        // Duplicates and self-links are rejected without a change.
        if (useConnectionStore.getState().connections !== before) canvasHistory.commit();
      } else {
        useConnectionStore.getState().cancelDrag();
      }
    };

    // A cancelled drag drops the wire: it used to stay on the pointer.
    return trackPointer({ onMove, onUp, onCancel: () => useConnectionStore.getState().cancelDrag() });
  // Re-register only when a new drag starts (fromNodeId changes).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.fromNodeId]);

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

  // Snap target: the input port within SNAP_RADIUS of the cursor.
  const snapTarget = drag ? snapPort(inputPorts, { x: drag.cursorX, y: drag.cursorY }, drag.fromNodeId) : null;

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
        const ends = wireEnds(conn, panelById, konvaNodes, vp);
        if (!ends) return null;
        const d          = wirePath(ends.from, ends.to, linkStyle, ends.around);
        const isSelected = selectedIds.includes(conn.id);
        const className  = ["board-wire", isSelected && "is-selected", generating.has(conn.toNodeId) && "is-flowing"]
          .filter(Boolean)
          .join(" ");
        return (
          <g key={conn.id} className={className}>
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
          </g>
        );
      })}

      {/* Live drag preview */}
      {drag && fromPt && (
        <path
          d={wirePath(fromPt, snapTarget ?? { x: drag.cursorX, y: drag.cursorY }, linkStyle, { from: fromSpan ?? undefined })}
          className="board-wire-preview"
        />
      )}

      {/* Snap highlight ring around the target input port */}
      {drag && snapTarget && (
        <circle cx={snapTarget.x} cy={snapTarget.y} r={10} className="board-wire-snap" />
      )}
    </svg>
  );
}
