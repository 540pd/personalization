// One Delete for everything on the board (#472). Each kind of thing that can
// be selected -- wires, Create nodes, images and shapes, frames -- registers
// how to tell it has a selection and how to delete it; one handler deletes
// from every kind with a selection and makes it one undo step.
//
// Before this, each kind had its own window listener, and ⌘A + Delete was one
// step only because each happened to key its commit on the same event.

import { boardKeyAllowed } from "./boardKeys";

export interface Deletable {
  /** Whether anything of this kind is selected. */
  hasSelection(): boolean;
  /** Deletes what is selected. Doesn't commit: deleteSelection does, once. */
  deleteSelected(): void;
}

/**
 * The order kinds are deleted in, whatever order they registered in: wires
 * first, so a selected wire goes as itself before a node's removal takes its
 * wires with it; frames last, so their items are already settled.
 */
export const DELETE_ORDER = ["wires", "panels", "konva", "frames"] as const;
export type DeletableKind = (typeof DELETE_ORDER)[number];

const kinds = new Map<DeletableKind, Deletable>();

/** Registers a kind; returns what unregisters it. */
export function registerDeletable(kind: DeletableKind, deletable: Deletable): () => void {
  kinds.set(kind, deletable);
  return () => {
    if (kinds.get(kind) === deletable) kinds.delete(kind);
  };
}

const isDeleteKey = (e: KeyboardEvent) => e.code === "Delete" || e.code === "Backspace";

/**
 * Delete or Backspace on the board: deletes from every kind with a
 * selection, then commits once, keyed on the event. Not from a field, a
 * dialog, or while another page covers the board (boardKeyAllowed). Nothing
 * selected: the key is left alone and nothing is committed. Returns whether
 * it deleted anything.
 */
export function deleteSelection(e: KeyboardEvent, commit: (key: object) => void): boolean {
  if (!isDeleteKey(e) || !boardKeyAllowed(e)) return false;
  const selected = DELETE_ORDER.flatMap((k) => {
    const d = kinds.get(k);
    return d && d.hasSelection() ? [d] : [];
  });
  if (!selected.length) return false;
  e.preventDefault();
  for (const d of selected) d.deleteSelected();
  commit(e);
  return true;
}
