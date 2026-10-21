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
//
// The maths is in ./arrange; this file reads the board and writes it back.

import type Konva from "konva";
import { useFrames, type FrameRecord } from "@/store/frame.store";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { boardStage } from "@/lib/canvas/boardStage";
import { boundsOf, type Bounds } from "@/lib/canvas/bounds";
import { canvasHistory } from "@/lib/canvas/history";
import { listen } from "@/lib/dom/listen";
import { syncNodeGeometry } from "../geometry";
import { membersOf } from "../frameMembers";
import {
  arrangeFor, childrenOf, layoutColumns, near, orderChildren, planReflow, readingOrder,
  type ChildBox, type GridLayout,
} from "./arrange";

export {
  childrenOf, layoutColumns, orderChildren, packColumns, packToShape, readingOrder, withoutIds,
  type ChildBox, type GridLayout,
} from "./arrange";

/** The boxes of these ids now, in this order. Ones that are gone are left out. */
export function childBoxes(ids: string[]): ChildBox[] {
  const nodes = useKonvaNodes.getState().nodes;
  const panels = useNodePanel.getState().panels;
  return ids.flatMap((id) => {
    const node = nodes[id];
    if (node) return [{ id, ...boundsOf(node), named: !!node.label }];
    const panel = panels.find((p) => p.id === id);
    return panel ? [{ id, ...boundsOf(panel), named: !!panel.label }] : [];
  });
}

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
  const { columns, grid } = arrangeFor(order, box);
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

/**
 * Lay every auto-layout Frame out again to match its children now. Not an
 * undo step: see the top of this file. Says whether anything changed.
 */
export function reflowAutoLayouts(): boolean {
  let changed = false;
  for (const frame of Object.values(useFrames.getState().frames)) {
    if (!frame.layout) continue;
    const plan = planReflow(boundsOf(frame), frame.layout.columns, frame.layout.columns.map((col) => childBoxes(col)));

    if (plan.empty) {
      // Nothing left in it: auto layout turns off, and the Frame keeps its
      // size. Only with the board up -- while a board loads, its nodes are
      // not all known yet, and an empty-looking Frame is not empty.
      if (boardStage.current) {
        useFrames.getState().upsert({ ...frame, layout: undefined });
        changed = true;
      }
      continue;
    }

    const { grid, left, moves, resized } = plan;
    if (moves) place(plan.boxes.flat(), grid.positions);
    if (left || resized) {
      useFrames.getState().upsert({ ...frame, canvasW: grid.w, canvasH: grid.h, layout: { columns: plan.columns } });
    }
    changed ||= moves || left || resized;
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

  const unsubscribe = [
    listen(window, "pointerdown", down, true),
    listen(window, "pointerup", up, true),
    listen(window, "pointercancel", up, true),
    canvasHistory.subscribe(schedule),
    useKonvaNodes.subscribe(schedule),
    useNodePanel.subscribe(schedule),
    useFrames.subscribe((s, prev) => { if (s.frames !== prev.frames) schedule(); }),
  ];
  return () => {
    cancelAnimationFrame(frame);
    unsubscribe.forEach((u) => u());
  };
}
