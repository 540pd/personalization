// Recolouring board items from the dock's Color swatches (#159).
//
// Separate from palette.ts so that shapes.ts can read the palette without
// the two modules importing each other.

import Konva from "konva";
import { isBoardShape, isLineKind } from "./shapes";
import { isBoardText } from "./text";
import { hasAttrs, lineStyleAttrs, patchStyle, readStyle, styleAttrs, type ShapeStyle } from "./shapeStyle";

/**
 * The attrs that give a board item this colour, or null for an item a colour
 * does not apply to (images, and anything else that is not a shape or text).
 */
export function colorAttrs(node: Konva.Node, hex: string): Konva.ShapeConfig | null {
  if (isBoardShape(node)) {
    // A line has no inside: the colour is the line, dashes and all (#162).
    if (isLineKind(node.shapeKind())) return lineStyleAttrs({ ...readStyle(node), color: hex });
    // Whatever its fill and stroke (#161), only the colour changes.
    return styleAttrs(patchStyle(readStyle(node), { color: hex }));
  }
  if (isBoardText(node)) return { fill: hex };
  return null;
}

/** Recolours the items a colour applies to. Says whether any changed. */
export function applyColor(nodes: Konva.Node[], hex: string): boolean {
  let changed = false;
  nodes.forEach((n) => {
    const attrs = colorAttrs(n, hex);
    if (!attrs) return;
    if (hasAttrs(n, attrs)) return;
    n.setAttrs(attrs);
    changed = true;
  });
  return changed;
}

/**
 * Restyles the shapes, lines and arrows among `nodes` from the style bar
 * (#161, #162): only what `patch` names changes, the rest of each one's
 * style stays its own. Says whether any changed.
 */
export function applyShapeStyle(nodes: Konva.Node[], patch: Partial<ShapeStyle>): boolean {
  let changed = false;
  nodes.forEach((n) => {
    if (!isBoardShape(n)) return;
    const attrs = isLineKind(n.shapeKind())
      ? lineStyleAttrs({ ...readStyle(n), ...patch })
      : styleAttrs(patchStyle(readStyle(n), patch));
    if (hasAttrs(n, attrs)) return;
    n.setAttrs(attrs);
    changed = true;
  });
  return changed;
}
