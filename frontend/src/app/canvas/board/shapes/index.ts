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
// What differs by kind lives beside this: each box kind's outline in ./box,
// the line kinds' geometry and painting in ./line.

import Konva from "konva";
import type { ShapeKind } from "@/store/tool.store";
import { LINE_HIT_SLOP } from "@/constants/canvas.constants";
import { DEFAULT_STYLE, dotColor, fillDots, lineStyleAttrs, styleAttrs } from "../shapeStyle";
import { BOX_OUTLINES, type Pointing, type ShapeBox } from "./box";
import { isLineKind, paintLine } from "./line";

export { drawnBox, pointingOf, type Pointing, type ShapeBox } from "./box";
export {
  bendToward, controlPoint, curveMid, isLineKind, lineAttrs, lineBend, lineEnds, snap45, type LineEnds,
} from "./line";

export interface BoardShapeConfig extends Konva.ShapeConfig {
  shapeKind: ShapeKind;
  /**
   * Lines only: [ax, ay, bx, by], the two ends relative to the node's x/y.
   * Relative, so moving the node -- a drag, a frame carrying it -- moves the
   * line without touching these.
   */
  linePoints?: number[];
  /**
   * Lines only: how far the curve's midpoint sits off the straight line
   * between the ends, in canvas units; positive is to the left going from
   * a to b. 0 is straight. Kept relative to the ends, so moving either end
   * keeps the same bulge on the same side.
   */
  bend?: number;
  /** Block arrows only: which side of its box the head is on. */
  pointing?: Pointing;
}

export class BoardShape extends Konva.Shape<BoardShapeConfig> {
  // Konva's Shape draws the scene through this and hit-testing through
  // _hitFunc. Both trace the same path, so a click registers exactly where
  // paint does; only the scene gets a Pattern fill's dots (#161), which on
  // the hit canvas would punch holes in the shape's hit colour.
  _sceneFunc(ctx: Konva.Context) {
    this.paint(ctx, true);
  }

  _hitFunc(ctx: Konva.Context) {
    this.paint(ctx, false);
  }

  private paint(ctx: Konva.Context, scene: boolean) {
    const kind = this.shapeKind();
    ctx.beginPath();
    if (isLineKind(kind)) {
      paintLine(ctx, this, kind, scene);
      return;
    }
    BOX_OUTLINES[kind]?.(ctx, this.width(), this.height(), this);
    ctx.closePath();
    if (scene && this.getAttr("fillMode") === "pattern") {
      ctx.fillShape(this);
      fillDots(ctx, dotColor(this));
      ctx.strokeShape(this);
      return;
    }
    ctx.fillStrokeShape(this);
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
// What getClassName() reports, which is how a paste knows what to rebuild.
BoardShape.prototype.className = "BoardShape";

export function isBoardShape(n: Konva.Node): n is BoardShape {
  return n instanceof BoardShape;
}

/**
 * A new shape, in the dock's current colour if one is picked (#159) and the
 * default style if not.
 */
export function createShape(kind: ShapeKind, box: ShapeBox, color?: string | null): BoardShape {
  if (isLineKind(kind)) {
    // No fill: a line has no inside to paint or to click.
    return new BoardShape({
      ...lineStyleAttrs({ ...DEFAULT_STYLE, color: color ?? null }), ...box, shapeKind: kind,
      lineCap: "round", lineJoin: "round",
    });
  }
  return new BoardShape({ ...styleAttrs({ ...DEFAULT_STYLE, color: color ?? null }), ...box, shapeKind: kind });
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
