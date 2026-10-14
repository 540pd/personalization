// Drag-to-draw frames.
//
// The gesture is captured on Board's stage, because that container is the one
// on top; the result is written to frame.store and painted by FrameLayer on
// its own stage underneath everything. Nothing frame-shaped is ever added to
// Board's layer.
//
// A frame is NOT a container: dragging one moves only the frame, and nodes
// resting on it stay where they are.
//
// Frame is the one dock entry where an armed tool genuinely fits: unlike
// Create and Upload, the tool really does describe what the next canvas
// gesture will do, so it stays lit until the drag finishes.

import type Konva from "konva";
import { useFrames } from "@/store/frame.store";
import { useToolStore } from "@/store/tool.store";
import { takenLabels, uniqueLabel } from "@/lib/canvas/labels";
import { selectOnly } from "@/lib/canvas/selection";
import { FRAME_MIN_EDGE } from "@/constants/canvas.constants";

export interface FrameDeps {
  saveSnapshot: () => void;
}

/** Normalised box from two corners, so dragging up or left still works. */
export function boxFromCorners(a: Konva.Vector2d, b: Konva.Vector2d) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

/**
 * Is this drag big enough to mean a frame?
 *
 * Measured on screen, not in canvas units: FRAME_MIN_EDGE is a screen size, so
 * comparing raw canvas units would make a legitimate small frame impossible to
 * draw at 50% and trivially easy at 150%.
 */
export function isDrawable(w: number, h: number, scale: number): boolean {
  return w * scale >= FRAME_MIN_EDGE && h * scale >= FRAME_MIN_EDGE;
}

export function createFrameHandlers(deps: FrameDeps) {
  let start: Konva.Vector2d | null = null;

  /** Begin a draw if the frame tool is armed. Says whether one began. */
  const onDown = (stage: Konva.Stage): boolean => {
    if (useToolStore.getState().activeTool !== "frame") return false;
    const pt = stage.getRelativePointerPosition();
    if (!pt) return false;
    start = pt;
    useFrames.getState().setDraft({ x: pt.x, y: pt.y, width: 0, height: 0 });
    return true;
  };

  const onMove = (stage: Konva.Stage) => {
    if (!start) return;
    const pt = stage.getRelativePointerPosition();
    if (!pt) return;
    useFrames.getState().setDraft(boxFromCorners(start, pt));
  };

  const onUp = (stage: Konva.Stage) => {
    if (!start) return;
    const draft = useFrames.getState().draft;
    start = null;
    useFrames.getState().setDraft(null);
    if (!draft) return;

    // A drag under the threshold is a misclick. Still return to pointer, so a
    // stray click does not leave the tool armed.
    if (!isDrawable(draft.width, draft.height, stage.scaleX())) {
      useToolStore.getState().setTool("pointer");
      return;
    }

    const id = crypto.randomUUID();
    useFrames.getState().upsert({
      id,
      canvasX: draft.x, canvasY: draft.y,
      canvasW: draft.width, canvasH: draft.height,
      label: uniqueLabel("Frame", takenLabels()),
    });
    // The new frame is the selection, alone: a node or panel selected before
    // the draw would otherwise keep its handles beside the frame's (#107).
    selectOnly("frame");
    useFrames.getState().select(id);
    useToolStore.getState().setTool("pointer");
    deps.saveSnapshot();
  };

  /** Escape, or the pointer leaving the board: abandon without creating. */
  const cancel = () => {
    if (!start) return;
    start = null;
    useFrames.getState().setDraft(null);
  };

  return { onDown, onMove, onUp, cancel };
}
