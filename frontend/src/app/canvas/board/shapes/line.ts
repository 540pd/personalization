// The line kinds, line and arrow: drawn as a stroke between two points.
//
// They keep a box too: it is whatever contains the line -- curve included --
// and `linePoints` places its two ends inside it. The box is what frames, the
// minimap and occlusion read; the ends are only needed to draw the line and
// to place its handles.

import type Konva from "konva";
import type { ShapeKind } from "@/store/tool.store";

export type LineKind = Extract<ShapeKind, "line" | "arrow">;

/** Drawn as a stroke between two points rather than a filled box. */
export function isLineKind(kind: ShapeKind): kind is LineKind {
  return kind === "line" || kind === "arrow";
}

export interface LineEnds {
  /** Where the line starts. An arrow's tail. */
  a: Konva.Vector2d;
  /** Where it ends. An arrow's head. */
  b: Konva.Vector2d;
}

function localEnds(n: Konva.Shape): LineEnds {
  // A line still being created has no points yet: corner to corner.
  const [ax, ay, bx, by] =
    (n.getAttr("linePoints") as number[] | undefined) ?? [0, 0, n.width(), n.height()];
  return { a: { x: ax, y: ay }, b: { x: bx, y: by } };
}

export function lineBend(n: Konva.Shape): number {
  return (n.getAttr("bend") as number | undefined) ?? 0;
}

/** A line's two ends, in canvas units. */
export function lineEnds(n: Konva.Shape): LineEnds {
  const { a, b } = localEnds(n);
  return {
    a: { x: n.x() + a.x, y: n.y() + a.y },
    b: { x: n.x() + b.x, y: n.y() + b.y },
  };
}

/** Unit normal to a->b, on its left. Zero for a line of no length. */
function normalOf(a: Konva.Vector2d, b: Konva.Vector2d): Konva.Vector2d {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  return len ? { x: dy / len, y: -dx / len } : { x: 0, y: 0 };
}

/** Where the curve passes halfway along: the middle handle. */
export function curveMid(a: Konva.Vector2d, b: Konva.Vector2d, bend: number): Konva.Vector2d {
  const n = normalOf(a, b);
  return { x: (a.x + b.x) / 2 + n.x * bend, y: (a.y + b.y) / 2 + n.y * bend };
}

/**
 * The quadratic control point that puts the curve's midpoint `bend` off the
 * chord. At t = 0.5 a quadratic is (a + 2c + b) / 4, so c is twice as far out.
 */
export function controlPoint(a: Konva.Vector2d, b: Konva.Vector2d, bend: number): Konva.Vector2d {
  return curveMid(a, b, bend * 2);
}

/**
 * The bend that puts the curve's midpoint level with `p`.
 *
 * Only the part of `p` square to the line counts, so the curve stays
 * symmetric and the handle slides along the line's perpendicular bisector.
 */
export function bendToward(a: Konva.Vector2d, b: Konva.Vector2d, p: Konva.Vector2d): number {
  const n = normalOf(a, b);
  return (p.x - (a.x + b.x) / 2) * n.x + (p.y - (a.y + b.y) / 2) * n.y;
}

/** Smallest and largest value a quadratic reaches on one axis. */
function quadExtent(p0: number, p1: number, p2: number): [number, number] {
  let lo = Math.min(p0, p2);
  let hi = Math.max(p0, p2);
  const denom = p0 - 2 * p1 + p2;
  if (denom) {
    const t = (p0 - p1) / denom;
    if (t > 0 && t < 1) {
      const v = (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  return [lo, hi];
}

/**
 * The box, points and bend for a line from `a` to `b`.
 *
 * The box is the curve's own extent, not the chord's, so a frame only
 * carries a curved line it wholly contains and nothing is hidden behind a
 * bulge the box does not know about.
 */
export function lineAttrs(a: Konva.Vector2d, b: Konva.Vector2d, bend = 0) {
  const c = controlPoint(a, b, bend);
  const [x, right] = quadExtent(a.x, c.x, b.x);
  const [y, bottom] = quadExtent(a.y, c.y, b.y);
  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
    linePoints: [a.x - x, a.y - y, b.x - x, b.y - y],
    bend,
  };
}

/** `to`, swung round `from` to the nearest 45 degrees, keeping its length. */
export function snap45(from: Konva.Vector2d, to: Konva.Vector2d): Konva.Vector2d {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const step = Math.PI / 4;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  const len = Math.hypot(dx, dy);
  // Rounded so a snapped horizontal line is exactly horizontal, rather than
  // a box 1e-14 tall.
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { x: r(from.x + len * Math.cos(angle)), y: r(from.y + len * Math.sin(angle)) };
}

/** The line, and an arrow's head, painted on the scene or the hit canvas. */
export function paintLine(ctx: Konva.Context, n: Konva.Shape, kind: LineKind, scene: boolean) {
  traceLine(ctx, n);
  // Stroke only: a line has no inside, and filling the box would make
  // the whole box clickable.
  ctx.strokeShape(n);
  if (kind === "arrow") paintHead(ctx, n, scene);
}

/** The line, in the node's own coordinates. */
function traceLine(ctx: Konva.Context, n: Konva.Shape) {
  const { a, b } = localEnds(n);
  const bend = lineBend(n);
  // A quadratic curve whose midpoint is `bend` off the chord. Its control
  // point is twice as far out, which is why the handle is not placed on it.
  const c = controlPoint(a, b, bend);
  ctx.moveTo(a.x, a.y);
  if (bend) ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
  else ctx.lineTo(b.x, b.y);
}

/**
 * An arrow's head, stroked on its own path after the shaft. Always solid
 * (#162): dashed, a head this short reads as broken. Konva would dash it
 * along with the shaft, so on the scene a dashed head is stroked directly;
 * the hit canvas ignores dashes anyway.
 */
function paintHead(ctx: Konva.Context, n: Konva.Shape, scene: boolean) {
  ctx.beginPath();
  traceHead(ctx, n);
  if (!scene || !n.dashEnabled()) {
    ctx.strokeShape(n);
    return;
  }
  ctx.save();
  ctx.setLineDash([]);
  ctx.setAttr("strokeStyle", n.stroke());
  ctx.setAttr("lineWidth", n.strokeWidth());
  ctx.setAttr("lineCap", "round");
  ctx.setAttr("lineJoin", "round");
  ctx.stroke();
  ctx.restore();
}

/** An arrow's open head, in the node's own coordinates. */
function traceHead(ctx: Konva.Context, n: Konva.Shape) {
  const { a, b } = localEnds(n);
  const bend = lineBend(n);
  const c = controlPoint(a, b, bend);
  // An open chevron rather than a filled head, so it is painted and
  // hit-tested as a stroke like the shaft. It follows the curve's
  // direction at the tip, which is from the control point, not from the
  // tail.
  const from = bend ? c : a;
  const angle = Math.atan2(b.y - from.y, b.x - from.x);
  const len = Math.max(10, n.strokeWidth() * 5);
  for (const side of [-1, 1]) {
    const t = angle + Math.PI + (side * Math.PI) / 6;
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x + len * Math.cos(t), b.y + len * Math.sin(t));
  }
}
