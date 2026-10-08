import Konva from "konva";
import { COLORS, SELECTION } from "@/constants/canvas.constants";

/**
 * Chrome rects -- the hover outline and the multi-selection outlines -- are
 * built and positioned identically. They differ only in name and lifetime,
 * so the shared parts live here rather than being written twice and drifting.
 */
export function createOutlineRect(name: string): Konva.Rect {
  return new Konva.Rect({
    name,
    stroke: COLORS.ink,
    strokeWidth: SELECTION.borderWidth,
    // Constant 1.5px at every zoom: chrome keeps a fixed pixel weight while
    // the content it traces scales.
    strokeScaleEnabled: false,
    listening: false,
    visible: false,
  });
}

/**
 * Lays an outline rect exactly over a shape.
 *
 * Reads the shape's own cornerRadius so a rounded node gets a rounded
 * outline -- an outline that traces a shape should follow its corners, which
 * is the opposite rule from the selection *border*, a bounding box that
 * deliberately stands clear.
 */
export function traceShape(rect: Konva.Rect, shape: Konva.Shape): void {
  rect.position({ x: shape.x(), y: shape.y() });
  rect.size({
    width: shape.width() * shape.scaleX(),
    height: shape.height() * shape.scaleY(),
  });
  rect.cornerRadius((shape.getAttr("cornerRadius") as number) ?? 0);
}
