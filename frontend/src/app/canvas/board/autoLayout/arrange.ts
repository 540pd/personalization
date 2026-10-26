// The maths of auto layout (#225): where each item goes and how big the Frame
// is, from boxes alone. No store, no Konva, no history -- ./index reads the
// boxes off the board and writes the answers back.

import type { FrameLayout } from "@/store/frame.store";
import { overlaps, type Bounds } from "@/lib/canvas/bounds";
import {
  FRAME_LAYOUT_GAP, FRAME_LAYOUT_NAME_BAND, FRAME_LAYOUT_NAME_TOP, FRAME_LAYOUT_PADDING,
} from "@/constants/canvas.constants";

/** A child's box in canvas units, y the top edge. */
export interface ChildBox extends Bounds {
  id: string;
  /** Shows a name above it, so needs FRAME_LAYOUT_NAME_BAND of room there (#235). */
  named?: boolean;
}

export interface GridLayout {
  /** Where each child's top-left goes. */
  positions: Record<string, { x: number; y: number }>;
  /** The Frame's size, hugging everything. */
  w: number;
  h: number;
}

/** Within half a canvas unit: close enough not to move anything. */
export const near = (a: number, b: number) => Math.abs(a - b) < 0.5;

/**
 * Where each column's first item starts, below the Frame's top: under a name
 * band when any of them has a name, so the items' tops still line up across
 * the row, with FRAME_LAYOUT_NAME_TOP above the names (#235); else the padding.
 */
const firstTop = (firsts: (ChildBox | undefined)[], padding: number, band: number) =>
  firsts.some((b) => b?.named) ? FRAME_LAYOUT_NAME_TOP + band : padding;

/** Every child id in a layout, column by column. */
export const childrenOf = (layout: FrameLayout): string[] => layout.columns.flat();

/**
 * The order children take when auto layout is turned on: left to right,
 * ties by top edge.
 */
export function orderChildren(boxes: ChildBox[]): ChildBox[] {
  return [...boxes].sort((a, b) => a.x - b.x || a.y - b.y);
}

/**
 * Columns side by side, aligned to the top; each one's children stacked,
 * aligned to the left. From `origin`, the Frame's top-left. A column with no
 * boxes in it takes no space.
 */
export function layoutColumns(
  origin: { x: number; y: number },
  columns: ChildBox[][],
  padding = FRAME_LAYOUT_PADDING,
  gap = FRAME_LAYOUT_GAP,
  band = FRAME_LAYOUT_NAME_BAND,
): GridLayout {
  const positions: GridLayout["positions"] = {};
  const top = firstTop(columns.map((col) => col[0]), padding, band);
  let x = padding;
  let bottom = 0;
  let placed = 0;
  for (const col of columns) {
    if (!col.length) continue;
    if (placed++) x += gap;
    let y = top;
    let widest = 0;
    col.forEach((b, i) => {
      // Below the first, a named item's band comes after the gap.
      if (i) y += gap + (b.named ? band : 0);
      positions[b.id] = { x: origin.x + x, y: origin.y + y };
      y += b.h;
      widest = Math.max(widest, b.w);
    });
    x += widest;
    bottom = Math.max(bottom, y);
  }
  return { positions, w: x + padding, h: bottom + padding };
}

/**
 * `boxes`, in this order, packed into `count` columns: each goes into the
 * shortest column so far (ties: the leftmost). Rows needn't line up. With
 * the Frame's size around them.
 */
export function packColumns(
  boxes: ChildBox[],
  count: number,
  padding = FRAME_LAYOUT_PADDING,
  gap = FRAME_LAYOUT_GAP,
  band = FRAME_LAYOUT_NAME_BAND,
): { columns: string[][]; w: number; h: number } {
  const columns: string[][] = Array.from({ length: count }, () => []);
  const heights: number[] = Array(count).fill(0);
  const widths: number[] = Array(count).fill(0);
  for (const b of boxes) {
    const i = heights.indexOf(Math.min(...heights));
    // Heights as layoutColumns draws them: a named item's band counts.
    heights[i] += (columns[i].length ? gap + (b.named ? band : 0) : 0) + b.h;
    widths[i] = Math.max(widths[i], b.w);
    columns[i].push(b.id);
  }
  const used = columns.filter((c) => c.length);
  return {
    columns: used,
    w: 2 * padding + widths.reduce((sum, x) => sum + x, 0) + gap * (used.length - 1),
    // The first `count` boxes start the columns (each goes into an empty one).
    h: firstTop(boxes.slice(0, count), padding, band) + Math.max(...heights) + padding,
  };
}

