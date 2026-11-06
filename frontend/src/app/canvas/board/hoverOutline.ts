import type Konva from "konva";
import { useToolStore } from "@/store/tool.store";
import { createOutlineRect, traceShape } from "./outline";

export interface HoverOutline {
  /** The rect itself, so the caller can hide it without a shape in hand. */
  node: Konva.Rect;
  show(shape: Konva.Shape): void;
  hide(): void;
}

/**
 * The outline that follows whichever node the cursor is over.
 *
 * Kept as its own node rather than a stroke on the shape, so it never lands
 * in an undo snapshot or the copy/paste clipboard -- both of which capture
 * the shape's own attrs.
 *
 * Takes the container as a Layer or a Group so a test can pass a bare
 * Konva.Group: a Stage cannot be constructed under jsdom.
 */
export function createHoverOutline(
  layer: Konva.Layer | Konva.Group,
  transformer: Konva.Transformer
): HoverOutline {
  const node = createOutlineRect("hover-outline");
  layer.add(node);

  const hide = () => {
    // Guard the redraw: mouseout fires constantly and batchDraw is not free.
    if (!node.visible()) return;
    node.visible(false);
    node.getLayer()?.batchDraw();
  };

  const show = (shape: Konva.Shape) => {
    // A selected node already draws the transformer border -- showing this on
    // top would double it, so hover stays the unselected-only affordance.
    if (
      useToolStore.getState().activeTool !== "pointer" ||
      transformer.nodes().includes(shape)
    ) {
      hide();
      return;
    }
    traceShape(node, shape);
    node.visible(true);
    // On the shape's own layer (#430): a shape's outline goes behind the
    // Create nodes with it, so hovering never draws over a node.
    const home = shape.getLayer();
    if (home && node.getParent() !== home) node.moveTo(home);
    // Shapes are added after the layer's chrome, so without this the outline
    // would sit under the node it is tracing.
    node.moveToTop();
    node.getLayer()?.batchDraw();
  };

  return { node, show, hide };
}
