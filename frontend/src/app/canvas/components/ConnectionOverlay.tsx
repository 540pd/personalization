"use client";

// Full-screen SVG overlay that renders committed connection wires and
// the live drag-preview wire while the user is dragging from an output port.
// Sits on the Z_INDEX.wires layer — below nodes and ports, above the Konva canvas.

import { useEffect, useRef } from "react";
import { useConnectionStore, type Connection } from "@/store/connection.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useViewport } from "@/store/viewport.store";
import { useToolStore } from "@/store/tool.store";
import type { PanelInstance } from "@/store/nodePanel.store";
import type { KonvaNodeRecord } from "@/store/konvaNodes.store";
import { COLORS, SNAP_RADIUS, Z_INDEX } from "@/constants/canvas.constants";
import { toScreen } from "@/lib/canvas/coords";
import { inputPoint, outputPoint } from "@/lib/canvas/ports";

// ── Port position helpers ─────────────────────────────────────────────────────
// Convention (standard, matches ComfyUI/Blueprint): output = RIGHT edge, input = LEFT edge.
// Konva nodes (uploaded images) are source-only: right-edge output port, no input port.

// Port geometry is shared (lib/canvas/ports); these just place it on screen.
// Keeping the conversion out of the port maths is what makes the same
// functions usable by the occlusion tests, which work in canvas units.
function panelOutputPt(p: PanelInstance, sx: number, sy: number, sc: number) {
  return toScreen(outputPoint(p), { x: sx, y: sy, scale: sc });
}

function panelInputPt(p: PanelInstance, sx: number, sy: number, sc: number) {
  return toScreen(inputPoint(p), { x: sx, y: sy, scale: sc });
}

function konvaOutputPt(n: KonvaNodeRecord, sx: number, sy: number, sc: number) {
  return toScreen(outputPoint(n), { x: sx, y: sy, scale: sc });
}

// ── Wire path builders ────────────────────────────────────────────────────────

