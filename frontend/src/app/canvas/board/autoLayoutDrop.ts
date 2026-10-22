// Dragging into and within an auto layout row (#228).
//
// While one item is dragged with the pointer over a Frame with auto layout,
// a line shows the slot it would land in. On the drop the Frame's child list
// changes -- reordered, joined, or left -- and autoLayout's re-layout puts
// everything in place. The list changes before the drag's own undo commit, so
// the drop and the new order are one step.
//
// The pointer decides, not the item's box: over the Frame means in it. A
// large panel half over the edge would otherwise be anyone's guess.

import { useFrames, type FrameRecord } from "@/store/frame.store";
import { useLayoutDrop, type DropLine } from "@/store/layoutDrop.store";
import { containsBox, contains, type Bounds } from "@/lib/canvas/bounds";
import type { Point } from "@/lib/canvas/coords";
import { FRAME_LAYOUT_PADDING } from "@/constants/canvas.constants";
import { childBoxes, type ChildBox } from "./autoLayout";

const areaOf = (f: FrameRecord): Bounds => ({ x: f.canvasX, y: f.canvasY, w: f.canvasW, h: f.canvasH });
const byArea = (a: FrameRecord, b: FrameRecord) => a.canvasW * a.canvasH - b.canvasW * b.canvasH;

/** The smallest Frame with auto layout under `pt`, if any. */
export function layoutFrameAt(pt: Point): FrameRecord | null {
  return Object.values(useFrames.getState().frames)
    .filter((f) => f.layout && contains(areaOf(f), pt))
    .sort(byArea)[0] ?? null;
}

/** The Frame whose row `id` is in, if any. */
function rowOf(id: string): FrameRecord | null {
  return Object.values(useFrames.getState().frames).find((f) => f.layout?.children.includes(id)) ?? null;
}

/**
 * Which of the row's other children `pt` falls before: the slot is after
 * every child whose middle is left of the pointer.
 */
export function slotIndex(others: ChildBox[], pt: Point): number {
  return others.filter((b) => b.x + b.w / 2 < pt.x).length;
}

/** The line for slot `index` among `others`, in the Frame `frame`. */
export function slotLine(frame: Bounds, others: ChildBox[], index: number): DropLine {
  const pad = FRAME_LAYOUT_PADDING;
  const y = frame.y + pad;
  const h = others.length ? Math.max(...others.map((b) => b.h)) : frame.h - 2 * pad;
  if (!others.length) return { x: frame.x + pad / 2, y, h };
  if (index === 0) return { x: others[0].x - pad / 2, y, h };
  const prev = others[index - 1];
  if (index === others.length) return { x: prev.x + prev.w + pad / 2, y, h };
  return { x: (prev.x + prev.w + others[index].x) / 2, y, h };
}

/** The row's children other than `id`, as they stand. */
const othersIn = (frame: FrameRecord, id: string) =>
  childBoxes(frame.layout!.children.filter((c) => c !== id));

/** Show, move or hide the line for `id` dragged to `pt`. */
export function trackLayoutDrag(id: string, pt: Point): void {
  const frame = layoutFrameAt(pt);
  if (!frame) {
    useLayoutDrop.getState().setLine(null);
    return;
  }
  const others = othersIn(frame, id);
  useLayoutDrop.getState().setLine(slotLine(areaOf(frame), others, slotIndex(others, pt)));
}

/** The drag is over without a drop to make: hide the line. */
export function clearLayoutDrag(): void {
  useLayoutDrop.getState().setLine(null);
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * `id` was dropped at `pt`: reorder it, move it into a row, or take it out of
 * one. Call before the drag's undo commit. Says whether a row changed.
 */
export function dropIntoLayout(id: string, pt: Point): boolean {
  clearLayoutDrag();
  const { upsert } = useFrames.getState();
  const source = rowOf(id);
  const target = layoutFrameAt(pt);
  let changed = false;

  if (source && source.id !== target?.id) {
    // Left its row: dropped outside it, or into another. (Over its own
    // Frame, layoutFrameAt would have found it.)
    upsert({ ...source, layout: { children: source.layout!.children.filter((c) => c !== id) } });
    changed = true;
  }
  if (!target) return changed;

  const current = useFrames.getState().frames[target.id];
  const others = othersIn(current, id);
  const index = slotIndex(others, pt);
  const without = current.layout!.children.filter((c) => c !== id);
  // Before the child now in that slot, or at the end. Ids of deleted
  // children stay in the list (#225) and keep their places around it.
  const at = index < others.length ? without.indexOf(others[index].id) : without.length;
  const next = [...without.slice(0, at), id, ...without.slice(at)];
  if (!sameList(next, current.layout!.children)) {
    upsert({ ...current, layout: { children: next } });
    changed = true;
  }
  return changed;
}

/**
 * A new item joins the end of a row: one drawn fully inside a Frame with
 * auto layout, or, given `pt`, text clicked or an image dropped there.
 * Call before the creation's undo commit. Says whether it joined.
 */
export function joinLayout(id: string, pt?: Point): boolean {
  if (rowOf(id)) return false;
  const box = childBoxes([id])[0];
  if (!box) return false;
  const frame = pt
    ? layoutFrameAt(pt)
    : Object.values(useFrames.getState().frames)
        .filter((f) => f.layout && containsBox(areaOf(f), box))
        .sort(byArea)[0] ?? null;
  if (!frame) return false;
  useFrames.getState().upsert({ ...frame, layout: { children: [...frame.layout!.children, id] } });
  return true;
}
