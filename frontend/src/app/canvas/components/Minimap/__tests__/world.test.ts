import { describe, it, expect } from "vitest";
import type { Bounds } from "@/lib/canvas/bounds";
import { unionBounds, padBounds, viewportBounds, minimapWorld, WORLD_PAD } from "../world";

const b = (x: number, y: number, w: number, h: number): Bounds => ({ x, y, w, h });

// -0 and 0 are different to toEqual but identical everywhere that matters:
// -vp.x / scale yields -0 for an unpanned stage, and SVG renders it as 0.
const norm = (v: Bounds): Bounds => ({ x: v.x + 0, y: v.y + 0, w: v.w + 0, h: v.h + 0 });

/** Is `inner` fully inside `outer`? The property the whole module exists for. */
const encloses = (outer: Bounds, inner: Bounds) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h;

describe("unionBounds", () => {
  it("returns null for nothing", () => {
    expect(unionBounds([])).toBeNull();
  });

  it("returns the box itself for one", () => {
    expect(unionBounds([b(10, 20, 30, 40)])).toEqual(b(10, 20, 30, 40));
  });

  it("spans disjoint boxes", () => {
    expect(unionBounds([b(0, 0, 10, 10), b(90, 40, 10, 10)])).toEqual(b(0, 0, 100, 50));
  });

  it("is unchanged by a box already inside", () => {
    expect(unionBounds([b(0, 0, 100, 100), b(10, 10, 5, 5)])).toEqual(b(0, 0, 100, 100));
  });

  it("handles negative coordinates", () => {
    // The old fixed world was centred on the origin, so this was the case it
    // silently dropped once a node went far enough left or up.
    expect(unionBounds([b(-500, -300, 100, 100), b(0, 0, 10, 10)])).toEqual(
      b(-500, -300, 510, 310)
    );
  });
});

describe("padBounds", () => {
  it("grows every side by a fraction of the larger edge", () => {
    // Larger edge 200 -> pad 20 per side.
    expect(padBounds(b(0, 0, 200, 100), 0.1)).toEqual(b(-20, -20, 240, 140));
  });

  it("pads squarely, so a wide box is not distorted", () => {
    const p = padBounds(b(0, 0, 400, 100), 0.1);
    expect(p.w - 400).toBe(p.h - 100);
  });

  it("is a no-op at zero", () => {
    expect(padBounds(b(1, 2, 3, 4), 0)).toEqual(b(1, 2, 3, 4));
  });
});

describe("viewportBounds", () => {
  it("is the screen box in canvas units at 1:1", () => {
    expect(norm(viewportBounds({ x: 0, y: 0, scale: 1 }, { width: 800, height: 600 }))).toEqual(
      b(0, 0, 800, 600)
    );
  });

  it("grows as you zoom out — more canvas is visible", () => {
    expect(norm(viewportBounds({ x: 0, y: 0, scale: 0.5 }, { width: 800, height: 600 }))).toEqual(
      b(0, 0, 1600, 1200)
    );
  });

  it("tracks the stage offset", () => {
    // Stage pushed right by 200px means the canvas origin is off-screen left.
    expect(viewportBounds({ x: 200, y: 100, scale: 1 }, { width: 800, height: 600 })).toEqual(
      b(-200, -100, 800, 600)
    );
  });

  it("agrees with the stage transform at both corners", () => {
    const vp = { x: 120, y: -40, scale: 2 };
    const v = viewportBounds(vp, { width: 800, height: 600 });
    // canvas -> screen is p * scale + offset; the box must map back to 0..size.
    expect(v.x * vp.scale + vp.x).toBeCloseTo(0, 6);
    expect((v.x + v.w) * vp.scale + vp.x).toBeCloseTo(800, 6);
    expect((v.y + v.h) * vp.scale + vp.y).toBeCloseTo(600, 6);
  });
});

describe("minimapWorld", () => {
  const view = b(0, 0, 800, 600);

  it("always encloses the viewport, so the indicator cannot overflow", () => {
    // The bug this module exists for. Measured against the old fixed world at
    // 200x130: the indicator was 269x131 at 25% zoom and 579x282 at 10%.
    expect(encloses(minimapWorld([], view), view)).toBe(true);
  });

  it("still encloses the viewport when a node is far away", () => {
    const far = b(9000, 7000, 260, 146);
    const world = minimapWorld([far], view);
    expect(encloses(world, view)).toBe(true);
    expect(encloses(world, far)).toBe(true);
  });

  it("encloses a node at negative coordinates", () => {
    const node = b(-4000, -2500, 260, 146);
    expect(encloses(minimapWorld([node], view), node)).toBe(true);
  });

  it("encloses every node, not just the extremes of one axis", () => {
    const nodes = [b(-300, 900, 260, 146), b(1200, -700, 260, 146), b(40, 40, 260, 146)];
    const world = minimapWorld(nodes, view);
    nodes.forEach((n) => expect(encloses(world, n)).toBe(true));
  });

  it("leaves breathing room rather than cropping flush to the content", () => {
    const world = minimapWorld([], view);
    expect(world.x).toBeLessThan(view.x);
    expect(world.w).toBeGreaterThan(view.w);
  });

  it("pads by the documented fraction", () => {
    const world = minimapWorld([], view);
    expect(world.x).toBeCloseTo(-800 * WORLD_PAD, 6);
  });

  it("is driven by content, not a fixed 4000x3000 box", () => {
    // The whole point: a board of two small nodes gets a small world, so they
    // are not rendered as specks in a mostly-empty map.
    const tight = minimapWorld([b(0, 0, 100, 100)], b(0, 0, 200, 200));
    expect(tight.w).toBeLessThan(400);
  });
});
