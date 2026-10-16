// Text placed with the dock's Text tool.
//
// A plain Konva.Text named "selectable", so it is selected, moved, copied,
// deleted, undone and carried by frames along the same paths as images and
// shapes. Konva.Text already sits on its top-left corner, which is what all
// of those paths assume.
//
// Two sizing modes, as in Figma. An auto-width text is exactly as wide as
// its longest line and wraps only where the writer pressed Enter; a
// fixed-width one wraps at its width. The mode is the `autoWidth` attr. The
// width itself is always a real number -- the measured one for auto-width --
// because an undo snapshot can only restore attrs that are present: an
// auto-width text with no width attr would keep whatever width a later
// resize had given it.

import Konva from "konva";
import { TEXT_MIN_WIDTH, TEXT_STYLE } from "@/constants/canvas.constants";

export function isBoardText(n: Konva.Node): n is Konva.Text {
  return n instanceof Konva.Text && n.hasName("selectable");
}

/** What the style bar shows for a text box (#164). */
export interface TextStyle {
  /** A picked colour, or null for the default text colour. */
  color: string | null;
}

export function readTextStyle(n: Konva.Text): TextStyle {
  const fill = n.fill();
  return { color: typeof fill === "string" && fill !== TEXT_STYLE.fill ? fill : null };
}

export function isAutoWidth(n: Konva.Text): boolean {
  return !!n.getAttr("autoWidth");
}

/**
 * Sizes an auto-width text to its longest line.
 *
 * The extra pixel is load-bearing: Konva wraps a line the moment it is wider
 * than the box, and a box exactly as wide as its text can round the other
 * way and wrap the last character.
 */
export function fitAutoWidth(n: Konva.Text): void {
  if (!isAutoWidth(n)) return;
  const widest = n
    .text()
    .split("\n")
    .reduce((w, line) => Math.max(w, n.measureSize(line).width), 0);
  n.width(Math.ceil(widest) + 1 + n.padding() * 2);
}

/**
 * A new, empty text with its top-left at `at`. Fixed-width if `width` is
 * given. In the dock's current colour if one is picked (#159).
 */
export function createText(at: Konva.Vector2d, width?: number, color?: string | null): Konva.Text {
  const n = new Konva.Text({
    ...TEXT_STYLE,
    ...(color ? { fill: color } : {}),
    x: at.x,
    y: at.y,
    text: "",
    wrap: "word",
    autoWidth: width === undefined,
    width: width === undefined ? 1 : Math.max(width, TEXT_MIN_WIDTH),
  });
  fitAutoWidth(n);
  return n;
}

/**
 * Folds a transformer resize into the text's own attrs.
 *
 * A side handle is a wrap width: it changes the width and makes the text
 * fixed-width. A corner handle is a size: it scales the font, and the width
 * with it, keeping proportions. Either way the scale goes back to 1, so a
 * paste or an undo restores exactly the size that was on screen.
 */
export function bakeTextResize(n: Konva.Text, anchor: string | null): void {
  const sx = n.scaleX();
  if (anchor === "middle-left" || anchor === "middle-right") {
    n.setAttrs({
      width: Math.max(TEXT_MIN_WIDTH, n.width() * sx),
      scaleX: 1,
      scaleY: 1,
      autoWidth: false,
    });
    return;
  }
  n.setAttrs({
    fontSize: n.fontSize() * sx,
    width: n.width() * sx,
    scaleX: 1,
    scaleY: 1,
  });
  fitAutoWidth(n);
}
