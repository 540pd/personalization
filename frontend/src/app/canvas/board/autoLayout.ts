// Auto layout for Frames (#225).
//
// One click lines up everything in a Frame: one row, in left-to-right order,
// FRAME_LAYOUT_PADDING around and FRAME_LAYOUT_GAP between, aligned to the
// top, with the Frame hugging the row and its top-left corner staying put.
// Removing it leaves everything where it is.
//
// The row is a row of columns (#230): dropping an item on another's top or
// bottom stacks them in one column, aligned to the left (autoLayoutDrop). A
// plain row is one item per column; a single column is one stack.
//
// Resizing the Frame rearranges its items, live, to the shape being dragged:
// a row, a column, or a compact rectangle; on release it snaps to fit (#232).
//
// While it is on, the Frame keeps its children by id (FrameRecord.layout), and
// it is laid out again whenever they change: one deleted or resized, a panel
// growing, or one dragged out (dropped clear of the Frame, it leaves). That
// runs after the change, never inside it, so it is not an undo step of its
// own: undo puts back the state before the change, and the layout follows
// from that again. When nothing is left in it, auto layout turns off.

import type Konva from "konva";
import { useFrames, type FrameLayout, type FrameRecord } from "@/store/frame.store";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { boardStage } from "@/lib/canvas/boardStage";
import { boundsOf, overlaps, type Bounds } from "@/lib/canvas/bounds";
import { canvasHistory } from "@/lib/canvas/history";
import { FRAME_LAYOUT_GAP, FRAME_LAYOUT_PADDING } from "@/constants/canvas.constants";
import { syncNodeGeometry } from "./geometry";
import { membersOf } from "./frameMembers";

/** A child's box in canvas units, y the top edge. */
export interface ChildBox extends Bounds {
  id: string;
}

export interface GridLayout {
  /** Where each child's top-left goes. */
  positions: Record<string, { x: number; y: number }>;
  /** The Frame's size, hugging everything. */
  w: number;
  h: number;
}

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
): GridLayout {
  const positions: GridLayout["positions"] = {};
  let x = padding;
  let tallest = 0;
  let placed = 0;
  for (const col of columns) {
    if (!col.length) continue;
    if (placed++) x += gap;
    let y = padding;
    let widest = 0;
    col.forEach((b, i) => {
      if (i) y += gap;
      positions[b.id] = { x: origin.x + x, y: origin.y + y };
      y += b.h;
      widest = Math.max(widest, b.w);
    });
    x += widest;
    tallest = Math.max(tallest, y - padding);
  }
  return { positions, w: x + padding, h: tallest + 2 * padding };
}

/** The boxes of these ids now, in this order. Ones that are gone are left out. */
export function childBoxes(ids: string[]): ChildBox[] {
  const nodes = useKonvaNodes.getState().nodes;
  const panels = useNodePanel.getState().panels;
  return ids.flatMap((id) => {
    const node = nodes[id];
    if (node) return [{ id, ...boundsOf(node) }];
    const panel = panels.find((p) => p.id === id);
    return panel ? [{ id, ...boundsOf(panel) }] : [];
  });
}

/** Within half a canvas unit: close enough not to move anything. */
const near = (a: number, b: number) => Math.abs(a - b) < 0.5;

/** Move each child whose box isn't already at its position. */
function place(boxes: ChildBox[], positions: GridLayout["positions"]): void {
  const stage = boardStage.current;
  const nodes = useKonvaNodes.getState();
  const panelMoves: Record<string, { x: number; y: number }> = {};

  boxes.forEach((b) => {
    const to = positions[b.id];
    if (!to || (near(b.x, to.x) && near(b.y, to.y))) return;
    if (nodes.nodes[b.id]) {
      // A Konva node's record is its own x and y, as with a Frame drag.
      const node = stage?.findOne<Konva.Shape>(`#${b.id}`);
      if (node) {
        node.position(to);
        // Through syncNodeGeometry, so a line's ends move with it.
        syncNodeGeometry(node);
      } else {
        nodes.upsert({ ...nodes.nodes[b.id], canvasX: to.x, canvasY: to.y });
      }
      return;
    }
    // A panel's canvasY is its vertical centre.
    panelMoves[b.id] = { x: to.x, y: to.y + b.h / 2 };
  });

  if (Object.keys(panelMoves).length) useNodePanel.getState().setCanvasPositions(panelMoves);
  stage?.batchDraw();
}

/** Has this Frame anything to lay out? An empty one can't take auto layout. */
export function canAutoLayout(frame: FrameRecord): boolean {
  if (frame.layout) return true;
  const m = membersOf(frame);
  return m.images.length + m.panels.length > 0;
}

/** Turn auto layout on: one item per column, left to right. One undo step. */
export function applyAutoLayout(id: string): boolean {
  const frame = useFrames.getState().frames[id];
  if (!frame || frame.layout) return false;
  const m = membersOf(frame);
  const boxes = orderChildren(childBoxes([...m.images, ...m.panels].map((c) => c.id)));
  if (!boxes.length) return false;

  const grid = layoutColumns({ x: frame.canvasX, y: frame.canvasY }, boxes.map((b) => [b]));
  place(boxes, grid.positions);
  useFrames.getState().upsert({
    ...frame, canvasW: grid.w, canvasH: grid.h, layout: { columns: boxes.map((b) => [b.id]) },
  });
  canvasHistory.commit();
  return true;
}

