import { listen, disposeAll } from "./listen";

export interface PointerHandlers {
  onMove?: (e: PointerEvent) => void;
  /** The release. */
  onUp?: (e: PointerEvent) => void;
  /**
   * The gesture ended with no release: pointercancel, or the window lost
   * focus (a release outside it never arrives).
   */
  onCancel?: () => void;
}

/**
 * Follows one pointer gesture on the window, so it survives the pointer
 * leaving whatever it began on, until it is released or cancelled. Returns
 * what stops following early; ending stops it too, before the handler runs.
 *
 * Every window drag used to wire this by hand, and two of them never
 * listened for a cancel, so a cancelled touch left them following (#250).
 */
export function trackPointer({ onMove, onUp, onCancel }: PointerHandlers): () => void {
  const off: Array<() => void> = [];
  let live = true;
  const stop = () => {
    if (!live) return;
    live = false;
    disposeAll(off);
  };
  if (onMove) off.push(listen(window, "pointermove", onMove));
  off.push(listen(window, "pointerup", (e) => { stop(); onUp?.(e); }));
  const cancel = () => { stop(); onCancel?.(); };
  off.push(listen(window, "pointercancel", cancel));
  off.push(listen(window, "blur", cancel));
  return stop;
}
