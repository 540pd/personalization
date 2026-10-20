// Dragging into and within an auto layout Frame (#228, #230).
//
// While one item is dragged with the pointer over a Frame with auto layout,
// a line shows where it would land. Over another item, which side of it the
// pointer is nearest decides (#230): its left or right puts the new one
// beside it, in a column of its own; its top or bottom stacks it in that
// item's column. Over the padding or a gap, it becomes a new column between
// the others, as in #228.
//
// On the drop the Frame's columns change -- reordered, joined, or left -- and
// autoLayout's re-layout puts everything in place. The columns change before
// the drag's own undo commit, so the drop and the new layout are one step.
//
// The pointer decides, not the item's box: over the Frame means in it. A
// large panel half over the edge would otherwise be anyone's guess.

import { useFrames, type FrameRecord } from "@/store/frame.store";
import { useLayoutDrop, type DropLine } from "@/store/layoutDrop.store";
import { containsBox, contains, type Bounds } from "@/lib/canvas/bounds";
import type { Point } from "@/lib/canvas/coords";
import { FRAME_LAYOUT_GAP, FRAME_LAYOUT_NAME_BAND, FRAME_LAYOUT_PADDING } from "@/constants/canvas.constants";
import { childBoxes, childrenOf, withoutIds, type ChildBox } from "./autoLayout";

const areaOf = (f: FrameRecord): Bounds => ({ x: f.canvasX, y: f.canvasY, w: f.canvasW, h: f.canvasH });
const byArea = (a: FrameRecord, b: FrameRecord) => a.canvasW * a.canvasH - b.canvasW * b.canvasH;

/** The smallest Frame with auto layout under `pt`, if any. */
export function layoutFrameAt(pt: Point): FrameRecord | null {
  return Object.values(useFrames.getState().frames)
    .filter((f) => f.layout && contains(areaOf(f), pt))
    .sort(byArea)[0] ?? null;
}

/** The Frame whose layout `id` is in, if any. */
function layoutOf(id: string): FrameRecord | null {
  return Object.values(useFrames.getState().frames)
    .find((f) => f.layout && childrenOf(f.layout).includes(id)) ?? null;
}

export type Side = "left" | "right" | "top" | "bottom";

/**
 * Which side of `box` the pointer is nearest. The box is split corner to
 * corner: the pointer's offset from the centre, as a share of half the width
 * and half the height, decides -- the same on a wide image and a tall panel.
 */
export function sideOf(box: Bounds, pt: Point): Side {
  const dx = (pt.x - (box.x + box.w / 2)) / (box.w / 2 || 1);
  const dy = (pt.y - (box.y + box.h / 2)) / (box.h / 2 || 1);
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy < 0 ? "top" : "bottom";
}

/** Where a drop goes: a new column at `index`, or into column `column` at `index`. */
export type Placement =
  | { kind: "column"; index: number }
  | { kind: "stack"; column: number; index: number };

interface Column {
  /** Its index in the layout's columns. */
  index: number;
  ids: string[];
  boxes: ChildBox[];
  /** Around its boxes. */
  bounds: Bounds;
}

const boundsAround = (boxes: ChildBox[]): Bounds => {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return {
    x, y,
    w: Math.max(...boxes.map((b) => b.x + b.w)) - x,
    h: Math.max(...boxes.map((b) => b.y + b.h)) - y,
  };
};

/**
 * Where an item dropped at `pt` in a Frame at `frame` would go, and the line
 * that shows it. `columns` are the Frame's columns without the item.
 */
