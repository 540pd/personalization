import type Konva from "konva";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import type { ShapeKind } from "@/store/tool.store";
import { isBoardShape, isLineKind, lineBend, lineEnds } from "./shapes";
import { isBoardText, readTextStyle } from "./text";
import { readStyle } from "./shapeStyle";
import type { TopAnchoredBox } from "@/lib/canvas/bounds";

/** Where `n` sits on the canvas, its scale folded into the size. */
export function nodeBox(n: Konva.Node): TopAnchoredBox {
  return {
    canvasX: n.x(),
    canvasY: n.y(),
    canvasW: n.width() * n.scaleX(),
    canvasH: n.height() * n.scaleY(),
  };
}

/**
 * Publishes a node's geometry to konvaNodes -- the single source the port
 * overlays, connection wires and labels read.
 *
 * Called on every drag and transform frame, not just on gesture end, so the
 * DOM overlays track the shape live. Mutating a Konva node directly without
 * calling this desyncs them: the shape moves and its ports stay behind.
 */
export function syncNodeGeometry(n: Konva.Shape): void {
  const id = n.id();
  // Skip id-less nodes: an entry keyed by undefined would collide with the
  // next one and neither would get a port.
  if (!id) return;
  // Read off the node rather than set once at creation, so a shape brought
  // back by undo or a paste is still known to be one.
  const shape = n.getAttr("shapeKind") as ShapeKind | undefined;
  useKonvaNodes.getState().upsert({
    id,
    ...nodeBox(n),
    z: n.zIndex(),
    ...(shape ? { shape } : {}),
    ...(isBoardText(n) ? { text: true, textStyle: readTextStyle(n) } : {}),
    ...(isBoardShape(n) && isLineKind(n.shapeKind()) ? { ends: { ...lineEnds(n), bend: lineBend(n) } } : {}),
    ...(isBoardShape(n) ? { style: readStyle(n) } : {}),
  });
}

/**
 * Republishes every node.
 *
 * Raising one node shifts everyone else's index, so a z-order change needs
 * the full set -- syncing only the moved node would leave the others stale
 * and a port would hide or show against the wrong stacking.
 *
 * Takes a Group as well as a Layer so a test can pass a bare Konva.Group:
 * a Stage cannot be constructed under jsdom.
 */
export function syncAllNodeGeometry(container: Konva.Container): void {
  (container.find(".selectable") as Konva.Shape[]).forEach(syncNodeGeometry);
}
