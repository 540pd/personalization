// A shape's Color, Fill and Stroke, as the style bar above a selected shape
// sets them (#161).
//
// The three are kept on the node as plain attrs -- `swatch`, `fillMode`,
// `strokeMode` and Konva's own `strokeWidth` -- and Konva's fill, stroke and
// dash are worked out from them. Plain attrs, so undo, copy-paste and
// duplicate carry a style exactly as they carry a position, with no changes
// to any of them. Every shape is created with all of them set, which undo
// relies on: it restores the attrs a snapshot has and leaves the rest.

import type Konva from "konva";
import { SHAPE_STYLE } from "@/constants/canvas.constants";
import { outlineFor } from "./palette";

export type FillMode = "none" | "pattern" | "solid";
export type StrokeMode = "none" | "solid" | "dashed" | "dotted";

export const FILL_MODES: readonly FillMode[] = ["none", "pattern", "solid"];
export const STROKE_MODES: readonly StrokeMode[] = ["none", "solid", "dashed", "dotted"];
/** The four thicknesses, thin to thick. The second is today's default. */
export const STROKE_WIDTHS: readonly number[] = [1, SHAPE_STYLE.strokeWidth, 4, 6];

export interface ShapeStyle {
  /** A palette hex, or null for the default grey a shape is drawn in. */
  color: string | null;
  fill: FillMode;
  stroke: StrokeMode;
  width: number;
}

/** How a new shape is drawn, and how one from before the bar reads. */
export const DEFAULT_STYLE: ShapeStyle = {
  color: null,
  fill: "solid",
  stroke: "solid",
  width: SHAPE_STYLE.strokeWidth,
};

/** How far a Pattern fill's backdrop is toward white from the colour. */
const TINT = 0.88;

/** The pale backdrop behind a Pattern fill's dots. */
export function tintFor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lift = (c: number) => Math.round(c + (255 - c) * TINT);
  const [r, g, b] = [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff].map(lift);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** The style a shape's attrs describe. */
export function readStyle(n: Konva.Node): ShapeStyle {
  return {
    color: (n.getAttr("swatch") as string | undefined) || DEFAULT_STYLE.color,
    fill: (n.getAttr("fillMode") as FillMode | undefined) ?? DEFAULT_STYLE.fill,
    stroke: (n.getAttr("strokeMode") as StrokeMode | undefined) ?? DEFAULT_STYLE.stroke,
    width: (n.getAttr("strokeWidth") as number | undefined) ?? DEFAULT_STYLE.width,
  };
}

/**
 * `style` with `patch` applied, never leaving a shape invisible: with no
 * fill, a shape always keeps an outline. Fill None on a shape with no stroke
 * brings back the default solid one, and Stroke None does nothing to a shape
 * with no fill.
 */
export function patchStyle(style: ShapeStyle, patch: Partial<ShapeStyle>): ShapeStyle {
  const next = { ...style, ...patch };
  if (next.fill === "none" && next.stroke === "none") next.stroke = "solid";
  return next;
}

/** The colour of the dots in a Pattern fill. */
export function dotColor(n: Konva.Node): string {
  return (n.getAttr("swatch") as string | undefined) || SHAPE_STYLE.stroke;
}

/**
 * The Konva attrs that draw a filled shape in `style`. Lines and arrows are
 * not filled shapes and do not come through here.
 *
 * Every fill is outlined a quarter darker than the colour, as Color does
 * (#159), so a white or pale shape still shows on the board.
 */
export function styleAttrs(style: ShapeStyle): Konva.ShapeConfig {
  const { color, fill, stroke, width } = style;
  const outline = color ? outlineFor(color) : SHAPE_STYLE.stroke;
  const inside =
    fill === "solid" ? color ?? SHAPE_STYLE.fill
    : fill === "pattern" ? (color ? tintFor(color) : SHAPE_STYLE.fill)
    // Transparent rather than unset: the inside stays clickable, as it is on
    // a filled shape, rather than only the outline.
    : "transparent";
  return {
    // "" rather than null for the default: Konva drops a null attr, and an
    // undo puts back only the attrs its snapshot has, so a colour picked
    // after it would survive the undo.
    swatch: color ?? "",
    fillMode: fill,
    strokeMode: stroke,
    fill: inside,
    stroke: outline,
    strokeWidth: width,
    strokeEnabled: stroke !== "none",
    // In proportion to the width, so a thick dashed line is not a run of
    // squares. A zero-length dash with round caps is a dot.
    dash: stroke === "dashed" ? [width * 4, width * 3] : stroke === "dotted" ? [0, width * 2 + 2] : [],
    dashEnabled: stroke === "dashed" || stroke === "dotted",
    lineCap: stroke === "dotted" ? "round" : "butt",
  };
}

/** True if every attr `attrs` names already has that value on `n`. */
export function hasAttrs(n: Konva.Node, attrs: Konva.ShapeConfig): boolean {
  return Object.entries(attrs).every(([k, v]) => {
    const cur = n.getAttr(k);
    return Array.isArray(v) ? Array.isArray(cur) && v.join() === cur.join() : cur === v;
  });
}

// --- Pattern fill -----------------------------------------------------------
// A staggered grid of small dots, as in the reference. Drawn from a tile in
// canvas units, so the dots grow and shrink with the board like the shape
// does. The tile is rendered at TILE_RES times that size and scaled back
// down, so they stay round when zoomed in.

const DOT_PITCH = 6; // canvas units between dots in a row
const DOT_RADIUS = 1.05;
const TILE_RES = 4;

const tiles = new Map<string, HTMLCanvasElement | null>();

function dotTile(hex: string): HTMLCanvasElement | null {
  if (tiles.has(hex)) return tiles.get(hex)!;
  const size = DOT_PITCH * TILE_RES;
  const tile = document.createElement("canvas");
  tile.width = tile.height = size;
  const c = tile.getContext("2d");
  if (c) {
    c.fillStyle = hex;
    // One dot in the tile's corner quarter and one in the opposite: tiled,
    // each row sits half a pitch along from the one above.
    [[0.25, 0.25], [0.75, 0.75]].forEach(([fx, fy]) => {
      c.beginPath();
      c.arc(fx * size, fy * size, DOT_RADIUS * TILE_RES, 0, Math.PI * 2);
      c.fill();
    });
  }
  const result = c ? tile : null; // no 2D canvas under jsdom
  tiles.set(hex, result);
  return result;
}

/** Fills the context's current path with the dots, over whatever is there. */
export function fillDots(ctx: Konva.Context, hex: string): void {
  const tile = dotTile(hex);
  const pattern = tile && ctx._context.createPattern(tile, "repeat");
  if (!pattern) return;
  pattern.setTransform(new DOMMatrix().scale(1 / TILE_RES));
  ctx.save();
  ctx.setAttr("fillStyle", pattern);
  ctx.fill();
  ctx.restore();
}
