"use client";

import { useMemo, useRef, useState } from "react";
import { useToast } from "@/components/Toast/useToast";
import { useLibraryFilters, useReturnFocus } from "./LibraryPage";
import { useRemoval } from "./useRemoval";
import { allTags, filterItems, sortByName, type Listed } from "../../library/fields";
import type { ItemSaved, LibraryNoun } from "../../library/itemForm";

/** The dialog over the page: Upload (maybe with a dropped file) or Edit. */
export type CollectionDialog<T> = { kind: "upload"; file?: File } | { kind: "edit"; item: T };

const SAVED_TOAST: Record<ItemSaved, (name: string) => string> = {
  added: (name) => `${name} added`,
  replaced: (name) => `${name} replaced`,
  saved: (name) => `${name} saved`,
};

/**
 * A library page's state -- Skills (#206), Agents (#208): the filtered,
 * sorted rows, the Upload / Edit dialog and where focus goes back to after
 * it, the toast, and Remove… (#211).
 */
export function useLibraryCollection<T extends Listed>({
  items,
  noun,
  usedBy,
  remove,
  restore,
}: {
  items: readonly T[];
  noun: LibraryNoun;
  /** Names of what uses the item, for Remove…'s confirm. */
  usedBy?: (item: T) => string[];
  remove: (id: string) => boolean;
  restore: (item: T, index: number) => boolean;
}) {
  const tags = useMemo(() => allTags(items), [items]);
  const filters = useLibraryFilters(tags);
  const rows = useMemo(
    () => sortByName(filterItems(items, filters.query, filters.tag)),
    [items, filters.query, filters.tag],
  );
  const [dialog, setDialog] = useState<CollectionDialog<T> | null>(null);
  const [toast, showToast] = useToast();
  const actionRef = useRef<HTMLButtonElement>(null);
  const focus = useReturnFocus(actionRef);
  const removal = useRemoval({
    items,
    rows,
    noun: noun.many,
    usedBy,
    remove,
    restore,
    showToast,
    emptyFocus: actionRef,
  });

  const open = (next: CollectionDialog<T>, from: HTMLElement | null) => {
    focus.from(from);
    setDialog(next);
  };
  const close = () => {
    setDialog(null);
    focus.restore();
  };

  return {
    items,
    noun,
    tags,
    filters,
    rows,
    dialog,
    open,
    close,
    /** For the dialog: close it, then say how the item was saved. */
    saved: (name: string, how: ItemSaved) => {
      close();
      showToast(SAVED_TOAST[how](name));
    },
    saveFailed: () => showToast(`Couldn't save the ${noun.one}.`, true),
    toast,
    showToast,
    actionRef,
    removal,
  };
}

export type LibraryCollectionState<T extends Listed> = ReturnType<typeof useLibraryCollection<T>>;