/** Turn auto layout off: nothing moves, the Frame keeps its size. One undo step. */
export function removeAutoLayout(id: string): boolean {
  const frame = useFrames.getState().frames[id];
  if (!frame?.layout) return false;
  // undefined rather than left out: upsert merges, and would keep the old one.
  useFrames.getState().upsert({ ...frame, layout: undefined });
  canvasHistory.commit();
  return true;
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
): { columns: string[][]; w: number; h: number } {
  const columns: string[][] = Array.from({ length: count }, () => []);
  const heights: number[] = Array(count).fill(0);
  const widths: number[] = Array(count).fill(0);
  for (const b of boxes) {
    const i = heights.indexOf(Math.min(...heights));
    heights[i] += (columns[i].length ? gap : 0) + b.h;
    widths[i] = Math.max(widths[i], b.w);
    columns[i].push(b.id);
  }
  const used = columns.filter((c) => c.length);
  return {
    columns: used,
    w: 2 * padding + widths.reduce((sum, x) => sum + x, 0) + gap * (used.length - 1),
    h: 2 * padding + Math.max(...heights),
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
 * A resize of a Frame with auto layout is starting (#232): its items in the
 * reading order they have now, kept for the whole gesture so they don't
 * reshuffle as they move.
 */
export function startRearrange(frameId: string): ChildBox[] {
  const layout = useFrames.getState().frames[frameId]?.layout;
  return layout ? readingOrder(childBoxes(childrenOf(layout))) : [];
}

/**
 * Lay `order` out for the box being dragged, live: packed to its shape,
 * from its top-left. Nothing is stored. Returns the columns.
 */
export function rearrangeLive(order: ChildBox[], box: Bounds): string[][] {
  const columns = packToShape(order, box);
  const byId = new Map(order.map((b) => [b.id, b]));
  const grid = layoutColumns({ x: box.x, y: box.y }, columns.map((col) => col.map((id) => byId.get(id)!)));
  place(childBoxes(order.map((b) => b.id)), grid.positions);
  return columns;
}

/**
 * The resize is over: the arrangement for the final box is stored, and the
 * Frame snaps to fit its items. The caller commits the undo step.
 */
export function finishRearrange(frameId: string, order: ChildBox[], box: Bounds): void {
  const frame = useFrames.getState().frames[frameId];
  if (!frame?.layout) return;
  // The items into the final shape before the Frame takes it: the
  // re-layout below would otherwise find them outside it, and drop them.
  const columns = rearrangeLive(order, box);
  useFrames.getState().upsert({
    ...frame, canvasX: box.x, canvasY: box.y, canvasW: box.w, canvasH: box.h,
    layout: { ...frame.layout, columns: columns.length ? columns : frame.layout.columns },
  });
  reflowAutoLayouts();
}

/** `columns` without these ids, and without any column that leaves empty. */
export function withoutIds(columns: string[][], ids: Set<string>): string[][] {
  return columns
    .map((col) => col.filter((c) => !ids.has(c)))
    .filter((col) => col.length > 0);
}

/**
 * Lay every auto-layout Frame out again to match its children now. Not an
 * undo step: see the top of this file. Says whether anything changed.
 */
export function reflowAutoLayouts(): boolean {
  let changed = false;
  for (const frame of Object.values(useFrames.getState().frames)) {
    if (!frame.layout) continue;
    const area: Bounds = { x: frame.canvasX, y: frame.canvasY, w: frame.canvasW, h: frame.canvasH };
    const present = frame.layout.columns.map((col) => childBoxes(col));
    // Dropped clear of the Frame: it has left the layout.
    const left = new Set(present.flat().filter((b) => !overlaps(area, b)).map((b) => b.id));
    const columns = left.size ? withoutIds(frame.layout.columns, left) : frame.layout.columns;
    const boxes = present.map((col) => col.filter((b) => !left.has(b.id)));

    if (!boxes.some((col) => col.length)) {
      // Nothing left in it: auto layout turns off, and the Frame keeps its
      // size. Only with the board up -- while a board loads, its nodes are
      // not all known yet, and an empty-looking Frame is not empty.
      if (boardStage.current) {
        useFrames.getState().upsert({ ...frame, layout: undefined });
        changed = true;
      }
      continue;
    }

    const grid = layoutColumns({ x: frame.canvasX, y: frame.canvasY }, boxes);
    const flat = boxes.flat();
    const moves = flat.some((b) => !near(b.x, grid.positions[b.id].x) || !near(b.y, grid.positions[b.id].y));
    if (moves) place(flat, grid.positions);
    const resized = !near(grid.w, frame.canvasW) || !near(grid.h, frame.canvasH);
    if (left.size || resized) {
      useFrames.getState().upsert({ ...frame, canvasW: grid.w, canvasH: grid.h, layout: { columns } });
    }
    changed ||= moves || left.size > 0 || resized;
  }
  return changed;
}

/**
 * Keep auto layouts current: after every change to the board, once the
 * pointer is up. Never mid-gesture, or a child being dragged out would be
 * pulled back into its slot under the pointer. Returns a stop function.
 */
export function startAutoLayoutSync(): () => void {
  let pointerDown = false;
  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (pointerDown) return;
      if (!Object.values(useFrames.getState().frames).some((f) => f.layout)) return;
      reflowAutoLayouts();
    });
  };
  const down = () => { pointerDown = true; };
  const up = () => { pointerDown = false; schedule(); };

  window.addEventListener("pointerdown", down, true);
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", up, true);
  const unsubscribe = [
    canvasHistory.subscribe(schedule),
    useKonvaNodes.subscribe(schedule),
    useNodePanel.subscribe(schedule),
    useFrames.subscribe((s, prev) => { if (s.frames !== prev.frames) schedule(); }),
  ];
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("pointerdown", down, true);
    window.removeEventListener("pointerup", up, true);
    window.removeEventListener("pointercancel", up, true);
    unsubscribe.forEach((u) => u());
  };
}
