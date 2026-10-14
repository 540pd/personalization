import { describe, it, expect } from "vitest";
import { FRAME_MIN_EDGE } from "@/constants/canvas.constants";
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