/**
 * The packing of these boxes, in this order, whose shape is closest to
 * `target`'s (#232). Every column count is tried; the one whose width to
 * height is nearest the target's, compared as ratios, wins; ties go to fewer
 * columns. So a short, wide target gives a row, a tall, narrow one a column,
 * and one in between a compact rectangle.
 */
export function packToShape(boxes: ChildBox[], target: { w: number; h: number }): string[][] {
  if (!boxes.length) return [];
  const want = Math.log(Math.max(target.w, 1) / Math.max(target.h, 1));
  let best: { columns: string[][]; off: number } | null = null;
  for (let k = 1; k <= boxes.length; k++) {
    const p = packColumns(boxes, k);
    const off = Math.abs(Math.log(p.w / p.h) - want);
    if (!best || off < best.off - 1e-9) best = { columns: p.columns, off };
  }
  return best!.columns;
}

/**
 * Items in reading order: top to bottom, then left to right along a row
 * (within half a unit). A resize packs them in this order (#232), so a row
 * reads left to right, a column top to bottom, and a grid row by row.
 */
export function readingOrder(boxes: ChildBox[]): ChildBox[] {
  return [...boxes].sort((a, b) => (Math.abs(a.y - b.y) < 0.5 ? a.x - b.x : a.y - b.y));
}

/**
 * `order` arranged for the box being dragged: packed to its shape, laid out
 * from its top-left (#232).
 */
export function arrangeFor(order: ChildBox[], box: Bounds): { columns: string[][]; grid: GridLayout } {
  const columns = packToShape(order, box);
  const byId = new Map(order.map((b) => [b.id, b]));
  const grid = layoutColumns({ x: box.x, y: box.y }, columns.map((col) => col.map((id) => byId.get(id)!)));
  return { columns, grid };
}

/** `columns` without these ids, and without any column that leaves empty. */
export function withoutIds(columns: string[][], ids: Set<string>): string[][] {
  return columns
    .map((col) => col.filter((c) => !ids.has(c)))
    .filter((col) => col.length > 0);
}

/** What laying one Frame out again comes to; see planReflow. */
export type ReflowPlan =
  | { empty: true }
  | {
      empty: false;
      /** The layout's columns, without any child that has left. */
      columns: string[][];
      /** The children that stay, column by column. */
      boxes: ChildBox[][];
      grid: GridLayout;
      /** Some child has left the layout. */
      left: boolean;
      /** Some child is not where the layout puts it. */
      moves: boolean;
      /** The Frame is not the size the layout hugs. */
      resized: boolean;
    };

/**
 * Laying a Frame at `area` out again, given its layout's `columns` and the
 * boxes of those children that are still on the board (`present`, column by
 * column). A child dropped clear of the Frame has left the layout; with
 * nothing left, the plan is `empty`.
 */
export function planReflow(area: Bounds, columns: string[][], present: ChildBox[][]): ReflowPlan {
  // Dropped clear of the Frame: it has left the layout.
  const left = new Set(present.flat().filter((b) => !overlaps(area, b)).map((b) => b.id));
  const boxes = present.map((col) => col.filter((b) => !left.has(b.id)));
  if (!boxes.some((col) => col.length)) return { empty: true };

  const grid = layoutColumns({ x: area.x, y: area.y }, boxes);
  return {
    empty: false,
    columns: left.size ? withoutIds(columns, left) : columns,
    boxes,
    grid,
    left: left.size > 0,
    moves: boxes.flat().some((b) => !near(b.x, grid.positions[b.id].x) || !near(b.y, grid.positions[b.id].y)),
    resized: !near(grid.w, area.w) || !near(grid.h, area.h),
  };
}
