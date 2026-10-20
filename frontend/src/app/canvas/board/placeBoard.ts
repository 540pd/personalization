// Replacing the whole board: Clear board (#197), Open file (#199) and the
// restore after a reload (#203).

import type Konva from "konva";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { useConnectionStore } from "@/store/connection.store";
import { useFrames } from "@/store/frame.store";
import { useLayerOrder } from "@/store/layerOrder.store";
import { canvasHistory } from "@/lib/canvas/history";
import { disposeAll } from "@/lib/dom/listen";
import { createNode, deleteNodes } from "./clipboard";
import { nodeBox } from "./geometry";
import { imageHitFunc } from "./upload";
import { clearBoardEvent } from "./clearBoard";
import { loadBoardEvent, type BoardFile } from "./boardFile";
import { readSavedCanvas, startCanvasPersistence } from "./canvasPersistence";
import type { BoardContext } from "./boardContext";

export interface BoardScene extends BoardContext {
  /** Ends any draw or text edit in progress, so none outlives the board it began on. */
  endGestures: () => void;
}

/** Takes every Konva node off the stage, with its selection. */
function emptyLayer(board: BoardScene): void {
  board.endGestures();
  board.transformer.nodes([]);
  deleteNodes(board.layer.find(".selectable") as Konva.Shape[]);
  useKonvaSelection.getState().deselect();
}

/** Redraws everything that reads the layer once its nodes have changed. */
function settle(board: BoardScene): void {
  board.hover.hide();
  board.syncAllNodeGeometry();
  board.updateSelectionChrome();
  board.layer.batchDraw();
}

// Clear board (#197). Everything goes, then one commit, so a single Ctrl+Z
// brings it all back. Konva nodes are remove()d, not destroyed, for the
// same reason as Delete: undo re-adds these very objects. The other kinds
// go through the setters their own undo adapters restore with.
export function clearBoard(board: BoardScene): void {
  emptyLayer(board);
  useNodePanel.getState().clearAll();
  useConnectionStore.getState().replaceConnections([]);
  useFrames.getState().replaceAll({});
  useFrames.getState().clearSelection();
  settle(board);
  board.saveSnapshot();
}

// Puts a checked board (parseBoardFile) on the stage in place of what is
// there, keeping its ids -- wires point at them. Shared by Open file (#199)
// and by the restore after a reload (#203), which leaves the panels alone:
// they rehydrate themselves.
export function placeBoard(board: BoardScene, file: BoardFile, { panels }: { panels: boolean }): void {
  const { layer } = board;
  emptyLayer(board);

  file.nodes.forEach((entry) => {
    const attrs: Record<string, unknown> = { ...entry.attrs, name: "selectable" };
    if (entry.className === "Image" && entry.imageUrl) {
      // Neither survives JSON. The picture decodes after the node is
      // placed, so the layer redraws once it has.
      const img = new window.Image();
      img.onload = () => layer.batchDraw();
      img.src = entry.imageUrl;
      attrs.image = img;
      attrs.hitFunc = imageHitFunc;
    }
    const node = createNode(entry.className, attrs);
    layer.add(node);
    if (entry.imageUrl || entry.label) {
      useKonvaNodes.getState().upsert({
        id: node.id(),
        ...nodeBox(node),
        imageUrl: entry.imageUrl,
        label: entry.label,
      });
    }
  });

  if (panels) useNodePanel.getState().loadPanels(file.panels);
  useFrames.getState().replaceAll(Object.fromEntries(file.frames.map((f) => [f.id, f])));
  useFrames.getState().clearSelection();
  useConnectionStore.getState().replaceConnections(file.connections);
  useLayerOrder.setState({ topLayer: file.topLayer });
  board.applyDraggability();
  settle(board);
}

/**
 * Clear and Open file, the restore of the saved board, and saving from then
 * on. Returns what stops listening and writes anything still pending.
 */
export function bindBoardFile(board: BoardScene): () => void {
  const off = [
    clearBoardEvent.on(() => clearBoard(board)),
    // Open file (#199): the board becomes the file's, as one undo step.
    loadBoardEvent.on((file) => {
      placeBoard(board, file, { panels: true });
      board.saveSnapshot();
    }),
  ];

  // The board as it was before the reload (#203). The restored board is the
  // first undo entry, not a step: there is nothing before it to go back to.
  // Saving starts only after this, so the empty stage that exists until now
  // can never overwrite what was saved.
  const saved = readSavedCanvas();
  if (saved) {
    placeBoard(board, saved, { panels: false });
    canvasHistory.clear();
    board.saveSnapshot();
  }
  off.push(startCanvasPersistence(() => board.layer));
  return () => disposeAll(off);
}
