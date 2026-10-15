// Drag-to-draw for the Shapes menu.
//
// Same gesture as the frame draw (board/frame.ts) and fed by the same window
// pointer events in Board, so it survives crossing labels, ports and Create
// nodes the way #118 made frames do. The difference is where the result
// goes: a frame is a record painted on its own stage, while a shape is an
// ordinary selectable node on Board's layer -- so it is selected, moved,
// resized, copied, deleted and undone by the code that already does all of
// that for images.

import type Konva from "konva";
import { useToolStore, shapeKindOf } from "@/store/tool.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useLayerOrder } from "@/store/layerOrder.store";
import { selectOnly } from "@/lib/canvas/selection";
import { createShape, drawnBox, type BoardShape, type ShapeBox } from "./shapes";
import {
  SHAPE_CLICK_SLOP,
  SHAPE_DEFAULT_SIZE,
  SHAPE_MIN_SIZE,
} from "@/constants/canvas.constants";

export interface ShapeDrawDeps {
  layer: Konva.Layer;
  transformer: Konva.Transformer;
  applyDraggability: () => void;
  syncAllNodeGeometry: () => void;
  updateSelectionChrome: () => void;
  saveSnapshot: () => void;
}

/**
 * What a released draw becomes.
 *
 * A press that barely moved is a click, and places the default size centred
 * on it, as Figma and Luma do. Otherwise each side is held to the minimum, so
 * a long thin drag still leaves something that can be grabbed again.
 * The click test is in screen px, like FRAME_MIN_EDGE, so it means the same
 * hand movement at every zoom.
 */
export function finalBox(start: Konva.Vector2d, drawn: ShapeBox, scale: number): ShapeBox {
  if (drawn.width * scale < SHAPE_CLICK_SLOP && drawn.height * scale < SHAPE_CLICK_SLOP) {
    const half = SHAPE_DEFAULT_SIZE / 2;
    return {
      x: start.x - half,
      y: start.y - half,
      width: SHAPE_DEFAULT_SIZE,
      height: SHAPE_DEFAULT_SIZE,
    };
  }
  return {
    ...drawn,
    width: Math.max(drawn.width, SHAPE_MIN_SIZE),
    height: Math.max(drawn.height, SHAPE_MIN_SIZE),
  };
}

export function createShapeDrawHandlers(deps: ShapeDrawDeps) {
  let start: Konva.Vector2d | null = null;
  // The shape being drawn, shown live. Not yet "selectable": until the
  // release it is not part of the board, so no snapshot, select-all or
  // hit-test may see it.
  let preview: BoardShape | null = null;

  /** Begin a draw if a shape tool is armed. Says whether one began. */
  const onDown = (stage: Konva.Stage): boolean => {
    const kind = shapeKindOf(useToolStore.getState().activeTool);
    if (!kind) return false;
    const pt = stage.getRelativePointerPosition();
    if (!pt) return false;
    start = pt;
    preview = createShape(kind, { x: pt.x, y: pt.y, width: 0, height: 0 });
    preview.listening(false);
    deps.layer.add(preview);
    deps.layer.batchDraw();
    return true;
  };

  const onMove = (stage: Konva.Stage, square: boolean) => {
    if (!start || !preview) return;
    const pt = stage.getRelativePointerPosition();
    if (!pt) return;
    preview.setAttrs(drawnBox(start, pt, square));
    deps.layer.batchDraw();
  };

  const onUp = (stage: Konva.Stage, square: boolean) => {
    if (!start || !preview) return;
    const pt = stage.getRelativePointerPosition() ?? start;
    const node = preview;
    const box = finalBox(start, drawnBox(start, pt, square), stage.scaleX());
    start = null;
    preview = null;

    const id = crypto.randomUUID();
    node.setAttrs({ ...box, id, name: "selectable", listening: true });

    // Pointer first: the new shape has to be draggable straight away, and
    // applyDraggability reads the tool.
    useToolStore.getState().setTool("pointer");
    deps.applyDraggability();
    // A newly created node comes to the front, as an upload does.
    node.moveToTop();
    useLayerOrder.getState().raiseCanvas();

    // The new shape is the selection, alone (#107).
    selectOnly("node");
    deps.transformer.nodes([node]);
    useKonvaSelection.getState().select(id);

    deps.syncAllNodeGeometry();
    deps.updateSelectionChrome();
    deps.layer.batchDraw();
    deps.saveSnapshot();
  };

  /** Escape, or the window losing the gesture: abandon without creating. */
  const cancel = () => {
    if (!preview) return;
    // destroy, not remove: the preview never reached a snapshot, so nothing
    // can bring it back.
    preview.destroy();
    preview = null;
    start = null;
    deps.layer.batchDraw();
  };

  return { onDown, onMove, onUp, cancel };
}
