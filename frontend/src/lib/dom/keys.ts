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

/** A Mac, where the shortcut modifier is ⌘ rather than Ctrl. */
export function isMacPlatform(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
}

/** How the shortcut modifier reads on this machine. */
export function modKeyLabel(): "⌘" | "Ctrl" {
  return isMacPlatform() ? "⌘" : "Ctrl";
}

/** A modifier shortcut as each platform writes it: "⌘U" on a Mac, "Ctrl+U" elsewhere. */
export function modShortcut(key: string): string {
  return isMacPlatform() ? `⌘${key}` : `Ctrl+${key}`;
}
