// Auto layout for Frames (#225).
//
// One click lines up everything in a Frame: one row, in left-to-right order,
// FRAME_LAYOUT_PADDING around and FRAME_LAYOUT_GAP between, aligned to the
// top, with the Frame hugging the row and its top-left corner staying put.
// No settings, as in Luma. Removing it leaves everything where it is.
//
// While it is on, the Frame keeps its children by id (FrameRecord.layout), and
// the row is laid out again whenever they change: one deleted or resized, a
// panel growing, or one dragged out (dropped clear of the Frame, it leaves).
// That runs after the change, never inside it, so it is not an undo step of
// its own: undo puts back the state before the change, and the layout follows
// from that again.

import type Konva from "konva";
import { useFrames, type FrameRecord } from "@/store/frame.store";
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

export interface RowLayout {
  /** Where each child's top-left goes. */
  positions: Record<string, { x: number; y: number }>;
  /** The Frame's size, hugging the row. */
  w: number;
  h: number;
}

/**
 * The order children take: left to right, ties by top edge. The one place
 * that decides it, so an option for top to bottom only has to change this.
 */
export function orderChildren(boxes: ChildBox[]): ChildBox[] {
  return [...boxes].sort((a, b) => a.x - b.x || a.y - b.y);
}

/** One row from `origin` (the Frame's top-left), in the order given. */
export function layoutRow(
  origin: { x: number; y: number },
  ordered: ChildBox[],
  padding = FRAME_LAYOUT_PADDING,
  gap = FRAME_LAYOUT_GAP,
): RowLayout {
  const positions: RowLayout["positions"] = {};
  let x = origin.x + padding;
  let tallest = 0;
  ordered.forEach((b, i) => {
    if (i > 0) x += gap;
    positions[b.id] = { x, y: origin.y + padding };
    x += b.w;
    tallest = Math.max(tallest, b.h);
  });
  return { positions, w: x - origin.x + padding, h: tallest + 2 * padding };
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
function place(boxes: ChildBox[], positions: RowLayout["positions"]): void {
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

/** Turn auto layout on: one undo step. Says whether it did. */
export function applyAutoLayout(id: string): boolean {
  const frame = useFrames.getState().frames[id];
  if (!frame || frame.layout) return false;
  const m = membersOf(frame);
  const boxes = orderChildren(childBoxes([...m.images, ...m.panels].map((c) => c.id)));
  if (!boxes.length) return false;

  const row = layoutRow({ x: frame.canvasX, y: frame.canvasY }, boxes);
  place(boxes, row.positions);
  useFrames.getState().upsert({
    ...frame, canvasW: row.w, canvasH: row.h, layout: { children: boxes.map((b) => b.id) },
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
 * Lay every auto-layout Frame out again to match its children now. Not an
 * undo step: see the top of this file. Says whether anything changed.
 */
export function reflowAutoLayouts(): boolean {
  let changed = false;
  for (const frame of Object.values(useFrames.getState().frames)) {
    if (!frame.layout) continue;
    const area: Bounds = { x: frame.canvasX, y: frame.canvasY, w: frame.canvasW, h: frame.canvasH };
    const present = childBoxes(frame.layout.children);
    // Dropped clear of the Frame: it has left the layout.
    const left = new Set(present.filter((b) => !overlaps(area, b)).map((b) => b.id));
    const boxes = present.filter((b) => !left.has(b.id));
    const children = left.size
      ? frame.layout.children.filter((c) => !left.has(c))
      : frame.layout.children;

    if (!boxes.length) {
      // Nothing left to hug: the Frame keeps its size.
      if (left.size) {
        useFrames.getState().upsert({ ...frame, layout: { children } });
        changed = true;
      }
      continue;
    }

    const row = layoutRow({ x: frame.canvasX, y: frame.canvasY }, boxes);
    const moves = boxes.some((b) => !near(b.x, row.positions[b.id].x) || !near(b.y, row.positions[b.id].y));
    if (moves) place(boxes, row.positions);
    if (left.size || !near(row.w, frame.canvasW) || !near(row.h, frame.canvasH)) {
      useFrames.getState().upsert({ ...frame, canvasW: row.w, canvasH: row.h, layout: { children } });
    }
    changed ||= moves || left.size > 0 || !near(row.w, frame.canvasW) || !near(row.h, frame.canvasH);
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