export function dropTarget(frame: Bounds, columns: string[][], pt: Point): { placement: Placement; line: DropLine } {
  const pad = FRAME_LAYOUT_PADDING;
  const gap = FRAME_LAYOUT_GAP;
  // The columns with something on the board in them, as they stand.
  const cols: Column[] = columns.flatMap((ids, index) => {
    const boxes = childBoxes(ids);
    return boxes.length ? [{ index, ids, boxes, bounds: boundsAround(boxes) }] : [];
  });

  // Over an item: beside it, or stacked on it.
  for (const col of cols) {
    const hit = col.boxes.find((b) => contains(b, pt));
    if (!hit) continue;
    const side = sideOf(hit, pt);
    if (side === "left" || side === "right") {
      const after = side === "right";
      return {
        placement: { kind: "column", index: col.index + (after ? 1 : 0) },
        line: {
          x: after ? col.bounds.x + col.bounds.w + gap / 2 : col.bounds.x - gap / 2,
          y: col.bounds.y, length: col.bounds.h, vertical: true,
        },
      };
    }
    const below = side === "bottom";
    return {
      placement: { kind: "stack", column: col.index, index: col.ids.indexOf(hit.id) + (below ? 1 : 0) },
      line: {
        x: col.bounds.x, length: col.bounds.w, vertical: false,
        // Above a named item, the gap is above its name band (#235).
        y: below ? hit.y + hit.h + gap / 2 : hit.y - (hit.named ? FRAME_LAYOUT_NAME_BAND : 0) - gap / 2,
      },
    };
  }

  // Over the padding or a gap: a new column, before the first whose middle
  // is right of the pointer.
  const tallest = cols.length ? Math.max(...cols.map((c) => c.bounds.h)) : frame.h - 2 * pad;
  if (!cols.length) {
    return {
      placement: { kind: "column", index: 0 },
      line: { x: frame.x + pad / 2, y: frame.y + pad, length: tallest, vertical: true },
    };
  }
  const next = cols.find((c) => c.bounds.x + c.bounds.w / 2 > pt.x);
  if (!next) {
    const last = cols[cols.length - 1];
    return {
      placement: { kind: "column", index: columns.length },
      line: { x: last.bounds.x + last.bounds.w + gap / 2, y: frame.y + pad, length: tallest, vertical: true },
    };
  }
  return {
    placement: { kind: "column", index: next.index },
    line: { x: next.bounds.x - gap / 2, y: frame.y + pad, length: tallest, vertical: true },
  };
}

/** `columns` with `id` put where `placement` says. */
export function placeInto(columns: string[][], id: string, placement: Placement): string[][] {
  if (placement.kind === "column") {
    return [...columns.slice(0, placement.index), [id], ...columns.slice(placement.index)];
  }
  return columns.map((col, i) =>
    i === placement.column ? [...col.slice(0, placement.index), id, ...col.slice(placement.index)] : col,
  );
}

/** Show, move or hide the line for `id` dragged to `pt`. */
export function trackLayoutDrag(id: string, pt: Point): void {
  const frame = layoutFrameAt(pt);
  if (!frame?.layout) {
    useLayoutDrop.getState().setLine(null);
    return;
  }
  const columns = withoutIds(frame.layout.columns, new Set([id]));
  useLayoutDrop.getState().setLine(dropTarget(areaOf(frame), columns, pt).line);
}

/** The drag is over without a drop to make: hide the line. */
export function clearLayoutDrag(): void {
  useLayoutDrop.getState().setLine(null);
}

const same = (a: string[][], b: string[][]) => JSON.stringify(a) === JSON.stringify(b);

/**
 * `id` was dropped at `pt`: move it within a layout, into one, or out of one.
 * Call before the drag's undo commit. Says whether a layout changed.
 */
export function dropIntoLayout(id: string, pt: Point): boolean {
  clearLayoutDrag();
  const { upsert } = useFrames.getState();
  const source = layoutOf(id);
  const target = layoutFrameAt(pt);
  let changed = false;

  if (source?.layout && source.id !== target?.id) {
    // Left it: dropped outside it, or into another. (Over its own Frame,
    // layoutFrameAt would have found it.) If that empties it, the re-layout
    // turns its auto layout off.
    upsert({ ...source, layout: { columns: withoutIds(source.layout.columns, new Set([id])) } });
    changed = true;
  }
  if (!target?.layout) return changed;

  const current = useFrames.getState().frames[target.id];
  const columns = withoutIds(current.layout!.columns, new Set([id]));
  const next = placeInto(columns, id, dropTarget(areaOf(current), columns, pt).placement);
  if (!same(next, current.layout!.columns)) {
    upsert({ ...current, layout: { columns: next } });
    changed = true;
  }
  return changed;
}

/**
 * A new item joins as a column at the end: one drawn fully inside a Frame
 * with auto layout, or, given `pt`, text clicked or an image dropped there.
 * Call before the creation's undo commit. Says whether it joined.
 */
export function joinLayout(id: string, pt?: Point): boolean {
  if (layoutOf(id)) return false;
  const box = childBoxes([id])[0];
  if (!box) return false;
  const frame = pt
    ? layoutFrameAt(pt)
    : Object.values(useFrames.getState().frames)
        .filter((f) => f.layout && containsBox(areaOf(f), box))
        .sort(byArea)[0] ?? null;
  if (!frame?.layout) return false;
  useFrames.getState().upsert({ ...frame, layout: { columns: [...frame.layout.columns, [id]] } });
  return true;
}
