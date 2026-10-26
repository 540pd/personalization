import { describe, it, expect } from "vitest";
import type Konva from "konva";
import { BOX_OUTLINES, type BoxKind, type Pointing } from "../shapes/box";

/** A context that records the points an outline visits. */
function trace(kind: BoxKind, w: number, h: number, pointing?: Pointing) {
  const calls: { op: string; args: number[] }[] = [];
  const ctx = new Proxy({}, {
    get: (_, op: string) => (...args: number[]) => { calls.push({ op, args }); },
  }) as unknown as Konva.Context;
  const node = { getAttr: (k: string) => (k === "pointing" ? pointing : undefined) } as Konva.Shape;
  BOX_OUTLINES[kind](ctx, w, h, node);
  return calls;
}

const points = (calls: ReturnType<typeof trace>) =>
  calls.filter((c) => c.op === "moveTo" || c.op === "lineTo").map((c) => c.args as [number, number]);

describe("box outlines", () => {
  it("a rect and an ellipse fill their box", () => {
    expect(trace("rect", 100, 50)).toEqual([{ op: "rect", args: [0, 0, 100, 50] }]);
    expect(trace("ellipse", 100, 50)).toEqual([{ op: "ellipse", args: [50, 25, 50, 25, 0, 0, Math.PI * 2] }]);
  });

  it("a triangle and a diamond touch the box's edges, not a square inside it", () => {
    expect(points(trace("triangle", 100, 50))).toEqual([[50, 0], [100, 50], [0, 50]]);
    expect(points(trace("diamond", 100, 50))).toEqual([[50, 0], [100, 25], [50, 50], [0, 25]]);
  });

  it("every outline stays inside its box", () => {
    for (const kind of Object.keys(BOX_OUTLINES) as BoxKind[]) {
      for (const [x, y] of points(trace(kind, 120, 40))) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(120);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(40);
      }
    }
  });

  describe("block arrow", () => {
    const tip = (w: number, h: number, pointing?: Pointing) => points(trace("blockArrow", w, h, pointing))[3];

    it("points right by default, its tip mid-height on the right edge", () => {
      expect(tip(120, 40)).toEqual([120, 20]);
    });

    it("points whichever way it was drawn", () => {
      expect(tip(120, 40, "left")).toEqual([0, 20]);
      expect(tip(40, 120, "down")).toEqual([20, 120]);
      expect(tip(40, 120, "up")).toEqual([20, 0]);
    });

    it("a long thin arrow's head is no longer than it is thick", () => {
      const [neckX] = points(trace("blockArrow", 400, 40))[1];
      expect(400 - neckX).toBe(40);
    });

    it("a short fat arrow's head is half its length", () => {
      const [neckX] = points(trace("blockArrow", 60, 100))[1];
      expect(neckX).toBe(30);
    });
  });
});
