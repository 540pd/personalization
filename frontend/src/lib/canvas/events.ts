import { listen } from "@/lib/dom/listen";

/**
 * A window event the board's parts use to reach one another: the dock and
 * the style bar ask Board to recolour, upload or clear, because only Board
 * holds the Konva layer.
 *
 * Typed once, where it is defined, rather than by a cast in every listener
 * (#251).
 */
export interface CanvasEvent<T> {
  readonly name: string;
  emit(detail: T): void;
  /**
   * Listens, and returns what stops listening. The handler also gets the
   * event itself: listeners that commit an undo step key it on the event, so
   * one emit is one step however many of them act on it.
   */
  on(handler: (detail: T, event: Event) => void): () => void;
}

export function canvasEvent<T = void>(name: string): CanvasEvent<T> {
  return {
    name,
    emit: (detail) => window.dispatchEvent(new CustomEvent<T>(name, { detail })),
    on: (handler) => listen(window, name, (e) => handler((e as CustomEvent<T>).detail, e)),
  };
}
