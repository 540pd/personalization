"use client";

import { useState, type ReactNode, type RefObject } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import type { Listed } from "../../library/fields";

/**
 * "A and B use it." / "A, B and 2 more use it." -- who stops using a skill
 * when it is removed (#211).
 */
export function usersSentence(names: readonly string[]): string {
  if (names.length === 0) return "";
  const verb = names.length === 1 ? "uses it. It'll stop using it." : "use it. They'll stop using it.";
  if (names.length <= 2) return `${names.join(" and ")} ${verb}`;
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more ${verb}`;
}

/**
 * Remove… for a library page (#211): the confirm, then removal with an Undo
 * toast that puts the item back exactly -- same id, fields and place.
 *
 * Focus moves to the next row's ⋯ (the previous one's for the last row), or
 * to the empty state's button once nothing is left.
 */
export function useRemoval<T extends Listed>({
  items,
  rows,
  noun,
  usedBy,
  remove,
  restore,
  showToast,
  emptyFocus,
}: {
  /** Everything, in stored order: Undo restores into the same place. */
  items: readonly T[];
  /** What the table shows, in its order: the next row is found here. */
  rows: readonly T[];
  /** "skills", "agents": the place an unused item is removed from. */
  noun: string;
  /** Names of what uses the item, if anything does. */
  usedBy?: (item: T) => string[];
  remove: (id: string) => boolean;
  restore: (item: T, index: number) => boolean;
  showToast: (message: string, error?: boolean, onUndo?: () => void) => void;
  /** Where focus goes once the last item is gone. */
  emptyFocus: RefObject<HTMLElement | null>;
}): { request: (item: T, trigger: HTMLElement | null) => void; dialog: ReactNode } {
  const [pending, setPending] = useState<{ item: T; trigger: HTMLElement | null } | null>(null);

  const confirm = () => {
    if (!pending) return;
    const { item, trigger } = pending;
    const index = items.findIndex((i) => i.id === item.id);
    const at = rows.findIndex((r) => r.id === item.id);
    const neighbour = rows[at + 1] ?? rows[at - 1];
    setPending(null);

    if (!remove(item.id)) {
      showToast(`Couldn't remove ${item.name}.`, true);
      trigger?.focus();
      return;
    }
    // After the table has re-rendered without the row.
    requestAnimationFrame(() => {
      const next = neighbour
        ? document.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(neighbour.id)}"] .library-row-menu-button`)
        : null;
      (next ?? emptyFocus.current)?.focus();
    });
    showToast(`${item.name} removed`, false, () => {
      if (!restore(item, index)) showToast(`Couldn't restore ${item.name}.`, true);
    });
  };

  const users = pending && usedBy ? usedBy(pending.item) : [];
  const dialog = pending ? (
    <ConfirmDialog
      title={`Remove “${pending.item.name}”?`}
      confirmLabel="Remove"
      tone="danger"
      onCancel={() => {
        const trigger = pending.trigger;
        setPending(null);
        trigger?.focus();
      }}
      onConfirm={confirm}
    >
      {users.length ? usersSentence(users) : `It will be removed from your ${noun}.`}
    </ConfirmDialog>
  ) : null;

  return { request: (item, trigger) => setPending({ item, trigger }), dialog };
}
