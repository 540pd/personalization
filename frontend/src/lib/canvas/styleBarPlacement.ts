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
import { toScreen } from "./coords";
import type { TopAnchoredBox } from "./bounds";

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
export function frameNameBox(
  frame: Pick<FrameRecord, "canvasX" | "canvasY" | "canvasW">,
  vp: Viewport,
  textWidth: number,
): ScreenBox | null {
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

export const BAR_HEIGHT = 44; // screen px, matches .shape-style-bar
export const BAR_GAP = 14; // screen px between the selection box and the bar, clear of the corner handles
export const MIN_TOP = 8; // screen px the bar keeps from the top of the window
// A Frame's name sits above its top-left corner. Where the bar would sit on
// a selected Frame's name, it goes above that row instead (#223).
export const FRAME_NAME_CLEARANCE = LABEL_GAP + LABEL_LINE_HEIGHT;

/** A selected item's box, in canvas units, with the name drawn above it if any. */
export type NamedBox = TopAnchoredBox & { label?: string };

export interface BarPlacement {
  /** Screen x of the bar's centre. */
  centre: number;
  /** Screen y of the bar's top edge. */
  top: number;
  /** No room above on screen: the bar sits under the selection instead. */
  below: boolean;
}

/**
 * Where the bar goes for a selection: centred above its box on screen,
 * lifted over any name it would sit on, and flipped below when there is no
 * room above. `items` are the selection's nodes, whose names are drawn only
 * when they have one; `frames` always have theirs. `measure` is a name's
 * on-screen width (nameTextWidth in the app).
 */
export function barPlacement({ items, frames, vp, barW, measure }: {
  items: NamedBox[];
  frames: NamedBox[];
  vp: Viewport;
  barW: number;
  measure: (text: string) => number;
}): BarPlacement {
  const boxes = [...items, ...frames];
  const left = Math.min(...boxes.map((r) => r.canvasX));
  const top = Math.min(...boxes.map((r) => r.canvasY));
  const right = Math.max(...boxes.map((r) => r.canvasX + r.canvasW));
  const bottom = Math.max(...boxes.map((r) => r.canvasY + r.canvasH));
  const a = toScreen({ x: left, y: top }, vp);
  const b = toScreen({ x: right, y: bottom }, vp);
  const centre = (a.x + b.x) / 2;
  const bar: ScreenBox = {
    left: centre - barW / 2, right: centre + barW / 2,
    top: a.y - BAR_GAP - BAR_HEIGHT, bottom: a.y - BAR_GAP,
  };
  // Names above: a selected Frame's, and an image's or generated node's (#243).
  const names = [
    ...frames.map((f) => frameNameBox(f, vp, measure(f.label ?? ""))),
    ...items.flatMap((n) => (n.label ? [frameNameBox(n, vp, measure(n.label))] : [])),
  ].filter((n): n is ScreenBox => !!n);
  const lift = barMeetsNames(bar, names) ? FRAME_NAME_CLEARANCE : 0;
  const above = bar.top - lift;
  const below = above < MIN_TOP;
  return { centre, top: below ? b.y + BAR_GAP : above, below };
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
