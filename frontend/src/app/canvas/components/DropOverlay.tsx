"use client";

import { useCanvasArea } from "../canvasArea";
import { COLORS, Z_INDEX } from "@/constants/canvas.constants";

/**
 * Drop affordance. Inset to the visible canvas rather than the window, so it
 * does not draw underneath the sidebar. pointer-events: none is
 * load-bearing: an overlay that swallowed the drop would stop it ever
 * reaching the window listener.
 */
export default function DropOverlay() {
  // Tracks the sidebar collapse and resizes.
  const area = useCanvasArea();
  return (
    <div
      data-testid="canvas-drop-overlay"
      style={{
        position: "fixed",
        left: area.left ?? 0,
        top: area.top ?? 0,
        width: area.width,
        height: area.height,
        pointerEvents: "none",
        zIndex: Z_INDEX.dropOverlay,
        background: "rgba(0,0,0,0.04)",
        border: `2px dashed ${COLORS.ink}`,
        borderRadius: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span
        style={{
          fontSize: 13,
          color: COLORS.ink,
          background: COLORS.paper,
          padding: "6px 12px",
          borderRadius: 999,
          boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
        }}
      >
        Drop images to add them to the board
      </span>
    </div>
  );
}