function buildPath(x1: number, y1: number, x2: number, y2: number, style: string): string {
  if (style === "link-straight") {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  if (style === "link-elbow") {
    const mx = (x1 + x2) / 2;
    return `M ${x1} ${y1} L ${mx} ${y1} L ${mx} ${y2} L ${x2} ${y2}`;
  }
  // Cubic Bezier (default — link-curve)
  const bend = Math.max(Math.abs(x2 - x1) * 0.5, 40);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1} ${x2 - bend} ${y2} ${x2} ${y2}`;
}

// ── Endpoint resolver ─────────────────────────────────────────────────────────

function resolveEndpoints(
  conn: Connection,
  panels: PanelInstance[],
  konvaNodes: Record<string, KonvaNodeRecord>,
  sx: number, sy: number, sc: number,
): { fromX: number; fromY: number; toX: number; toY: number } | null {
  let fromX: number, fromY: number;
  if (conn.fromNodeType === "konva") {
    const fromNode = konvaNodes[conn.fromNodeId];
    if (!fromNode) return null;
    ({ x: fromX, y: fromY } = konvaOutputPt(fromNode, sx, sy, sc));
  } else {
    const fromPanel = panels.find((p) => p.id === conn.fromNodeId);
    if (!fromPanel) return null;
    ({ x: fromX, y: fromY } = panelOutputPt(fromPanel, sx, sy, sc));
  }

  // Only panels have input ports
  const toPanel = panels.find((p) => p.id === conn.toNodeId);
  if (!toPanel) return null;
  const { x: toX, y: toY } = panelInputPt(toPanel, sx, sy, sc);

  return { fromX, fromY, toX, toY };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface InputPortEntry {
  nodeId:   string;
  nodeType: "panel";
  x: number;
  y: number;
}

export default function ConnectionOverlay() {
  const { connections, drag, selectedIds } = useConnectionStore();
  const panels     = useNodePanel((s) => s.panels);
  const konvaNodes = useKonvaNodes((s) => s.nodes);
  const { x: sx, y: sy, scale: sc } = useViewport();
  const activeTool = useToolStore((s) => s.activeTool);

  // Only panels have input ports (konva nodes are output-only sources).
  const inputPorts: InputPortEntry[] = [
    ...panels.map((p) => ({ nodeId: p.id, nodeType: "panel" as const, ...panelInputPt(p, sx, sy, sc) })),
  ];

  // Always-fresh ref so pointer handlers never see stale data.
  const inputPortsRef = useRef<InputPortEntry[]>(inputPorts);
  inputPortsRef.current = inputPorts;

  const dragFromIdRef = useRef<string | null>(null);
  if (drag) dragFromIdRef.current = drag.fromNodeId;

  // Global pointer listeners — registered only while a drag is active.
  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      useConnectionStore.getState().updateDrag(e.clientX, e.clientY);
    };

    const onUp = (e: PointerEvent) => {
      const fromId = dragFromIdRef.current;
      const snap = inputPortsRef.current.find(
        (p) => p.nodeId !== fromId &&
               Math.hypot(e.clientX - p.x, e.clientY - p.y) < SNAP_RADIUS
      );
      if (snap) {
        useConnectionStore.getState().commitConnection(snap.nodeId);
      } else {
        useConnectionStore.getState().cancelDrag();
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup",   onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup",   onUp);
    };
  // Re-register only when a new drag starts (fromNodeId changes).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.fromNodeId]);

  // Delete key removes all selected connections.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code !== "Delete" && e.code !== "Backspace") return;
      const { selectedIds } = useConnectionStore.getState();
      if (!selectedIds.length) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      selectedIds.forEach((id) => useConnectionStore.getState().removeConnection(id));
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, []);

  // Snap target: nearest input port within SNAP_RADIUS of the cursor.
  const snapTarget = drag
    ? inputPorts.find(
        (p) => p.nodeId !== drag.fromNodeId &&
               Math.hypot(drag.cursorX - p.x, drag.cursorY - p.y) < SNAP_RADIUS
      ) ?? null
    : null;

  const linkStyle =
    activeTool === "link-straight" ? "link-straight" :
    activeTool === "link-elbow"    ? "link-elbow"    : "link-curve";

  // Drag preview
  let dragPreview: React.ReactNode = null;
  if (drag) {
    let fromPt: { x: number; y: number } | null = null;
    if (drag.fromNodeType === "konva") {
      const fromNode = konvaNodes[drag.fromNodeId];
      if (fromNode) fromPt = konvaOutputPt(fromNode, sx, sy, sc);
    } else {
      const fromPanel = panels.find((p) => p.id === drag.fromNodeId);
      if (fromPanel) fromPt = panelOutputPt(fromPanel, sx, sy, sc);
    }
    if (fromPt) {
      const toX = snapTarget ? snapTarget.x : drag.cursorX;
      const toY = snapTarget ? snapTarget.y : drag.cursorY;
      dragPreview = (
        <path
          d={buildPath(fromPt.x, fromPt.y, toX, toY, linkStyle)}
          fill="none"
          stroke={COLORS.ink}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeDasharray="5 3"
          opacity={0.5}
        />
      );
    }
  }

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
        const pts = resolveEndpoints(conn, panels, konvaNodes, sx, sy, sc);
        if (!pts) return null;
        const { fromX, fromY, toX, toY } = pts;
        const d          = buildPath(fromX, fromY, toX, toY, linkStyle);
        const isSelected = selectedIds.includes(conn.id);
        return (
          <g key={conn.id}>
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
                if (e.ctrlKey || e.metaKey) {
                  useConnectionStore.getState().addConnectionToSelection(conn.id);
                } else {
                  useConnectionStore.getState().selectConnection(conn.id);
                  useKonvaSelection.getState().deselect();
                  useNodePanel.getState().closeAllPanels();
                }
              }}
            />
            {/* Visible wire */}
            <path
              d={d}
              fill="none"
              stroke={isSelected ? COLORS.selected : COLORS.ink}
              strokeWidth={isSelected ? 2 : 1.5}
              strokeLinecap="round"
              style={{ pointerEvents: "none" }}
            />
          </g>
        );
      })}

      {/* Live drag preview */}
      {dragPreview}

      {/* Snap highlight ring around the target input port */}
      {drag && snapTarget && (
        <circle
          cx={snapTarget.x}
          cy={snapTarget.y}
          r={8}
          fill={COLORS.snapFill}
          stroke={COLORS.ink}
          strokeWidth={1.5}
        />
      )}
    </svg>
  );
}
