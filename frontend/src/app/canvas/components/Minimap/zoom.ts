import type { Bounds } from "@/lib/canvas/bounds";
import { stagePositionFor, type Rect } from "@/lib/canvas/coords";
import { MIN_SCALE, MAX_SCALE } from "@/store/viewport.store";

/**
 * The zoom actions behind the % menu.
 *
 * Pure: each takes the current viewport and returns the next one, so the
 * arithmetic is testable without a stage. The menu used to call `reset()` for
 * three of its five entries, which is why "Zoom to fit" and "Zoom to 100%"
 * did the same thing and "Zoom to selection" did nothing at all.
 */

export interface ViewportState {
  x: number;
  y: number;
  scale: number;
}

export const ZOOM_STEP = 0.1;

/** Leave this fraction of the viewport as margin when fitting. */
export const FIT_PAD = 0.1;

export function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

/**
 * One step in or out, anchored on the centre of the visible canvas so nothing
 * jumps.
 *
 * `left`, not just `width`: the rail covers the left of the window while the
 * canvas runs full-bleed underneath it, so the middle of the window is 100px
 * inside the rail rather than the middle of what you can see. Anchoring there
 * grew a centred image almost entirely to the right — four steps from 100% to
 * 140% moved its right edge 160px and its left edge not at all.
 *
 * `viewportCentre` and `stagePositionFor` both already add it, which is why
 * "zoom to fit" was centred correctly and only the +/- step drifted.
 */
export function zoomStep(vp: ViewportState, direction: 1 | -1, area: Rect): ViewportState {
  // Rounded to 2dp so repeated steps land on readable percentages rather
  // than drifting to 70.00000000000001%.
  const scale = clampScale(Math.round((vp.scale + direction * ZOOM_STEP) * 100) / 100);
  const cx = (area.left ?? 0) + area.width / 2;
  const cy = (area.top ?? 0) + area.height / 2;
  const ratio = scale / vp.scale;
  return { scale, x: cx - ratio * (cx - vp.x), y: cy - ratio * (cy - vp.y) };
}

/**
 * Scale and centre so `bounds` fills the viewport, with a margin.
 *
 * Uses the smaller of the two axis ratios, so the box fits on its tightest
 * edge rather than overflowing the other one.
 */
export function fitTo(bounds: Bounds, size: Rect): ViewportState {
  // A zero-area box (a degenerate node, or an empty board) would divide by
  // zero and send the scale to Infinity; fall back to 1:1 on that point.
  const w = Math.max(bounds.w, 1);
  const h = Math.max(bounds.h, 1);
  const scale = clampScale(
    Math.min(size.width / (w * (1 + FIT_PAD)), size.height / (h * (1 + FIT_PAD)))
  );
  const centre = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
  return { scale, ...stagePositionFor(centre, scale, size) };
}

export type ZoomAction = "in" | "out" | "reset" | "fit" | "selection";

export interface ZoomShortcut {
  action: ZoomAction;
  /** The % menu's entry. */
  label: string;
  /** Ctrl or ⌘ with the key; otherwise Shift with it. */
  mod: boolean;
  codes: readonly string[];
  /** The key as the menu shows it. */
  key: string;
}

/** The zoom keys, written once for both the handler and the % menu. */
export const ZOOM_SHORTCUTS: readonly ZoomShortcut[] = [
  { action: "in", label: "Zoom in", mod: true, codes: ["Equal", "NumpadAdd"], key: "=" },
  { action: "out", label: "Zoom out", mod: true, codes: ["Minus", "NumpadSubtract"], key: "–" },
  // e.code, not e.key: with Shift held, e.key is the SHIFTED character,
  // so Shift+0 arrives as ")" and `e.key === "0"` was never true. The
  // advertised "Zoom to 100%" shortcut could not fire at all.
  { action: "reset", label: "Zoom to 100%", mod: false, codes: ["Digit0"], key: "0" },
  { action: "fit", label: "Zoom to fit", mod: false, codes: ["Digit1"], key: "1" },
  { action: "selection", label: "Zoom to selection", mod: false, codes: ["Digit2"], key: "2" },
];

type KeyLike = Pick<KeyboardEvent, "code" | "ctrlKey" | "metaKey" | "shiftKey">;

/** The zoom a key asks for, if any. Ctrl/⌘ with a Shift key is none. */
export function zoomShortcutFor(e: KeyLike): ZoomShortcut | null {
  const mod = e.ctrlKey || e.metaKey;
  return ZOOM_SHORTCUTS.find((s) => (s.mod ? mod : !mod && e.shiftKey) && s.codes.includes(e.code)) ?? null;
}

/** "⌘ + =" (or "Ctrl + =", per `modLabel`), "⇧ + 0". */
export function shortcutLabel(s: ZoomShortcut, modLabel: string): string {
  return `${s.mod ? modLabel : "⇧"} + ${s.key}`;
}
