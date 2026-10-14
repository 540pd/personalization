import { describe, it, expect } from "vitest";
import { COLORS, FRAME_MIN_EDGE } from "@/constants/canvas.constants";
import { boxFromCorners, isDrawable } from "../frame";

describe("boxFromCorners", () => {
  it("builds the box from a normal down-right drag", () => {
    expect(boxFromCorners({ x: 10, y: 20 }, { x: 110, y: 90 }))
      .toEqual({ x: 10, y: 20, width: 100, height: 70 });
  });

  // Dragging up or left is just as natural, and a raw b - a would give a
  // negative size that Konva renders as nothing.
  it("normalises a drag that goes up and to the left", () => {
    expect(boxFromCorners({ x: 110, y: 90 }, { x: 10, y: 20 }))
      .toEqual({ x: 10, y: 20, width: 100, height: 70 });
  });

  it("normalises a drag that goes one way on each axis", () => {
    expect(boxFromCorners({ x: 110, y: 20 }, { x: 10, y: 90 }))
      .toEqual({ x: 10, y: 20, width: 100, height: 70 });
  });

  it("gives a zero box for a click that never moved", () => {
    expect(boxFromCorners({ x: 5, y: 5 }, { x: 5, y: 5 }))
      .toEqual({ x: 5, y: 5, width: 0, height: 0 });
  });
});

describe("isDrawable", () => {
  it("rejects a click, which is a misclick rather than a frame", () => {
    expect(isDrawable(0, 0, 1)).toBe(false);
  });

  it("accepts a drag at exactly the threshold", () => {
    expect(isDrawable(FRAME_MIN_EDGE, FRAME_MIN_EDGE, 1)).toBe(true);
  });

  it("rejects a drag that is long but too thin", () => {
    expect(isDrawable(500, FRAME_MIN_EDGE - 1, 1)).toBe(false);
    expect(isDrawable(FRAME_MIN_EDGE - 1, 500, 1)).toBe(false);
  });

  // The threshold is a SCREEN size. Comparing raw canvas units would make a
  // legitimate small frame impossible to draw zoomed out, and trivial zoomed
  // in -- the same drag would mean different things at different zooms.
  it("measures on screen, so the canvas size needed scales with zoom", () => {
    const half = FRAME_MIN_EDGE / 2;
    expect(isDrawable(half, half, 1)).toBe(false);
    expect(isDrawable(half, half, 2)).toBe(true);

    const double = FRAME_MIN_EDGE * 2;
    expect(isDrawable(double, double, 0.5)).toBe(true);
    expect(isDrawable(FRAME_MIN_EDGE, FRAME_MIN_EDGE, 0.5)).toBe(false);
  });
});

// #115: a Frame is visible without being selected. Asserted as numbers so a
// later "softer" tweak cannot quietly slide back to a border nobody sees.
describe("frame colours", () => {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it("draws a border with at least 3:1 contrast against the board", () => {
    expect(contrast(COLORS.frameStroke, COLORS.paper)).toBeGreaterThanOrEqual(3);
  });

  it("keeps the fill lighter than a Create node's placeholder, so contents read the same", () => {
    expect(luminance(COLORS.frameFill)).toBeGreaterThan(luminance(COLORS.placeholder));
    expect(contrast(COLORS.frameFill, COLORS.paper)).toBeLessThan(1.1);
  });

  it("keeps the border distinct from the selected outline", () => {
    expect(COLORS.frameStroke).not.toBe(COLORS.selected);
  });
});
