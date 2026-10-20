import type { KeyboardEvent, RefObject } from "react";

/** The items keyboard focus can land on. */
export const MENU_ITEM = '[role="menuitem"]:not(:disabled)';

/** The item an arrow key moves to from `at` (-1: none focused), wrapping at both ends. */
export function stepIndex(at: number, length: number, step: 1 | -1): number {
  return (at + step + length) % length;
}

/**
 * A menu's keys -- the Playspace options (#197) and a library row's ⋯ (#210):
 * Escape closes it and puts focus back on its trigger, Tab closes it and
 * lets focus move on, and the arrow keys move between its enabled items.
 *
 * Every key stops here: Board deletes the selection on Backspace and undoes
 * on Ctrl+Z from window listeners, and neither should fire from a menu.
 */
export function menuKeyboard(
  ref: RefObject<HTMLElement | null>,
  /** `restoreFocus` is false when focus is about to go somewhere else on purpose. */
  onClose: (restoreFocus: boolean) => void,
): (e: KeyboardEvent) => void {
  return (e) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      onClose(true);
      return;
    }
    if (e.key === "Tab") {
      onClose(false);
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>(MENU_ITEM) ?? []);
    if (!items.length) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[stepIndex(at, items.length, e.key === "ArrowDown" ? 1 : -1)].focus();
  };
}
