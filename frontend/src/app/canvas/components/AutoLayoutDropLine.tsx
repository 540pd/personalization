"use client";

// The line in an auto layout row showing where a dragged item would land
// (#228). DOM, like the names: a constant 2px at every zoom, over every node.

import { useLayoutDrop } from "@/store/layoutDrop.store";
import { useViewport } from "@/store/viewport.store";
import { COLORS, Z_INDEX } from "@/constants/canvas.constants";

const WIDTH = 2;

export default function AutoLayoutDropLine() {
  const line = useLayoutDrop((s) => s.line);
  const { x, y, scale } = useViewport();
  if (!line) return null;
  return (
    <div
      data-testid="auto-layout-drop-line"
      aria-hidden
      style={{
        position: "fixed",
        left: x + line.x * scale - WIDTH / 2,
        top: y + line.y * scale,
        width: WIDTH,
        height: line.h * scale,
        borderRadius: WIDTH / 2,
        background: COLORS.selected,
        pointerEvents: "none",
        zIndex: Z_INDEX.labels,
      }}
    />
  );
}
