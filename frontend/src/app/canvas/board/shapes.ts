// Shapes drawn from the dock's Shapes menu.
//
// Every shape is one class, drawn from its own width and height, rather than
// a mix of Konva.Rect, Konva.Ellipse and friends. The rest of the board reads
// a node as x/y at its TOP-LEFT plus width x height -- syncNodeGeometry, the
// hover and selection outlines, frame membership, occlusion -- and the native
// classes disagree about that: an Ellipse sits on its centre and a
// RegularPolygon is sized by a radius. One top-left box keeps every shape on
// the path images already use.
//
// Lines and arrows keep that box too: it is whatever contains the line, and
// `linePoints` places its two ends inside it. The box is what frames, the
// minimap and occlusion read; the ends are only needed to draw the line and
// to place its handles.

import Konva from "konva";
import type { ShapeKind } from "@/store/tool.store";
import { LINE_HIT_SLOP, SHAPE_STYLE } from "@/constants/canvas.constants";

export interface BoardShapeConfig extends Konva.ShapeConfig {
  shapeKind: ShapeKind;
  /**
   * Lines only: [ax, ay, bx, by], the two ends relative to the node's x/y.
   * Relative, so moving the node -- a drag, a frame carrying it -- moves the
   * line without touching these.
   */
  linePoints?: number[];
}

/** Drawn as a stroke between two points rather than a filled box. */
export function isLineKind(kind: ShapeKind): boolean {
  return kind === "line" || kind === "arrow";
}

export interface LineEnds {
  /** Where the line starts. An arrow's tail. */
  a: Konva.Vector2d;
  /** Where it ends. An arrow's head. */
  b: Konva.Vector2d;
}

export class BoardShape extends Konva.Shape<BoardShapeConfig> {
  // Konva's Shape draws through this for the scene and, with no hitFunc set,
  // for hit-testing too -- so a click registers exactly where paint does.
  _sceneFunc(ctx: Konva.Context) {
    const w = this.width();
    const h = this.height();
    ctx.beginPath();
    if (isLineKind(this.shapeKind())) {
      this.traceLine(ctx);
      // Stroke only: a line has no inside, and filling the box would make
      // the whole box clickable.
      ctx.strokeShape(this);
      return;
    }
    switch (this.shapeKind()) {
      case "rect":
        ctx.rect(0, 0, w, h);
        break;
      // Each fills the box it was drawn in, so a wide drag gives a wide
      // shape. That is the reason for not using RegularPolygon, which only
      // has a radius and so is always equal-sided.
      case "ellipse":
        ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        break;
      case "triangle":
        ctx.moveTo(w / 2, 0);
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        break;
      case "diamond":
        ctx.moveTo(w / 2, 0);
        ctx.lineTo(w, h / 2);
        ctx.lineTo(w / 2, h);
        ctx.lineTo(0, h / 2);
        break;
    }
    ctx.closePath();
    ctx.fillStrokeShape(this);
  }

  /** The line, and an arrow's open head, in the node's own coordinates. */
  private traceLine(ctx: Konva.Context) {
    const { a, b } = localEnds(this);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    if (this.shapeKind() !== "arrow") return;
    // An open chevron rather than a filled head, so the whole arrow is one
    // stroke -- painted, and hit-tested, by the same strokeShape call.
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const len = Math.max(10, this.strokeWidth() * 5);
    for (const side of [-1, 1]) {
      const t = angle + Math.PI + (side * Math.PI) / 6;
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x + len * Math.cos(t), b.y + len * Math.sin(t));
    }
  }

  /**
   * Hit width for a line: LINE_HIT_SLOP screen px each side, at any zoom.
   *
   * Konva's hit stroke reads this getter, so overriding it keeps the slop in
   * screen px without anything having to re-set it when the board zooms.
   * Box shapes keep Konva's own behaviour.
   */
  getHitStrokeWidth(): number | "auto" {
    // attrs, not getAttr: getAttr would call straight back into this getter.
    const own = this.attrs.hitStrokeWidth as number | "auto" | undefined;
    if (!isLineKind(this.shapeKind())) return own ?? "auto";
    const scale = this.getAbsoluteScale().x || 1;
    return Math.max(this.strokeWidth(), (LINE_HIT_SLOP * 2) / scale);
  }

  shapeKind(): ShapeKind {
    return this.getAttr("shapeKind") as ShapeKind;
  }
}

function localEnds(n: BoardShape): LineEnds {
  // A line still being created has no points yet: corner to corner.
  const [ax, ay, bx, by] =
    (n.getAttr("linePoints") as number[] | undefined) ?? [0, 0, n.width(), n.height()];
  return { a: { x: ax, y: ay }, b: { x: bx, y: by } };
}

/** A line's two ends, in canvas units. */
export function lineEnds(n: BoardShape): LineEnds {
  const { a, b } = localEnds(n);
  return {
    a: { x: n.x() + a.x, y: n.y() + a.y },
    b: { x: n.x() + b.x, y: n.y() + b.y },
  };
}

/** The box and points that put a line's ends at `a` and `b`. */
export function lineAttrs(a: Konva.Vector2d, b: Konva.Vector2d) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
    linePoints: [a.x - x, a.y - y, b.x - x, b.y - y],
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
// What getClassName() reports, which is how a paste knows what to rebuild.
BoardShape.prototype.className = "BoardShape";

export function isBoardShape(n: Konva.Node): n is BoardShape {
  return n instanceof BoardShape;
}

export interface ShapeBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function createShape(kind: ShapeKind, box: ShapeBox): BoardShape {
  if (isLineKind(kind)) {
    // No fill: a line has no inside to paint or to click.
    const { stroke, strokeWidth } = SHAPE_STYLE;
    return new BoardShape({
      stroke, strokeWidth, ...box, shapeKind: kind,
      lineCap: "round", lineJoin: "round",
    });
  }
  return new BoardShape({ ...SHAPE_STYLE, ...box, shapeKind: kind });
}

/**
 * Folds a resize back into width and height.
 *
 * The transformer resizes by setting scale, which is fine for an image but
 * scales a shape's stroke with it: a rectangle dragged to four times its size
 * would draw a line four times as thick. Called on every transform frame, so
 * the stroke never visibly thickens and then snaps back.
 */
export function bakeScale(n: BoardShape): void {
  n.setAttrs({
    width: n.width() * n.scaleX(),
    height: n.height() * n.scaleY(),
    scaleX: 1,
    scaleY: 1,
  });
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
