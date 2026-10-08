import { describe, it, expect } from "vitest";
import { PORT_FRACTION } from "@/constants/canvas.constants";
import { toScreen, toCanvas, viewportCentre, stagePositionFor } from "../coords";
import { boundsOf, contains, overlaps } from "../bounds";
import { outputPoint, inputPoint } from "../ports";

const vp = (x: number, y: number, scale: number) => ({ x, y, scale });

describe("coords", () => {
  it.each([0.5, 1, 1.5])("round-trips canvas -> screen -> canvas at %s zoom", (scale) => {
    const v = vp(-420, 137, scale);
    const pt = { x: 318.5, y: -92.25 };
    const back = toCanvas(toScreen(pt, v), v);
    expect(back.x).toBeCloseTo(pt.x, 9);
    expect(back.y).toBeCloseTo(pt.y, 9);
  });

  it("reproduces both spellings of the viewport centre that were in the codebase", () => {
    const sx = -420, sy = -80, s = 1.25;
    const size = { width: 1500, height: 840 };
    const centre = viewportCentre(vp(sx, sy, s), size);

    // Board.tsx:538
    expect(centre.x).toBeCloseTo(-sx / s + size.width / (2 * s), 9);
    // FloatingDock.tsx:475 — algebraically identical, written differently
    expect(centre.x).toBeCloseTo((-sx + size.width / 2) / s, 9);
  });

  it("stagePositionFor is the inverse of viewportCentre", () => {
    const size = { width: 1500, height: 840 };
    const scale = 0.75;
    const target = { x: 220, y: -310 };
    const pos = stagePositionFor(target, scale, size);
    const centre = viewportCentre({ ...pos, scale }, size);
    expect(centre.x).toBeCloseTo(target.x, 9);
    expect(centre.y).toBeCloseTo(target.y, 9);
  });
});

describe("boundsOf", () => {
  // The whole point: two record shapes, one box.
  it("normalises a top-anchored node and a centre-anchored node to the same box", () => {
    const konva = { canvasX: 40, canvasY: 100, canvasW: 320, canvasH: 180 };
    const panel = { canvasX: 40, canvasY: 190, w: 320, h: 180 };
    expect(boundsOf(konva)).toEqual({ x: 40, y: 100, w: 320, h: 180 });
    expect(boundsOf(panel)).toEqual(boundsOf(konva));
  });

  it("keeps a panel's centre where it was, not its top", () => {
    // A panel at canvasY 0 straddles the origin.
    expect(boundsOf({ canvasX: 0, canvasY: 0, w: 100, h: 60 }).y).toBe(-30);
  });
});

describe("contains", () => {
  const b = { x: 0, y: 0, w: 100, h: 50 };

  it("is inclusive on every edge, matching the tests it replaces", () => {
    expect(contains(b, { x: 0, y: 0 })).toBe(true);
    expect(contains(b, { x: 100, y: 50 })).toBe(true);
  });

  it("rejects points outside", () => {
    expect(contains(b, { x: -0.1, y: 25 })).toBe(false);
    expect(contains(b, { x: 50, y: 50.1 })).toBe(false);
  });
});

describe("overlaps", () => {
  it("is false for boxes that merely touch", () => {
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
  });

  it("is true for a real intersection, in either argument order", () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    const c = { x: 5, y: 5, w: 10, h: 10 };
    expect(overlaps(a, c)).toBe(true);
    expect(overlaps(c, a)).toBe(true);
  });
});

describe("ports", () => {
  it("puts a Konva node's output on its right edge, PORT_FRACTION down", () => {
    const n = { canvasX: 40, canvasY: 100, canvasW: 320, canvasH: 180 };
    expect(outputPoint(n)).toEqual({ x: 360, y: 100 + 180 * PORT_FRACTION });
  });

  it("accounts for a panel's canvasY being its centre", () => {
    // Same box as the Konva node above, expressed centre-anchored.
    const p = { canvasX: 40, canvasY: 190, w: 320, h: 180 };
    expect(outputPoint(p)).toEqual({ x: 360, y: 100 + 180 * PORT_FRACTION });
    expect(inputPoint(p)).toEqual({ x: 40, y: 100 + 180 * PORT_FRACTION });
  });

  it("agrees with ConnectionOverlay's original screen-space maths", () => {
    // The functions this replaces returned screen px directly. Composing
    // toScreen with the canvas-unit point must land in the same place.
    const sx = -120, sy = 65, sc = 1.25;
    const p = { canvasX: 40, canvasY: 190, w: 320, h: 180 };

    const left = sx + p.canvasX * sc;
    const top = sy + p.canvasY * sc - (p.h * sc) / 2;
    const originalOut = { x: left + p.w * sc, y: top + p.h * sc * PORT_FRACTION };
    const originalIn = { x: left, y: top + p.h * sc * PORT_FRACTION };

    const v = vp(sx, sy, sc);
    expect(toScreen(outputPoint(p), v).x).toBeCloseTo(originalOut.x, 9);
    expect(toScreen(outputPoint(p), v).y).toBeCloseTo(originalOut.y, 9);
    expect(toScreen(inputPoint(p), v).x).toBeCloseTo(originalIn.x, 9);
    expect(toScreen(inputPoint(p), v).y).toBeCloseTo(originalIn.y, 9);
  });

  it("agrees with ConnectionOverlay's original maths for a Konva node too", () => {
    const sx = -120, sy = 65, sc = 1.25;
    const n = { canvasX: 40, canvasY: 100, canvasW: 320, canvasH: 180 };
    const original = {
      x: sx + n.canvasX * sc + n.canvasW * sc,
      y: sy + n.canvasY * sc + n.canvasH * sc * PORT_FRACTION,
    };
    const got = toScreen(outputPoint(n), vp(sx, sy, sc));
    expect(got.x).toBeCloseTo(original.x, 9);
    expect(got.y).toBeCloseTo(original.y, 9);
  });
});
