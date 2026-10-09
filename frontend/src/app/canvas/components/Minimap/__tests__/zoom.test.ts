import { describe, it, expect } from "vitest";
import type { Bounds } from "@/lib/canvas/bounds";
import { MIN_SCALE, MAX_SCALE } from "@/store/viewport.store";
import { zoomStep, fitTo, clampScale, FIT_PAD, ZOOM_STEP } from "../zoom";

const size = { width: 1000, height: 800 };
const b = (x: number, y: number, w: number, h: number): Bounds => ({ x, y, w, h });

/** Where a canvas point lands on screen under a viewport. */
const toScreen = (p: { x: number; y: number }, vp: { x: number; y: number; scale: number }) => ({
  x: p.x * vp.scale + vp.x,
  y: p.y * vp.scale + vp.y,
});

describe("clampScale", () => {
  it("holds the store's own limits", () => {
    expect(clampScale(99)).toBe(MAX_SCALE);
    expect(clampScale(0.0001)).toBe(MIN_SCALE);
    expect(clampScale(1)).toBe(1);
  });
});

describe("zoomStep", () => {
  const vp = { x: 0, y: 0, scale: 1 };

  it("steps in and out by the documented amount", () => {
    expect(zoomStep(vp, 1, size).scale).toBeCloseTo(1 + ZOOM_STEP, 6);
    expect(zoomStep(vp, -1, size).scale).toBeCloseTo(1 - ZOOM_STEP, 6);
  });

  it("keeps the viewport centre fixed", () => {
    // The anchor: whatever is in the middle of the screen stays there.
    const centreCanvas = { x: 123, y: -45 };
    const before = toScreen(centreCanvas, { x: 100, y: 50, scale: 1 });
    const after = toScreen(centreCanvas, zoomStep({ x: 100, y: 50, scale: 1 }, 1, size));
    // Only true for the point actually at the centre; pick that one.
    const atCentre = { x: (size.width / 2 - 100) / 1, y: (size.height / 2 - 50) / 1 };
    const a = toScreen(atCentre, { x: 100, y: 50, scale: 1 });
    const c = toScreen(atCentre, zoomStep({ x: 100, y: 50, scale: 1 }, 1, size));
    expect(c.x).toBeCloseTo(a.x, 6);
    expect(c.y).toBeCloseTo(a.y, 6);
    // And a non-centre point does move, or nothing zoomed.
    expect(after.x).not.toBeCloseTo(before.x, 6);
  });

  it("rounds to a readable percentage", () => {
    // Repeated steps otherwise drift to 70.00000000000001%.
    let vp2 = { x: 0, y: 0, scale: 1 };
    for (let i = 0; i < 3; i++) vp2 = zoomStep(vp2, -1, size);
    expect(vp2.scale).toBe(0.7);
  });

  it("will not step past the store's limits", () => {
    expect(zoomStep({ x: 0, y: 0, scale: MAX_SCALE }, 1, size).scale).toBe(MAX_SCALE);
    expect(zoomStep({ x: 0, y: 0, scale: MIN_SCALE }, -1, size).scale).toBe(MIN_SCALE);
  });
});

describe("fitTo", () => {
  it("centres the box in the viewport", () => {
    const box = b(500, 400, 200, 100);
    const vp = fitTo(box, size);
    const centre = toScreen({ x: 600, y: 450 }, vp);
    expect(centre.x).toBeCloseTo(size.width / 2, 6);
    expect(centre.y).toBeCloseTo(size.height / 2, 6);
  });

  it("fits on the tighter axis so the box never overflows", () => {
    // A wide box in a less-wide viewport must fit on width, not height.
    const box = b(0, 0, 4000, 100);
    const vp = fitTo(box, size);
    const right = toScreen({ x: 4000, y: 0 }, vp).x;
    const left = toScreen({ x: 0, y: 0 }, vp).x;
    expect(right - left).toBeLessThanOrEqual(size.width);
  });

  it("fits a tall box on height", () => {
    const box = b(0, 0, 100, 4000);
    const vp = fitTo(box, size);
    const h = toScreen({ x: 0, y: 4000 }, vp).y - toScreen({ x: 0, y: 0 }, vp).y;
    expect(h).toBeLessThanOrEqual(size.height);
  });

  it("leaves a margin rather than cropping flush to the edges", () => {
    const box = b(0, 0, 1000, 800);
    const vp = fitTo(box, size);
    expect(vp.scale).toBeCloseTo(1 / (1 + FIT_PAD), 6);
  });

  it("does not blow up on a zero-area box", () => {
    // A degenerate node would otherwise divide by zero and send scale to
    // Infinity, which strands the viewport somewhere unrecoverable.
    const vp = fitTo(b(10, 10, 0, 0), size);
    expect(Number.isFinite(vp.scale)).toBe(true);
    expect(Number.isFinite(vp.x)).toBe(true);
    expect(vp.scale).toBeLessThanOrEqual(MAX_SCALE);
  });

  it("will not zoom past the maximum for a tiny box", () => {
    expect(fitTo(b(0, 0, 2, 2), size).scale).toBe(MAX_SCALE);
  });

  it("will not zoom past the minimum for a huge one", () => {
    expect(fitTo(b(0, 0, 500000, 500000), size).scale).toBe(MIN_SCALE);
  });

  it("differs from a reset, which is what the menu got wrong", () => {
    // "Zoom to fit" and "Zoom to 100%" both called reset(), so two menu
    // entries did the same thing and neither fitted anything.
    const vp = fitTo(b(2000, 2000, 1500, 1200), size);
    expect(vp).not.toEqual({ x: 0, y: 0, scale: 1 });
  });
});
