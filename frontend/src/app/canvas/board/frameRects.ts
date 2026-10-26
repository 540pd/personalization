// The frame rects on the frames stage, built from the store.

import Konva from "konva";
import { useFrames, type FrameRecord } from "@/store/frame.store";
import { selectOnly } from "@/lib/canvas/selection";
import { canvasHistory } from "@/lib/canvas/history";
import { announceGesture } from "@/lib/canvas/gesture";
import { boundsOf } from "@/lib/canvas/bounds";
import { COLORS, FRAME_CORNER_RADIUS } from "@/constants/canvas.constants";
import { beginFrameMove, type FrameMove } from "./frameDrag";
import { nodeBox } from "./geometry";
import { finishRearrange, rearrangeLive, startRearrange, type ChildBox } from "./autoLayout";

/**
 * Builds the rects for `layer` and wires their drag and resize. The gesture
 * state lives here, shared by every rect, so it outlives a rebuild.
 * `transformer` is the frames' own, so a rebuild can drop a resize it cuts short.
 */
export function createFrameRects(layer: Konva.Layer, transformer?: Konva.Transformer) {
  // Membership is fixed when the drag starts, so a node is not picked up or
  // dropped halfway through just because the frame swept over it.
  let move: FrameMove | null = null;
  let dragFrom = { x: 0, y: 0 };
  // One object per resize gesture, shared by every frame it resizes, so the
  // gesture commits a single undo step however many frames it touched.
  let resizeKey: object | null = null;
  // Per Frame with auto layout being resized: its items in the order they
  // had when the resize began, repacked live to the dragged shape (#232).
  const rearranging = new Map<string, ChildBox[]>();

  const createRect = (f: FrameRecord) => {
    const rect = new Konva.Rect({
      id: f.id,
      name: "frame",
      x: f.canvasX, y: f.canvasY, width: f.canvasW, height: f.canvasH,
      fill: COLORS.frameFill,
      stroke: f.stroke ?? COLORS.frameStroke,
      strokeWidth: 1,
      strokeScaleEnabled: false,
      cornerRadius: FRAME_CORNER_RADIUS,
      draggable: true,
    });

    rect.on("mousedown touchstart", () => {
      // Takes the selection off nodes, panels and wires, so Delete can only
      // mean one thing.
      selectOnly("frame");
      useFrames.getState().select(f.id);
    });

    rect.on("dragstart", () => {
      move = beginFrameMove(f);
      dragFrom = { x: rect.x(), y: rect.y() };
    });

    // The name keeps up too, instead of arriving when the drag ends.
    const moveTo = () => move?.move(rect.x() - dragFrom.x, rect.y() - dragFrom.y);
    rect.on("dragmove", moveTo);

    rect.on("dragend", () => {
      moveTo();
      move?.end();
      move = null;
    });

    // Konva scales rather than resizes, so bake the scale back into width
    // and height -- otherwise the 1px border would be scaled too and the
    // stored size would not match what is drawn.
    rect.on("transformstart", () => {
      resizeKey ??= {};
      if (f.layout) rearranging.set(f.id, startRearrange(f.id));
      // The style bar steps aside while a frame is resized (#163).
      announceGesture(true);
    });
    // The name renders from the store, so it reads the live box to keep up
    // (#156). Not an upsert: that would rebuild the rect mid-gesture.
    rect.on("transform", () => {
      const box = nodeBox(rect);
      useFrames.getState().setResize(f.id, box);
      // With auto layout, its items follow the shape being dragged (#232).
      const order = rearranging.get(f.id);
      if (order) rearrangeLive(order, boundsOf(box));
    });
    rect.on("transformend", () => {
      announceGesture(false);
      const w = Math.max(1, rect.width() * rect.scaleX());
      const h = Math.max(1, rect.height() * rect.scaleY());
      rect.scale({ x: 1, y: 1 });
      rect.size({ width: w, height: h });
      const order = rearranging.get(f.id);
      rearranging.delete(f.id);
      if (order) {
        // Packed to the final shape, then snapped to fit: one step (#232).
        finishRearrange(f.id, order, { x: rect.x(), y: rect.y(), w, h });
      } else {
        useFrames.getState().upsert({
          ...f, canvasX: rect.x(), canvasY: rect.y(), canvasW: w, canvasH: h,
        });
      }
      useFrames.getState().clearResize(f.id);
      // A resize is its own undo step (#128). Without this the next commit
      // -- a move, say -- folded the new size into a step whose undo went
      // back past it, and an undo straight after a resize removed the
      // frame. Frames resized together by one transformer each end here,
      // in the same tick, so they share a key and make one step.
      const key = resizeKey ?? {};
      canvasHistory.commit(key);
      queueMicrotask(() => {
        if (resizeKey === key) resizeKey = null;
      });
    });

    return rect;
  };

  /**
   * Rebuild rather than reconcile: a board holds a handful of frames, and
   * writes only happen on dragend/transformend, so this never runs mid-gesture.
   */
  const render = (frames: Record<string, FrameRecord>) => {
    // Delete / undo / redo mid-resize: drop the resize without saving it (#183).
    if (transformer?.isTransforming()) {
      transformer.nodes([]);
      transformer.stopTransform();
      announceGesture(false);
      resizeKey = null;
    }

    layer.find(".frame").forEach((n) => n.destroy());
    Object.values(frames).forEach((f) => {
      const rect = createRect(f);
      layer.add(rect);
      rect.moveToBottom();
    });
    layer.batchDraw();
  };

  return { render };
}

/**
 * Attach the transformer to whatever is selected.
 *
 * Deliberately NOT part of the rebuild above. Selecting a frame happens on
 * mousedown, which is the first half of a drag -- so folding this into the
 * rebuild destroys the very rect the gesture is holding, and the frame
 * stops moving. It survived single-id selection only because setting the
 * same id twice returned the identical string and React bailed out; a
 * selectedIds array is a fresh reference every time and does not.
 *
 * So it runs after every rebuild too, to re-attach to the new rects rather
 * than point at destroyed ones.
 */
export function selectFrameRects(layer: Konva.Layer, transformer: Konva.Transformer, ids: string[]): void {
  // Escape mid-resize: end it while still attached, so transformend saves it (#183).
  if (transformer.isTransforming()) transformer.stopTransform();

  const selected = ids
    .map((id) => layer.findOne<Konva.Rect>(`#${id}`))
    .filter((r): r is Konva.Rect => !!r);
  transformer.nodes(selected);
  // Every Frame has its corners. On one with auto layout, dragging one
  // rearranges its items to the shape being dragged (#232).
  transformer.moveToTop();
  layer.batchDraw();
}
