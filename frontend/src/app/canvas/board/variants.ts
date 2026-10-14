// Image variants: N results of one Create Image, as N Create Image nodes in
// a Frame of their own.
//
// The node the user configured is the first variant and does not move; the
// frame grows from it, right then down, and the copies fill the remaining
// cells. Every copy carries the source's model, prompt and settings, so any
// one of them can be tweaked and regenerated on its own.

import type { Bounds } from "@/lib/canvas/bounds";

/** Space between neighbouring variants, in canvas units. */
export const VARIANT_GAP = 24;
/** Inset from the frame's edge to the first row and column. */
export const VARIANT_PADDING = 32;

export interface VariantLayout {
  frame: Bounds;
  /** Top-left of each cell, in reading order. Cell 0 is the source node. */
  cells: { x: number; y: number }[];
}

/**
 * A grid as close to square as the count allows, built around the source.
 *
 * Cells take the source node's size, which its aspect ratio already decided,
 * and every variant is a copy of that node, so they are the same size too.
 * Cell 0 is exactly where the source already sits: generating more than one
 * image must not move the node the user was working on.
 */
export function layoutVariants(count: number, source: Bounds): VariantLayout {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const frame: Bounds = {
    x: source.x - VARIANT_PADDING,
    y: source.y - VARIANT_PADDING,
    w: VARIANT_PADDING * 2 + cols * source.w + (cols - 1) * VARIANT_GAP,
    h: VARIANT_PADDING * 2 + rows * source.h + (rows - 1) * VARIANT_GAP,
  };
  const cells = Array.from({ length: count }, (_, i) => ({
    x: source.x + (i % cols) * (source.w + VARIANT_GAP),
    y: source.y + Math.floor(i / cols) * (source.h + VARIANT_GAP),
  }));
  return { frame, cells };
}
