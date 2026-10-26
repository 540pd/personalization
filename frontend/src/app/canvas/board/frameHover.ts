// Hover outline on frames: the same "you can grab this" cue a node shows.
//
// Driven from window pointermove rather than the rect's mouseenter and
// mouseleave, because the frames stage only receives events while Board lets
// them through -- over bare frame. Move from a frame onto a node and Board
// takes the pointer back, so mouseleave never arrives and the outline would
// stick. Instead, walk down the elements under the cursor:
//   this stage first         -> the frame there, if any, is hovered
//   Board's canvas, on a node -> the node wins; no frame outline
//   Board's canvas, empty     -> transparent there, keep looking beneath
//   anything else             -> a panel, label or the dock is on top

import type Konva from "konva";
import { boardStage } from "@/lib/canvas/boardStage";
import { listen } from "@/lib/dom/listen";
import type { HoverOutline } from "./hoverOutline";

/** The frame rect under the client point, if nothing covers it there. */
export function frameAt(stage: Konva.Stage, x: number, y: number): Konva.Rect | null {
  const board = boardStage.current;
  for (const el of document.elementsFromPoint(x, y)) {
    if (stage.container().contains(el)) {
      const r = stage.container().getBoundingClientRect();
      const shape = stage.getIntersection({ x: x - r.left, y: y - r.top });
      return shape?.hasName("frame") ? (shape as Konva.Rect) : null;
    }
    if (board?.container().contains(el)) {
      const r = board.container().getBoundingClientRect();
      if (board.getIntersection({ x: x - r.left, y: y - r.top })) return null;
      continue;
    }
    return null;
  }
  return null;
}

/** Follows the pointer with the frames stage's hover outline, once there is one. */
export function bindFrameHover(current: () => { stage: Konva.Stage; hover: HoverOutline } | null): () => void {
  return listen(window, "pointermove", (e: PointerEvent) => {
    const parts = current();
    if (!parts) return;
    const rect = frameAt(parts.stage, e.clientX, e.clientY);
    if (rect) parts.hover.show(rect);
    else parts.hover.hide();
  });
}
