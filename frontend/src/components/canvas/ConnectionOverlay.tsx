"use client";

// Full-screen SVG overlay that renders committed connection wires and
// the live drag-preview wire while the user is dragging from an output port.
// Sits at zIndex 49 — below ports (51) but above the Konva canvas.

import { useEffect, useRef } from "react";
import { useConnectionStore, type Connection } from "@/lib/connectionStore";
import { useNodePanel } from "@/lib/nodePanelStore";
import { useKonvaNodes } from "@/lib/konvaNodesStore";
import { useViewport } from "@/lib/viewport";
import { useToolStore } from "@/lib/toolStore";
import type { PanelInstance } from "@/lib/nodePanelStore";
import type { KonvaNodeRecord } from "@/lib/konvaNodesStore";

const PORT_FRACTION = 0.3; // 30% from top — must match NodePanel.tsx and KonvaNodePorts.tsx
const SNAP_RADIUS   = 16;  // px — cursor snaps to input port within this radius

// ── Port position helpers ─────────────────────────────────────────────────────

function panelOutputPt(p: PanelInstance, sx: number, sy: number, sc: number) {
  const left = sx + p.canvasX * sc;
  const top  = sy + p.canvasY * sc - p.h / 2;
  return { x: left, y: top + p.h * PORT_FRACTION };
}

function panelInputPt(p: PanelInstance, sx: number, sy: number, sc: number) {
  const left = sx + p.canvasX * sc;
  const top  = sy + p.canvasY * sc - p.h / 2;
  return { x: left + p.w, y: top + p.h * PORT_FRACTION };
}

function konvaInputPt(n: KonvaNodeRecord, sx: number, sy: number, sc: number) {
  return {
    x: sx + n.canvasX * sc + n.canvasW * sc,
    y: sy + n.canvasY * sc + n.canvasH * sc * PORT_FRACTION,
  };
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
  const fromPanel = panels.find((p) => p.id === conn.fromNodeId);
  if (!fromPanel) return null;
  const from = panelOutputPt(fromPanel, sx, sy, sc);

  let toX: number, toY: number;
  if (conn.toNodeType === "panel") {
    const toPanel = panels.find((p) => p.id === conn.toNodeId);
    if (!toPanel) return null;
    ({ x: toX, y: toY } = panelInputPt(toPanel, sx, sy, sc));
  } else {
    const toNode = konvaNodes[conn.toNodeId];
    if (!toNode) return null;
    ({ x: toX, y: toY } = konvaInputPt(toNode, sx, sy, sc));
  }
  return { fromX: from.x, fromY: from.y, toX, toY };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface InputPortEntry {
  nodeId:   string;
  nodeType: "panel" | "konva";
  x: number;
  y: number;
}

export default function ConnectionOverlay() {
  const { connections, drag, selectedId } = useConnectionStore();
  const panels     = useNodePanel((s) => s.panels);
  const konvaNodes = useKonvaNodes((s) => s.nodes);
  const { x: sx, y: sy, scale: sc } = useViewport();
  const activeTool = useToolStore((s) => s.activeTool);

  // Build list of all valid input port positions (snap targets).
  const inputPorts: InputPortEntry[] = [
    ...panels.map((p) => ({ nodeId: p.id, nodeType: "panel" as const, ...panelInputPt(p, sx, sy, sc) })),
    ...Object.values(konvaNodes).map((n) => ({ nodeId: n.id, nodeType: "konva" as const, ...konvaInputPt(n, sx, sy, sc) })),
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
        useConnectionStore.getState().commitConnection(snap.nodeId, snap.nodeType);
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

  // Delete key removes the selected connection.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code !== "Delete" && e.code !== "Backspace") return;
      const { selectedId: sel } = useConnectionStore.getState();
      if (!sel) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      useConnectionStore.getState().removeConnection(sel);
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
    const fromPanel = panels.find((p) => p.id === drag.fromNodeId);
    if (fromPanel) {
      const from = panelOutputPt(fromPanel, sx, sy, sc);
      const toX  = snapTarget ? snapTarget.x : drag.cursorX;
      const toY  = snapTarget ? snapTarget.y : drag.cursorY;
      dragPreview = (
        <path
          d={buildPath(from.x, from.y, toX, toY, linkStyle)}
          fill="none"
          stroke="#000"
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
        zIndex: 49,
        overflow: "visible",
      }}
    >
      {/* Committed connection wires */}
      {connections.map((conn) => {
        const pts = resolveEndpoints(conn, panels, konvaNodes, sx, sy, sc);
        if (!pts) return null;
        const { fromX, fromY, toX, toY } = pts;
        const d       = buildPath(fromX, fromY, toX, toY, linkStyle);
        const isSelected = conn.id === selectedId;
        return (
          <g key={conn.id}>
            {/* Wide invisible hit area so thin lines are easy to click */}
            <path
              d={d}
              fill="none"
              stroke="#000"
              strokeWidth={12}
              strokeLinecap="round"
              opacity={0}
              style={{ pointerEvents: "stroke", cursor: "pointer" }}
              onClick={(e) => {
                e.stopPropagation();
                useConnectionStore.getState().selectConnection(conn.id);
              }}
            />
            {/* Visible wire */}
            <path
              d={d}
              fill="none"
              stroke={isSelected ? "#2563eb" : "#000"}
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
          fill="rgba(0,0,0,0.1)"
          stroke="#000"
          strokeWidth={1.5}
        />
      )}
    </svg>
  );
}
