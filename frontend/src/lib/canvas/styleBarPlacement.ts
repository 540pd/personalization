// Where the style bar goes over a Frame (#223).
//
// A Frame's name sits above its top-left corner, and the bar is centred
// above the selection. The bar used to be lifted a whole name row over every
// Frame, which left a gap of empty space over any Frame wide enough that the
// two never meet. Now it is lifted only when, at the shapes' height, it
// would actually sit on a selected Frame's name.
//
// Screen px throughout: the bar and the names keep their on-screen size at
// every zoom, while a Frame's width scales -- so the same Frame can need the
// lift at 50% and not at 100%.

import type { FrameRecord } from "@/store/frame.store";
import {
  LABEL_FONT_SIZE, LABEL_GAP, LABEL_LINE_HEIGHT, LABEL_MIN_NODE_W,
} from "@/constants/canvas.constants";

/** Screen px kept between the bar and a name on every side. */
export const NAME_CLEARANCE = 4;

export interface ScreenBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

type Viewport = { x: number; y: number; scale: number };

/**
 * A Frame's name on screen, or null when the name isn't drawn (a Frame too
 * narrow on screen for one, as FrameLabels has it). Left-aligned to the
 * Frame, never wider than it, its line box LABEL_GAP above the top edge.
 */
export function frameNameBox(frame: FrameRecord, vp: Viewport, textWidth: number): ScreenBox | null {
  const screenW = frame.canvasW * vp.scale;
  if (screenW < LABEL_MIN_NODE_W) return null;
  const left = vp.x + frame.canvasX * vp.scale;
  // NodeLabel sits the glyphs, not the line box, LABEL_GAP above the edge.
  const bottom = vp.y + frame.canvasY * vp.scale - LABEL_GAP + (LABEL_LINE_HEIGHT - LABEL_FONT_SIZE) / 2;
  return { left, right: left + Math.min(textWidth, screenW), top: bottom - LABEL_LINE_HEIGHT, bottom };
}

/** Would `bar` come within NAME_CLEARANCE of any of `names`? */
export function barMeetsNames(bar: ScreenBox, names: ScreenBox[]): boolean {
  return names.some((n) =>
    bar.left < n.right + NAME_CLEARANCE && n.left - NAME_CLEARANCE < bar.right &&
    bar.top < n.bottom + NAME_CLEARANCE && n.top - NAME_CLEARANCE < bar.bottom,
  );
}

let ctx: CanvasRenderingContext2D | null | undefined;

/**
 * The on-screen width of `text` set as a name: NodeLabel's size in the page's
 * font. Measured rather than read off the label's element, so a rename moves
 * the bar in the same render instead of one behind.
 */
export function nameTextWidth(text: string): number {
  if (typeof document === "undefined") return 0;
  if (ctx === undefined) ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return 0;
  ctx.font = `${LABEL_FONT_SIZE}px ${getComputedStyle(document.body).fontFamily}`;
  return ctx.measureText(text).width;
}
