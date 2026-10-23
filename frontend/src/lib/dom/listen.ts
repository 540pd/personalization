/**
 * Adds a listener and returns what removes it, so a setup can collect its
 * disposers in one list instead of mirroring every addEventListener with a
 * removeEventListener that has to match it exactly.
 */
export function listen<K extends keyof WindowEventMap>(
  target: Window, type: K, handler: (e: WindowEventMap[K]) => void, options?: boolean | AddEventListenerOptions,
): () => void;
export function listen<K extends keyof DocumentEventMap>(
  target: Document, type: K, handler: (e: DocumentEventMap[K]) => void, options?: boolean | AddEventListenerOptions,
): () => void;
export function listen<K extends keyof HTMLElementEventMap>(
  target: HTMLElement, type: K, handler: (e: HTMLElementEventMap[K]) => void, options?: boolean | AddEventListenerOptions,
): () => void;
export function listen(
  target: EventTarget, type: string, handler: (e: Event) => void, options?: boolean | AddEventListenerOptions,
): () => void;
export function listen(
  target: EventTarget, type: string, handler: (e: Event) => void, options?: boolean | AddEventListenerOptions,
): () => void {
  target.addEventListener(type, handler, options);
  return () => target.removeEventListener(type, handler, options);
}

/** Runs every disposer, in reverse order of setup. */
export function disposeAll(disposers: Array<() => void>): void {
  for (let i = disposers.length - 1; i >= 0; i--) disposers[i]();
  disposers.length = 0;
}
