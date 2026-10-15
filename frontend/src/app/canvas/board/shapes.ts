// Shapes drawn from the dock's Shapes menu.
//
// Every shape is one class, drawn from its own width and height, rather than
// a mix of Konva.Rect, Konva.Ellipse and friends. The rest of the board reads
// a node as x/y at its TOP-LEFT plus width x height -- syncNodeGeometry, the
// hover and selection outlines, frame membership, occlusion -- and the native
// classes disagree about that: an Ellipse sits on its centre and a
// RegularPolygon is sized by a radius. One top-left box keeps every shape on
// the path images already use.

import Konva from "konva";
import type { ShapeKind } from "@/store/tool.store";
import { SHAPE_STYLE } from "@/constants/canvas.constants";

export interface BoardShapeConfig extends Konva.ShapeConfig {
  shapeKind: ShapeKind;
}

export class BoardShape extends Konva.Shape<BoardShapeConfig> {
  // Konva's Shape draws through this for the scene and, with no hitFunc set,
  // for hit-testing too -- so a click registers exactly where paint does.
  _sceneFunc(ctx: Konva.Context) {
    const w = this.width();
    const h = this.height();
    ctx.beginPath();
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

  shapeKind(): ShapeKind {
    return this.getAttr("shapeKind") as ShapeKind;
  }
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
