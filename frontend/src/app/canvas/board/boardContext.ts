// What Board's parts share: its stage, layer and transformer, and the few
// operations every one of them finishes with.

import type Konva from "konva";
import { useLayerOrder } from "@/store/layerOrder.store";
import { useFrames } from "@/store/frame.store";
import { canvasHistory } from "@/lib/canvas/history";
import { registerNodeChromeClear, registerNodeChromeSelect } from "@/lib/canvas/selection";
import { applyDraggability } from "./draggability";
import { syncAllNodeGeometry } from "./geometry";
import { selectNodes } from "./clipboard";
import { saveFrameImagePositions } from "./frameImageStorage";
import type { HoverOutline } from "./hoverOutline";
import { layerFor, onShapesLayer } from "./boardLayers";

/** What a tool that adds, removes or selects nodes on Board's layers needs. */
export interface BoardLayerDeps {
  /** Images and text (boardLayers.ts). */
  layer: Konva.Layer;
  /** Drawn shapes, always behind the Create nodes (#430). */
  shapes: Konva.Layer;
  /** What holds every node on the board, whichever layer: find and findOne go here. */
  root: Konva.Container;
  /** The layer a node goes on: a shape's own, or `layer`. */
  layerFor: (n: Konva.Node) => Konva.Layer;
  transformer: Konva.Transformer;
  /** Re-applies the "draggable only in pointer mode" rule to new nodes. */
  applyDraggability: () => void;
  /** Publishes geometry to konvaNodes so ports and wires can track the node. */
  syncAllNodeGeometry: () => void;
  updateSelectionChrome: () => void;
  /**
   * Commits to the undo timeline. Pass the event to share one undo step with
   * the other handlers of the same keypress or pick.
   */
  saveSnapshot: (coalesceKey?: object) => void;
}

export interface BoardContext extends BoardLayerDeps {
  stage: Konva.Stage;
  hover: HoverOutline;
  bringToFront: (n: Konva.Node) => void;
}

export function createBoardContext(parts: {
  stage: Konva.Stage;
  layer: Konva.Layer;
  shapes: Konva.Layer;
  transformer: Konva.Transformer;
  hover: HoverOutline;
  updateSelectionChrome: () => void;
}): BoardContext {
  const { stage, layer, shapes } = parts;
  const syncAll = () => syncAllNodeGeometry(stage);
  return {
    ...parts,
    root: stage,
    layerFor: (n) => layerFor({ shapes, main: layer }, n),
    applyDraggability: () => applyDraggability(stage),
    syncAllNodeGeometry: syncAll,
    // Every commit also records where a frame's uploaded images sit, so a
    // reload can put their bitmaps back.
    saveSnapshot: (coalesceKey) => {
      saveFrameImagePositions(useFrames.getState().frames);
      canvasHistory.commit(coalesceKey);
    },
    // A selected or dragged node comes to the front (#106), so its whole
    // content and its handles show over whatever it overlaps. moveToTop only
    // reorders within the canvas; bringing the canvas itself forward is what
    // lifts an image over a Create node, which is DOM and otherwise always
    // painted above it. Geometry is re-synced because ports, labels and the
    // occlusion tests read each node's z from it. A shape only comes to the
    // front of the other shapes: its layer stays behind the Create nodes (#430).
    bringToFront: (n) => {
      n.moveToTop();
      if (!onShapesLayer(n)) useLayerOrder.getState().raiseCanvas();
      syncAll();
    },
  };
}

/**
 * The transformer lives in Board and nowhere else, so selectOnly() cannot
 * drop node handles without a hand up from Board. Returns what unregisters.
 */
export function bindNodeChrome(board: BoardContext): () => void {
  const { stage, layer, transformer, hover, updateSelectionChrome } = board;
  registerNodeChromeClear(() => {
    transformer.nodes([]);
    updateSelectionChrome();
    layer.batchDraw();
  });
  registerNodeChromeSelect((ids) => {
    const nodes = ids
      .map((id) => stage.findOne<Konva.Shape>(`#${id}`))
      .filter((n): n is Konva.Shape => !!n);
    selectNodes(transformer, nodes);
    hover.hide();
    updateSelectionChrome();
    layer.batchDraw();
  });
  return () => {
    registerNodeChromeClear(null);
    registerNodeChromeSelect(null);
  };
}
