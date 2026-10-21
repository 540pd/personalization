// Board's window keyboard shortcuts: Space to pan, undo and redo, select all
// and Escape, the edit keys, and the Frame keys.

import type Konva from "konva";
import { useToolStore } from "@/store/tool.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useConnectionStore } from "@/store/connection.store";
import { useFrames } from "@/store/frame.store";
import { selectOnly } from "@/lib/canvas/selection";
import { canvasHistory } from "@/lib/canvas/history";
import { boardKeyAllowed } from "@/lib/canvas/boardKeys";
import { disposeAll, listen } from "@/lib/dom/listen";
import { createEditKeysHandler, selectNodes } from "./clipboard";
import { createFrameFromSelection, removeSelectedFrame } from "./frameSelection";
import type { BoardContext } from "./boardContext";

export interface ShortcutDeps {
  /** Set while Space is held; read by the stage's cursor handlers. */
  spacePan: { current: boolean };
  /** Abandons a draw in progress, for Escape. */
  cancelDraw: () => void;
}

export function bindBoardShortcuts(board: BoardContext, deps: ShortcutDeps): () => void {
  const { stage, layer, transformer, hover, updateSelectionChrome, saveSnapshot } = board;
  const { spacePan } = deps;

  // Space-to-pan: temporarily enable dragging regardless of active tool.
  const handleSpaceDown = (e: KeyboardEvent) => {
    if (!boardKeyAllowed(e)) return;
    if (e.code !== "Space" || spacePan.current) return;
    e.preventDefault();
    spacePan.current = true;
    stage.draggable(true);
    stage.container().style.cursor = "grab";
  };
  const handleSpaceUp = (e: KeyboardEvent) => {
    if (e.code !== "Space" || !spacePan.current) return;
    spacePan.current = false;
    if (useToolStore.getState().activeTool === "pointer") {
      stage.draggable(false);
    }
    stage.container().style.cursor = "default";
  };

  // Ctrl/Cmd + Z → undo; Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z → redo.
  // The only undo/redo listener in the app. NodePanel used to run a second
  // one in capture phase and stopImmediatePropagation its way to priority;
  // with a single timeline there is nothing to arbitrate.
  const handleUndoRedo = (e: KeyboardEvent) => {
    // Not while another page covers the board (#206): an undo nobody can see.
    if (!boardKeyAllowed(e)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    if (e.code === "KeyZ" && !e.shiftKey) { e.preventDefault(); canvasHistory.undo(); }
    if (e.code === "KeyY" || (e.code === "KeyZ" && e.shiftKey)) { e.preventDefault(); canvasHistory.redo(); }
  };

  // Ctrl/Cmd + A → select every uploaded image, node and wire.
  // Escape → clear all three. NodePanel's own Escape collapses the panels.
  const handleSelectAll = (e: KeyboardEvent) => {
    if (!boardKeyAllowed(e)) return;

    if (e.code === "Escape") {
      selectOnly(null);
      updateSelectionChrome();
      layer.batchDraw();
      return;
    }

    if (!(e.ctrlKey || e.metaKey) || e.code !== "KeyA") return;
    // Otherwise the browser highlights every piece of text on the page.
    e.preventDefault();
    // Same rule as clicking a node: selecting implies the pointer tool,
    // or the selection could not be moved.
    if (useToolStore.getState().activeTool !== "pointer") {
      useToolStore.getState().setTool("pointer");
    }
    const nodes = layer.find(".selectable") as Konva.Shape[];
    selectNodes(transformer, nodes);
    if (!nodes.length) useKonvaSelection.getState().clearSelection();
    useNodePanel.getState().selectAll();
    useConnectionStore.getState().selectAll();
    useFrames.getState().selectAll();
    hover.hide(); // transformer borders take over
    updateSelectionChrome();
    layer.batchDraw();
  };

  const editKeys = createEditKeysHandler(board);
  const handleEditKeys = (e: KeyboardEvent) => {
    if (boardKeyAllowed(e)) editKeys(e);
  };

  const handleFrameKeys = (e: KeyboardEvent) => {
    if (!boardKeyAllowed(e)) return;
    if (e.code === "Escape") {
      deps.cancelDraw();
      return;
    }
    // F: a Frame around two or more selected items (#243), not with a
    // modifier held. Shift+F: the one selected Frame goes, its items stay,
    // selected (#244).
    if (e.code === "KeyF" && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const done = e.shiftKey ? removeSelectedFrame() : createFrameFromSelection();
      if (done) e.preventDefault();
      return;
    }
    // Frames keep their own selection, so they need their own Delete. Keyed
    // on the event, so deleting a frame and a node together is one step.
    if (e.code === "Delete" || e.code === "Backspace") {
      const ids = useFrames.getState().selectedIds;
      if (!ids.length) return;
      ids.forEach((id) => useFrames.getState().remove(id));
      saveSnapshot(e);
    }
  };

  const off = [
    listen(window, "keydown", handleSpaceDown),
    listen(window, "keyup", handleSpaceUp),
    listen(window, "keydown", handleUndoRedo),
    listen(window, "keydown", handleSelectAll),
    listen(window, "keydown", handleEditKeys),
    listen(window, "keydown", handleFrameKeys),
  ];
  return () => disposeAll(off);
}
