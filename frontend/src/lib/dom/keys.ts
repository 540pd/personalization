// Whether a key belongs to the page's own shortcuts or to whatever has focus.
// The one place this is decided: every board shortcut used to write its own
// version, and no two of them agreed (#249).

/** A field the user types in: input, textarea, select, or contentEditable. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

/** Inside an open dialog, whose keys are its own. */
export function isInDialog(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[aria-modal="true"]') !== null;
}

/** Any dialog open, wherever focus is. */
export function dialogIsOpen(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null;
}

/** A key the page may act on: not typed into a field, not pressed in a dialog. */
export function isPageKey(e: KeyboardEvent): boolean {
  return !isEditableTarget(e.target) && !isInDialog(e.target);
}
