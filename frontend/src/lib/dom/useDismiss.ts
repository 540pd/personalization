"use client";

import { useEffect, useRef, type RefObject } from "react";
import { disposeAll, listen } from "./listen";

/** An element a press may land on without dismissing: a ref, or a getter for one. */
export type DismissInside = RefObject<Element | null> | (() => Element | null | undefined);

export interface DismissOptions {
  /**
   * Escape closes too. "bubble" listens on the window as usual; "claim"
   * catches it in the capture phase and stops it there, so a handler further
   * down (Board's, which drops the selection) never sees it.
   */
  escape?: "bubble" | "claim";
}

const resolve = (inside: DismissInside) => (typeof inside === "function" ? inside() : inside.current);

/**
 * Closes a popover on a mousedown outside every `inside` element, and on
 * Escape if asked. Listens only while `open`. The latest `onClose` is used,
 * so an inline callback does not re-register the listeners each render.
 */
export function useDismiss(
  open: boolean,
  inside: DismissInside[],
  onClose: () => void,
  { escape }: DismissOptions = {},
): void {
  const latest = useRef({ inside, onClose });
  latest.current = { inside, onClose };

  useEffect(() => {
    if (!open) return;
    const disposers = [
      listen(document, "mousedown", (e) => {
        const target = e.target as Node;
        if (!latest.current.inside.some((i) => resolve(i)?.contains(target))) latest.current.onClose();
      }),
    ];
    if (escape) {
      const claim = escape === "claim";
      disposers.push(listen(window, "keydown", (e) => {
        if (e.key !== "Escape") return;
        if (claim) e.stopPropagation();
        latest.current.onClose();
      }, claim));
    }
    return () => disposeAll(disposers);
  }, [open, escape]);
}
