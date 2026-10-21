// The box kinds: shapes that fill the box they were drawn in.

import type Konva from "konva";
import type { ShapeKind } from "@/store/tool.store";
import type { LineKind } from "./line";

export type BoxKind = Exclude<ShapeKind, LineKind>;

export type Pointing = "right" | "left" | "up" | "down";

export interface ShapeBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Traces a kind's outline in its own w x h box, from the top-left. */
type TraceOutline = (ctx: Konva.Context, w: number, h: number, node: Konva.Shape) => void;

/**
 * A block arrow's outline, as [along, across] pairs: a shaft half the
 * thickness and a head the full thickness. The head is the shorter of half
 * the length and the full thickness, so a long thin arrow does not grow a
 * head half its length.
 */
function blockArrowOutline(length: number, thick: number): [number, number][] {
  const head = Math.min(length / 2, thick);
  const neck = length - head;
  return [
    [0, thick / 4], [neck, thick / 4], [neck, 0], [length, thick / 2],
    [neck, thick], [neck, (thick * 3) / 4], [0, (thick * 3) / 4],
  ];
}

// Each fills the box it was drawn in, so a wide drag gives a wide shape. That
// is the reason for not using RegularPolygon, which only has a radius and so
// is always equal-sided.
export const BOX_OUTLINES: Record<BoxKind, TraceOutline> = {
  rect: (ctx, w, h) => ctx.rect(0, 0, w, h),
  ellipse: (ctx, w, h) => ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2),
  triangle: (ctx, w, h) => {
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
  },
  diamond: (ctx, w, h) => {
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w, h / 2);
    ctx.lineTo(w / 2, h);
    ctx.lineTo(0, h / 2);
  },
  // Drawn along whichever axis it points, then mapped back onto x/y, so
  // one outline serves all four directions.
  blockArrow: (ctx, w, h, node) => {
    const pointing = (node.getAttr("pointing") as Pointing | undefined) ?? "right";
    const across = pointing === "up" || pointing === "down";
    const length = across ? h : w;
    const toXY = ([along, side]: [number, number]): [number, number] => {
      switch (pointing) {
        case "right": return [along, side];
        case "left": return [length - along, side];
        case "down": return [side, along];
        case "up": return [side, length - along];
      }
    };
    blockArrowOutline(length, across ? w : h).forEach((pt, i) => {
      const [px, py] = toXY(pt);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
  },
};

/**
 * Which way a block arrow drawn from `start` to `at` points: along whichever
 * axis the drag mostly went, toward where it went.
 */
export function pointingOf(start: Konva.Vector2d, at: Konva.Vector2d): Pointing {
  const dx = at.x - start.x;
  const dy = at.y - start.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy < 0 ? "up" : "down";
}

/**
 * The box from where a draw began to where the pointer is now.
 *
 * `square` (Shift) makes both sides the longer of the two, still growing in
 * the direction the pointer went, so a square drawn up and to the left ends
 * under the pointer rather than flipping back down.
 */
export function drawnBox(start: Konva.Vector2d, at: Konva.Vector2d, square: boolean): ShapeBox {
  let dx = at.x - start.x;
  let dy = at.y - start.y;
  if (square) {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    dx = (dx < 0 ? -1 : 1) * side;
    dy = (dy < 0 ? -1 : 1) * side;
  }
  return {
    x: Math.min(start.x, start.x + dx),
    y: Math.min(start.y, start.y + dy),
    width: Math.abs(dx),
    height: Math.abs(dy),
  };
}
