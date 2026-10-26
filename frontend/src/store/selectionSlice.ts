import type { StoreApi } from "zustand";

// What every selectable kind on the board keeps: the ids selected, in the
// order they were picked. Konva nodes, wires and Frames each had their own
// copy of this, under four sets of names (select / selectConnection,
// deselect / deselectConnection / clearSelection, ...), and only Frames knew
// to keep the same array when nothing changed (#155). One slice, so a new
// selectable kind gets all of it and none of the drift.
//
// The names are long on purpose: a store that owns things also has a
// `remove` that deletes one, and "remove from the selection" must not read
// like it.

export interface SelectionSlice {
  selectedIds: string[];
  /** Exactly this one, or nothing when passed null. */
  select: (id: string | null) => void;
  addToSelection: (id: string) => void;
  removeFromSelection: (id: string) => void;
  /** Shift/Ctrl+click: in if it was out, out if it was in. */
  toggleSelected: (id: string) => void;
  /** Exactly these, in this order. */
  setSelection: (ids: readonly string[]) => void;
  clearSelection: () => void;
}

/** Same ids in the same order. */
export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** The selection after each action, as pure functions of the current one. */
export const nextSelection = {
  select: (_: readonly string[], id: string | null): string[] => (id ? [id] : []),
  add: (ids: readonly string[], id: string): string[] => (ids.includes(id) ? [...ids] : [...ids, id]),
  remove: (ids: readonly string[], id: string): string[] => ids.filter((x) => x !== id),
  toggle: (ids: readonly string[], id: string): string[] =>
    ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
};

/**
 * The slice's actions for a store whose state includes SelectionSlice. An
 * action that changes nothing returns the state itself, so zustand notifies
 * no one: a fresh array on every press would re-render whatever is
 * subscribed in the middle of a drag.
 */
export function createSelection<S extends SelectionSlice>(set: StoreApi<S>["setState"]): SelectionSlice {
  const to = (next: (ids: readonly string[]) => string[]) =>
    set((s) => {
      const ids = next(s.selectedIds);
      return sameIds(ids, s.selectedIds) ? s : ({ selectedIds: ids } as Partial<S>);
    });
  return {
    selectedIds: [],
    select: (id) => to((ids) => nextSelection.select(ids, id)),
    addToSelection: (id) => to((ids) => nextSelection.add(ids, id)),
    removeFromSelection: (id) => to((ids) => nextSelection.remove(ids, id)),
    toggleSelected: (id) => to((ids) => nextSelection.toggle(ids, id)),
    setSelection: (ids) => to(() => [...ids]),
    clearSelection: () => to(() => []),
  };
}
