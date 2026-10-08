"use client";

import { useEffect, useState } from "react";
import type { Rect } from "@/lib/canvas/coords";
import { useSidebar, sidebarInset } from "@/store/sidebar.store";

/**
 * The part of the window the canvas is actually visible in.
 *
 * The Konva container stays `position: fixed; inset: 0` — it runs underneath
 * the sidebar rather than beside it, which keeps Board's ResizeObserver and
 * the whole pointer-events layer-flip untouched, and lets content slide under
 * the rail instead of being clipped by it.
 *
 * The cost is that `window.innerWidth` stops meaning "the canvas". Six places
 * worked out a centre or an edge from the window, and every one of them would
 * be quietly wrong once a 260px rail covers the left side: a new node lands
 * centred on the window, so it sits partly behind the sidebar. None of them
 * would throw — which is the expensive kind of wrong.
 *
 * This is the one place that knows the difference.
 */

function rectFor(collapsed: boolean): Rect {
  const left = sidebarInset(collapsed);
  return {
    left,
    top: 0,
    width: Math.max(0, window.innerWidth - left),
    height: window.innerHeight,
  };
}

/** Imperative read, for handlers that already use `getState()`. */
export function canvasArea(): Rect {
  return rectFor(useSidebar.getState().collapsed);
}

/**
 * Reactive read, for components whose layout depends on it.
 *
 * Tracks the collapse as well as the resize: collapsing the rail changes the
 * visible area just as much as dragging the window does, and a component that
 * only listened to `resize` would keep placing things against the old inset
 * until something else happened to re-render it.
 */
export function useCanvasArea(): Rect {
  const collapsed = useSidebar((s) => s.collapsed);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const update = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const left = sidebarInset(collapsed);
  return { left, top: 0, width: Math.max(0, size.width - left), height: size.height };
}
