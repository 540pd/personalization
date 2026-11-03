"use client";

// Full-screen SVG overlay that renders committed connection wires and
// the live drag-preview wire while the user is dragging from an output port.
// Sits on the Z_INDEX.wires layer — below nodes and ports, above the Konva canvas.
// Being on that layer is also what keeps a wire's delete button (#458) under
// an open Create form, the dock and the rail.
//
// This file only draws (#466): the board as the wire rules see it is
// useWireScene, a drag is useWireDrag, undo and Delete are useWireCommands,
// and the rules themselves are lib/canvas/wireTargets.

import { useState } from "react";
import { useConnectionStore } from "@/store/connection.store";
import { useToolStore } from "@/store/tool.store";
import { useSettings } from "@/store/settings.store";
import { useGenerating } from "@/store/generating.store";
import { Z_INDEX } from "@/constants/canvas.constants";
import { WIRE_BLOCK_REASONS, isLinkStyle, sourceSpan, spanOf, wireEnds, wirePath, wireStart } from "@/lib/canvas/wires";
import { dropTarget } from "@/lib/canvas/wireTargets";
import { useWireScene } from "./useWireScene";
import { useWireDrag } from "./useWireDrag";
import { useWireCommands } from "./useWireCommands";
import Wire from "./Wire";
import "../Connections.scss";

export default function ConnectionOverlay() {
  const { connections, drag, selectedIds } = useConnectionStore();
  const activeTool = useToolStore((s) => s.activeTool);
  const settingsLinkStyle = useSettings((s) => s.settings.linkStyle);
  // Wires into a node that is generating move (#456).
  const generating = useGenerating((s) => s.ids);
  const { scene, panelById, konvaNodes } = useWireScene();
  const { vp } = scene;
  useWireDrag(scene, drag);
  useWireCommands();

  // The wire the pointer is over, for its delete button (#458).
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Where the wire would land if let go now. Shown on the port only: the
  // node's blue outline (#458) went with #460, like red, on the connector.
  const snapTarget = drag ? dropTarget(scene, drag, { x: drag.cursorX, y: drag.cursorY }) : null;
  const targetNode = snapTarget ? (panelById.get(snapTarget.nodeId) ?? konvaNodes[snapTarget.nodeId]) : undefined;

  // An armed link tool draws every link in its style; otherwise the one
  // chosen in Settings (#214). Links store no style of their own.
  const linkStyle = isLinkStyle(activeTool) ? activeTool : settingsLinkStyle;

  // The live drag preview starts here; null once its source is gone.
  const fromPt = drag ? wireStart(drag, panelById, konvaNodes, vp) : null;
  const fromSpan = drag ? sourceSpan(drag, panelById, konvaNodes, vp) : null;
  const blocked = drag?.blocked;

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
          const selected = selectedIds.includes(conn.id);
          return (
            <Wire
              key={conn.id}
              id={conn.id}
              d={wirePath(ends.from, ends.to, linkStyle, ends.around)}
              selected={selected}
              flowing={generating.has(conn.toNodeId)}
              showDelete={!drag && (selected || hoveredId === conn.id)}
              onHover={(over) => setHoveredId((id) => (over ? conn.id : id === conn.id ? null : id))}
            />
          );
        })}

        {/* Live drag preview */}
        {drag && fromPt && (
          <path
            d={wirePath(fromPt, snapTarget ?? { x: drag.cursorX, y: drag.cursorY }, linkStyle, {
              from: fromSpan ?? undefined,
              to: targetNode ? spanOf(targetNode, vp) : undefined,
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
