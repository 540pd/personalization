import type Konva from "konva";
import { createOutlineRect, traceShape } from "./outline";
import { isBoardShape, isLineKind } from "./shapes";
import { isBoardText } from "./text";

// Every resizable node gets these four and no side handles (#160). What a
// corner does is what differs: see fitHandlesTo.
export const CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"];

/**
 * Corners only, for every kind (#160). An image has proportions worth
 * keeping, so its corners lock the ratio, and a text's corners scale its font
 * (bakeTextResize), so they lock it too. A drawn shape has none: its corners
 * stretch freely, and Shift locks the ratio instead (Konva's default
 * shiftBehavior turns keepRatio on while Shift is held).
 */
function fitHandlesTo(transformer: Konva.Transformer, sel: Konva.Shape[]): void {
  const shape = sel.length === 1 && isBoardShape(sel[0]);
  // Setting anchors rebuilds them, and this runs on every dragmove frame.
  if (transformer.enabledAnchors().join() !== CORNERS.join()) {
    transformer.enabledAnchors(CORNERS);
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
  // A lone line is edited by its two end handles (LineHandles), so the box
  // around it -- border and resize anchors alike -- stays out of the way.
  const line = sel.length === 1 && isBoardShape(sel[0]) && isLineKind(sel[0].shapeKind());
  transformer.borderEnabled(!multi && !line);
  transformer.resizeEnabled(!multi && !line);
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
