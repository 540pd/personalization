"use client";

import { COLORS, SELECTION, Z_INDEX } from "@/constants/canvas.constants";

interface HoverOutlineProps {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Hover outline — replaces the move cursor as the "this is interactive"
// signal, matching uploaded images. The owner suppresses it while the node is
// active, since the selection box already draws a border.
export default function HoverOutline({ left, top, width, height }: HoverOutlineProps) {
  return (
    <div
      style={{
        position: "fixed",
        left,
        top,
        width,
        height,
        border: `${SELECTION.borderWidth}px solid ${COLORS.ink}`,
        borderRadius: 6,
        boxSizing: "border-box",
        pointerEvents: "none",
        zIndex: Z_INDEX.nodes + 1,
      }}
    />
  );
}
