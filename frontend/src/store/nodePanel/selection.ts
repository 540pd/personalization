import { DEFAULT_ASPECT_RATIO, placeholderSize } from "@/constants/canvas.constants";
import { nextSelection, sameIds } from "../selectionSlice";
import type { NodeKind, PanelsState } from "./types";

// A node's three states -- unselected, selected, selected with its panel
// open -- as the shared selection (selectedIds) plus the one open node
// (openId). The open node is always the only one selected: a settings panel
// belongs to a single node. A transition that changes nothing returns `s`,
// so the store notifies no one.

/** `s` with this selection and open node, or `s` itself if neither changed. */
function withSelection(s: PanelsState, selectedIds: string[], openId: string | null): PanelsState {
  return sameIds(selectedIds, s.selectedIds) && openId === s.openId ? s : { ...s, selectedIds, openId };
}

// The new node is the selection, with its panel open unless it is a written
// kind. The caller commits to the shared history afterwards, so creating a
// node is itself undoable -- it was not, before the two stacks merged.
export function addPanel(
  s: PanelsState, id: string, cx: number, cy: number, kind: NodeKind, open: boolean,
): PanelsState {
  return {
    // Seeded from the same helper SinglePanel uses, so the node does not
    // flash at one size then resize on mount.
    panels: [...s.panels, { id, kind, canvasX: cx, canvasY: cy, ...placeholderSize(DEFAULT_ASPECT_RATIO) }],
    selectedIds: [id],
    openId: open ? id : null,
  };
}

export function removePanel(s: PanelsState, id: string): PanelsState {
  return {
    panels: s.panels.filter((p) => p.id !== id),
    selectedIds: nextSelection.remove(s.selectedIds, id),
    openId: s.openId === id ? null : s.openId,
  };
}

/** Selected alone, panel closed: show the transformer border, no panel. */
export const selectPanel = (s: PanelsState, id: string | null) =>
  withSelection(s, nextSelection.select(s.selectedIds, id), null);

/** Selected alone, panel open alongside the transformer. */
export const openPanel = (s: PanelsState, id: string) => withSelection(s, [id], id);

/** Panel closed; the node stays selected. */
export const closePanel = (s: PanelsState, id: string) =>
  withSelection(s, s.selectedIds, s.openId === id ? null : s.openId);

// Adding to, dropping from or replacing a selection closes any open panel:
// a settings panel belongs to a single selected node.
export const addPanelToSelection = (s: PanelsState, id: string) =>
  withSelection(s, nextSelection.add(s.selectedIds, id), null);
export const removePanelFromSelection = (s: PanelsState, id: string) =>
  withSelection(s, nextSelection.remove(s.selectedIds, id), null);
export const togglePanelSelected = (s: PanelsState, id: string) =>
  withSelection(s, nextSelection.toggle(s.selectedIds, id), null);
export const setPanelSelection = (s: PanelsState, ids: readonly string[]) =>
  withSelection(s, [...ids], null);

/** Nothing selected, nothing open; placeholders stay on the board. */
export const clearPanelSelection = (s: PanelsState) => withSelection(s, [], null);

/** Every node selected, panels closed (Ctrl+A). */
export const selectAllPanels = (s: PanelsState) =>
  withSelection(s, s.panels.map((p) => p.id), null);

/** Delete: every selected node goes. */
export function removeSelected(s: PanelsState): PanelsState {
  if (!s.selectedIds.length) return s;
  const gone = new Set(s.selectedIds);
  return { panels: s.panels.filter((p) => !gone.has(p.id)), selectedIds: [], openId: null };
}

/**
 * The selection kept to nodes that still exist. Undo and a file load swap
 * the panels wholesale; a selected node they took away must not stay
 * selected, and undo restores no selection of its own (as with Frames, #244).
 */
export function keepExisting(s: PanelsState): PanelsState {
  const ids = new Set(s.panels.map((p) => p.id));
  return withSelection(
    s,
    s.selectedIds.filter((id) => ids.has(id)),
    s.openId && ids.has(s.openId) ? s.openId : null,
  );
}
