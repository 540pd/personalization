import type Konva from "konva";
import { createOutlineRect, traceShape } from "./outline";

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
