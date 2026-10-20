// Moving a frame as a whole from a gesture that did not start on the frame's
// own rect (#119): a drag that begins on a node inside a selected frame, or on
// the frame's name.
//
// A selected frame is what a drag inside it should act on -- the selection
// says so. Without this, the press went to whatever node was under the
// pointer, the one-selection rule dropped the frame, and the node left on its
// own. A plain click still reaches the node: callers only hand over once the
// gesture has passed their own drag threshold.
//
// The frame's rect lives on its own stage, and the gesture did not start
// there, so it is driven from window pointer events rather than a Konva drag.

import type Konva from "konva";
import { useFrames, type FrameRecord } from "@/store/frame.store";
import { useViewport } from "@/store/viewport.store";
import { frameStage } from "@/lib/canvas/frameStage";
import { canvasHistory } from "@/lib/canvas/history";
import { selectOnly } from "@/lib/canvas/selection";
import { boundsOf, byArea, containsBox, type Bounds } from "@/lib/canvas/bounds";
import { childrenOf } from "./autoLayout";
import { membersOf, moveMembers } from "./frameMembers";
import { trackPointer } from "@/lib/dom/pointer";

/**
 * The selected frame `box` sits fully inside, if any.
 *
 * Several can be selected after Ctrl+A, and frames can overlap; the smallest
 * is the one the node most plainly belongs to.
 *
 * Not a Frame with auto layout that `nodeId` is a child of: there a drag on
 * a child moves the child, to reorder it or take it out (#228).
 */
export function selectedFrameAround(box: Bounds, nodeId?: string): FrameRecord | null {
  const { frames, selectedIds } = useFrames.getState();
  const around = selectedIds
    .map((id) => frames[id])
    .filter((f): f is FrameRecord => !!f && containsBox(boundsOf(f), box))
    .filter((f) => !(nodeId && f.layout && childrenOf(f.layout).includes(nodeId)));
  around.sort(byArea);
  return around[0] ?? null;
}

export interface FrameMove {
  /** The frame is `dx`, `dy` from where it was, in canvas units. */
  move(dx: number, dy: number): void;
  /** Lands it at the last offset, as one undo step. */
  end(): void;
}

/**
 * Moves `frame` and everything resting in it. Membership is fixed now, so a
 * node is not picked up or dropped halfway through just because the frame
 * swept over it. Shared by a drag on the frame's own rect (FrameLayer) and
 * one handed over from a node inside it (dragFrameFrom).
 */
export function beginFrameMove(frame: FrameRecord): FrameMove {
  const members = membersOf(frame);
  let dx = 0;
  let dy = 0;
  return {
    move(x, y) {
      dx = x;
      dy = y;
      // Everything resting on the frame travels with it.
      moveMembers(members, dx, dy);
      // The name renders from the store, so it reads the live offset to keep up.
      useFrames.getState().setDrag(frame.id, { dx, dy });
    },
    end() {
      useFrames.getState().clearDrag();
      useFrames.getState().upsert({ ...frame, canvasX: frame.canvasX + dx, canvasY: frame.canvasY + dy });
      // One step for the frame and everything it carried.
      canvasHistory.commit();
    },
  };
}

/**
 * Drag `frame` and everything resting in it, following the pointer from the
 * screen point where the gesture was pressed.
 *
 * Measured from the press rather than from whenever the caller noticed the
 * drag, so the frame does not lag the pointer by the drag threshold.
 * Membership is fixed now, as for a drag on the frame's bare area. The whole
 * move is one undo step.
 */
export function dragFrameFrom(frame: FrameRecord, press: { x: number; y: number }): void {
  const moving = beginFrameMove(frame);
  const rect = frameStage.current?.findOne<Konva.Rect>(`#${frame.id}`);
  let dx = 0;
  let dy = 0;

  // The frame is what is being moved, so it is what is selected.
  selectOnly("frame");
  useFrames.getState().select(frame.id);

  const apply = () => {
    rect?.position({ x: frame.canvasX + dx, y: frame.canvasY + dy });
    rect?.getLayer()?.batchDraw();
    moving.move(dx, dy);
  };

  const onMove = (e: PointerEvent) => {
    const scale = useViewport.getState().scale || 1;
    dx = (e.clientX - press.x) / scale;
    dy = (e.clientY - press.y) / scale;
    apply();
  };

  const onEnd = () => {
    // Last offset seen, not the end event's: a cancel carries no meaningful
    // position.
    apply();
    moving.end();
  };

  trackPointer({ onMove, onUp: onEnd, onCancel: onEnd });
}
