// The frames stage: a Konva stage of its own, under Board's (see FrameLayer).

import Konva from "konva";
import type { FrameDraft } from "@/store/frame.store";
import { useViewport } from "@/store/viewport.store";
import { selectOnly } from "@/lib/canvas/selection";
import { frameStage } from "@/lib/canvas/frameStage";
import { bindWheelZoom } from "@/lib/canvas/wheelZoom";
import { COLORS, FRAME_CORNER_RADIUS, FRAME_MIN_EDGE } from "@/constants/canvas.constants";
import { createSelectionTransformer } from "./transformer";
import { createHoverOutline, type HoverOutline } from "./hoverOutline";
import { createFrameRects } from "./frameRects";

export interface FrameStage {
  stage: Konva.Stage;
  layer: Konva.Layer;
  transformer: Konva.Transformer;
  hover: HoverOutline;
  rects: ReturnType<typeof createFrameRects>;
  /** The rectangle being dragged out right now, or none. */
  showDraft: (draft: FrameDraft | null) => void;
  dispose: () => void;
}

/** Builds the stage in `container`, at the shared viewport, and publishes it as frameStage. */
export function createFrameStage(container: HTMLDivElement): FrameStage {
  const { x, y, scale } = useViewport.getState();
  const stage = new Konva.Stage({
    container,
    width: container.offsetWidth,
    height: container.offsetHeight,
    x, y, scaleX: scale, scaleY: scale,
  });
  const layer = new Konva.Layer();
  stage.add(layer);

  // Styled exactly as a node's (board/transformer), so selecting a frame
  // and selecting a node look like the same act, corner handles included
  // (#160). One deliberate difference: a frame's corners stretch freely,
  // because it is a region whose width and height change independently,
  // where an image is a picture whose corners keep its ratio. Shift locks
  // the ratio, as on a shape.
  const transformer = createSelectionTransformer({
    keepRatio: false,
    ignoreStroke: true,
    // Without a floor an over-drag shrinks a frame to nothing it can be
    // grabbed by. FRAME_MIN_EDGE is screen px and the box arrives in screen
    // px, so the floor holds at every zoom without converting.
    minEdge: () => FRAME_MIN_EDGE,
  });
  layer.add(transformer);
  const hover = createHoverOutline(layer, transformer);

  // A click that misses every frame clears the frame selection. Clicks that
  // land on a node never reach this stage at all -- Board keeps its own
  // container interactive except over bare frame.
  stage.on("click tap", (e) => {
    if (e.target === stage) selectOnly(null);
  });

  // Over a bare frame the wheel lands here, not on Board's stage (#142).
  bindWheelZoom(stage);

  const observer = new ResizeObserver(() => {
    stage.width(container.offsetWidth);
    stage.height(container.offsetHeight);
  });
  observer.observe(container);

  let preview: Konva.Rect | null = null;
  const showDraft = (draft: FrameDraft | null) => {
    if (!draft) {
      preview?.destroy();
      preview = null;
      layer.batchDraw();
      return;
    }
    if (!preview) {
      preview = new Konva.Rect({
        fill: COLORS.frameFill,
        stroke: COLORS.selected,
        strokeWidth: 1,
        strokeScaleEnabled: false,
        dash: [4, 4],
        cornerRadius: FRAME_CORNER_RADIUS,
        listening: false,
      });
      layer.add(preview);
    }
    preview.setAttrs(draft);
    preview.moveToBottom();
    layer.batchDraw();
  };

  frameStage.current = stage;
  return {
    stage, layer, transformer, hover, showDraft,
    rects: createFrameRects(layer, transformer),
    dispose: () => {
      observer.disconnect();
      frameStage.current = null;
      stage.destroy();
    },
  };
}
