// The board's three canvases (#430), all in one Konva stage:
//
//   shapes   every drawn shape: always behind the Create nodes, images and
//            text, whatever was touched last (Z_INDEX.shapes, never flips)
//   main     images and text: flips above or below the Create nodes, as
//            the whole board used to (layerOrder.store)
//   chrome   the transformer and the multi-selection outlines: over the
//            Create nodes, so a shape's handles show and work even where a
//            node covers the shape
//
// One stage, so selection, drag-select, undo, copy and paste and saving
// still see one board: they look nodes up on the stage, and each node goes
// back to its own layer by what it is. A Konva Layer is its own <canvas>;
// the stage's container has no stacking context of its own (Board.tsx), so
// each canvas takes its own z-index among the Create nodes'.

import type Konva from "konva";
import { Z_INDEX } from "@/constants/canvas.constants";
import type { TopLayer } from "@/store/layerOrder.store";

/** A drawn shape -- rect, ellipse, line, arrow… -- by the attr every one carries. */
export function onShapesLayer(n: Konva.Node): boolean {
  return typeof n.getAttr("shapeKind") === "string";
}

export interface BoardLayers {
  shapes: Konva.Layer;
  main: Konva.Layer;
  chrome: Konva.Layer;
}

/** The layer `n` belongs on: a shape's own, or the main one. */
export function layerFor(layers: Pick<BoardLayers, "shapes" | "main">, n: Konva.Node): Konva.Layer {
  return onShapesLayer(n) ? layers.shapes : layers.main;
}

const canvasOf = (layer: Konva.Layer) => layer.getCanvas()._canvas;

/**
 * Gives each layer's <canvas> its place among the Create nodes. The main
 * one flips with `front`; the shapes stay under and the chrome over.
 * data-board-layer names them for the e2e specs.
 */
export function stackLayers(layers: BoardLayers, front: TopLayer): void {
  const place = (layer: Konva.Layer, name: string, z: number) => {
    const canvas = canvasOf(layer);
    canvas.dataset.boardLayer = name;
    canvas.style.zIndex = String(z);
  };
  place(layers.shapes, "shapes", Z_INDEX.shapes);
  place(layers.main, "main", front === "canvas" ? Z_INDEX.canvasAbove : Z_INDEX.canvasBelow);
  place(layers.chrome, "chrome", Z_INDEX.selectionChrome);
}

/**
 * The chrome canvas sits over the Create nodes, so it takes the pointer only
 * where a handle is: anywhere else a click must reach whatever is under it.
 */
export function chromeTakesPointer(chrome: Konva.Layer, take: boolean): void {
  canvasOf(chrome).style.pointerEvents = take ? "auto" : "none";
}
