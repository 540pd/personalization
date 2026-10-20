import type { KeyboardEvent, MouseEvent, RefObject } from "react";

/**
 * Where Tab goes from `active` inside a modal: round from the last element
 * to the first (or, with Shift, the first to the last); null to let the
 * browser move focus as usual.
 */
export function trapStep<T>(focusable: readonly T[], active: unknown, shift: boolean): T | null {
  if (!focusable.length) return null;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (shift && active === first) return last;
  if (!shift && active === last) return first;
  return null;
}

/**
 * A modal's keys and backdrop -- the board confirms (#197, #199) and the library
 * forms (#206, #208): focus kept among `focusable` inside `ref`, Escape and a
 * press on the backdrop itself calling `onClose`.
 *
 * Every key stops at the dialog: Board's window listeners would otherwise
 * see Backspace and Ctrl+Z.
 */
export function modalKeys(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  focusable = "button",
): { onKeyDown: (e: KeyboardEvent) => void; onBackdropMouseDown: (e: MouseEvent) => void } {
  return {
    onKeyDown: (e) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const els = Array.from(ref.current?.querySelectorAll<HTMLElement>(focusable) ?? []);
      const next = trapStep(els, document.activeElement, e.shiftKey);
      if (!next) return;
      e.preventDefault();
      next.focus();
    },
    onBackdropMouseDown: (e) => {
      if (e.target === e.currentTarget) onClose();
    },
  };
}
