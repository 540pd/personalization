// One selection at a time, across every selectable kind on the board.
//
// The board has four independent selection stores -- Konva nodes (with the
// transformer Board owns), node panels, wires and frames. Before this module
// each click path cleared the other three itself, which is why frames arrived
// selectable but never cleared by a node click: two of the call sites simply
// did not know about them.
//
// Everything that selects something calls `selectOnly` instead. Adding a new
// selectable kind is then one case here, not an edit at every call site.

import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { useConnectionStore } from "@/store/connection.store";
import { useFrames } from "@/store/frame.store";

/** The kinds of thing that can own the board's selection. */
export type SelectionKind = "node" | "panel" | "wire" | "frame";

/**
 * Clearing Konva handles needs the transformer, which only Board has. It
 * registers the clear on mount, in the same spirit as boardStage/frameStage.
 */
let clearNodeChrome: (() => void) | null = null;

export function registerNodeChromeClear(fn: (() => void) | null): void {
  clearNodeChrome = fn;
}

/**
 * Selecting Konva nodes by id likewise needs the transformer: Board registers
 * it, so code outside Board (Remove frame, #244) can hand over a selection.
 */
let selectNodeChrome: ((ids: string[]) => void) | null = null;

export function registerNodeChromeSelect(fn: ((ids: string[]) => void) | null): void {
  selectNodeChrome = fn;
}

/** Select these Konva nodes, with their handles, alongside what is selected. */
export function selectNodeIds(ids: string[]): void {
  if (ids.length) selectNodeChrome?.(ids);
}

/**
 * Make `keep` the only kind holding a selection. Pass `null` to clear all of
 * them, as a click on empty board or Escape does.
 *
 * This only ever *clears*; the caller still selects whatever it meant to
 * select afterwards. The stores stay separate -- the transformer genuinely
 * needs Konva nodes, and panels are DOM.
 */
export function selectOnly(keep: SelectionKind | null): void {
  if (keep !== "node") {
    useKonvaSelection.getState().deselect();
    clearNodeChrome?.();
  }
  if (keep !== "panel") useNodePanel.getState().closeAllPanels();
  if (keep !== "wire") useConnectionStore.getState().deselectConnection();
  if (keep !== "frame") useFrames.getState().clearSelection();
}
