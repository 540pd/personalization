import type Konva from "konva";
import { createOutlineRect, traceShape } from "./outline";
import { isBoardShape } from "./shapes";

const CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"];
const ALL_SIDES = [
  ...CORNERS,
  "top-center", "middle-right", "bottom-center", "middle-left",
];

/**
 * An image has proportions worth keeping, so it resizes from its corners with
 * the ratio locked. A drawn shape has none: it resizes freely from every side
 * and corner, and Shift locks the ratio instead (Konva's default
 * shiftBehavior turns keepRatio on while Shift is held).
 */
function fitHandlesTo(transformer: Konva.Transformer, sel: Konva.Shape[]): void {
  const shape = sel.length === 1 && isBoardShape(sel[0]);
  const anchors = shape ? ALL_SIDES : CORNERS;
  // Setting anchors rebuilds them, and this runs on every dragmove frame.
  if (transformer.enabledAnchors().join() !== anchors.join()) {
    transformer.enabledAnchors(anchors);
  }
  transformer.keepRatio(!shape);
}

/**
 * Redraws the chrome that marks the current selection.
 *
 * A multi-selection is drawn as one outline per node rather than a single
 * combined box, so it stays obvious which nodes are in it. The transformer's
 * own border and handles are suppressed while multi-selected, but its node
 * list is deliberately left intact -- it is still the source of truth for
 * Delete / Ctrl+C and for the dragstart selection check.
 *
 * Takes the container as a Layer or a Group so a test can pass a bare
 * Konva.Group: a Stage cannot be constructed under jsdom.
 */
export function updateSelectionChrome(
  layer: Konva.Layer | Konva.Group,
  transformer: Konva.Transformer
): void {
  const sel = transformer.nodes() as Konva.Shape[];
  const multi = sel.length > 1;
  transformer.borderEnabled(!multi);
  transformer.resizeEnabled(!multi);
  fitHandlesTo(transformer, sel);

  // The rects are pooled rather than created and destroyed per change: this
  // runs on every dragmove frame.
  const pool = () => layer.find(".selection-outline") as Konva.Rect[];
  for (let i = pool().length; i < sel.length; i++) {
    layer.add(createOutlineRect("selection-outline"));
  }

  const needed = multi ? sel.length : 0;
  pool().forEach((r, i) => {
    if (i >= needed) {
      r.visible(false);
      return;
    }
    traceShape(r, sel[i]);
    r.visible(true);
    r.moveToTop();
  });

  transformer.moveToTop();
  layer.getLayer()?.batchDraw();
}
