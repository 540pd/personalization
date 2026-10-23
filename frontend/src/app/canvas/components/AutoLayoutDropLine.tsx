"use client";

// The line in an auto layout row or column showing where a dragged item
// would land (#228, #230). DOM, like the names: a constant 2px at every zoom,
// over every node. Upright in a row, flat in a column.

import { useLayoutDrop } from "@/store/layoutDrop.store";
import { useViewport } from "@/store/viewport.store";
import { COLORS, Z_INDEX } from "@/constants/canvas.constants";

const WIDTH = 2;

export default function AutoLayoutDropLine() {
  const line = useLayoutDrop((s) => s.line);
  const { x, y, scale } = useViewport();
  if (!line) return null;
  const left = x + line.x * scale;
  const top = y + line.y * scale;
  const length = line.length * scale;
  return (
    <div
      data-testid="auto-layout-drop-line"
      aria-hidden
      style={{
        position: "fixed",
        left: line.vertical ? left - WIDTH / 2 : left,
        top: line.vertical ? top : top - WIDTH / 2,
        width: line.vertical ? WIDTH : length,
        height: line.vertical ? length : WIDTH,
        borderRadius: WIDTH / 2,
        background: COLORS.selected,
        pointerEvents: "none",
        zIndex: Z_INDEX.labels,
      }}
    />
  );
}
