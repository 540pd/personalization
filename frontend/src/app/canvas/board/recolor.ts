// Recolouring board items from the dock's Color swatches (#159).
//
// Separate from palette.ts so that shapes.ts can read the palette without
// the two modules importing each other.

import Konva from "konva";
import { isBoardShape, isLineKind } from "./shapes";
import { isBoardText } from "./text";
import { outlineFor } from "./palette";

/**
 * The attrs that give a board item this colour, or null for an item a colour
 * does not apply to (images, and anything else that is not a shape or text).
 */
export function colorAttrs(node: Konva.Node, hex: string): Konva.ShapeConfig | null {
  if (isBoardShape(node)) {
    // A line has no inside: the colour is the line.
    if (isLineKind(node.shapeKind())) return { stroke: hex };
    return { fill: hex, stroke: outlineFor(hex) };
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
    const same = Object.entries(attrs).every(([k, v]) => n.getAttr(k) === v);
    if (same) return;
    n.setAttrs(attrs);
    changed = true;
  });
  return changed;
}
