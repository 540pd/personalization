import { describe, it, expect } from "vitest";
import {
  arrangeFor, childrenOf, layoutColumns, near, orderChildren, packColumns, packToShape, planReflow,
  readingOrder, withoutIds, type ChildBox,
} from "../autoLayout/arrange";

const box = (id: string, x: number, y: number, w: number, h: number): ChildBox => ({ id, x, y, w, h });

describe("orderChildren", () => {
  it("goes left to right, ties by top edge", () => {
    const order = orderChildren([box("c", 300, 0, 10, 10), box("a", 10, 50, 10, 10), box("b", 10, 5, 10, 10)]);
    expect(order.map((b) => b.id)).toEqual(["b", "a", "c"]);
  });
});

describe("layoutColumns", () => {
  it("one item per column is a row: pads 16, gaps 16, aligns tops, hugs", () => {
    const g = layoutColumns({ x: 100, y: 200 }, [[box("a", 0, 0, 90, 60)], [box("b", 0, 0, 90, 80)]]);
    expect(g.positions).toEqual({ a: { x: 116, y: 216 }, b: { x: 222, y: 216 } });
    expect(g.w).toBe(16 + 90 + 16 + 90 + 16);
    expect(g.h).toBe(16 + 80 + 16);
  });

  it("stacks a column top to bottom, aligned left, as wide as its widest", () => {
    const g = layoutColumns({ x: 0, y: 0 }, [
      [box("a", 0, 0, 90, 60)],
      [box("b", 0, 0, 120, 60), box("c", 0, 0, 70, 50)],
      [box("d", 0, 0, 90, 80)],
    ]);
    expect(g.positions).toEqual({
      a: { x: 16, y: 16 },
      b: { x: 122, y: 16 }, c: { x: 122, y: 16 + 60 + 16 },
      d: { x: 122 + 120 + 16, y: 16 },
    });
    expect(g.w).toBe(16 + 90 + 16 + 120 + 16 + 90 + 16);
    expect(g.h).toBe(16 + 60 + 16 + 50 + 16);
  });

  it("an empty column takes no space", () => {
    const g = layoutColumns({ x: 0, y: 0 }, [[box("a", 0, 0, 90, 60)], [], [box("b", 0, 0, 90, 60)]]);
    expect(g.positions.b).toEqual({ x: 16 + 90 + 16, y: 16 });
  });
});

describe("packToShape (#232)", () => {
  const same = (n: number, w = 180, h = 120) => Array.from({ length: n }, (_, i) => box(`i${i + 1}`, 0, 0, w, h));
  const counts = (cols: string[][]) => cols.map((c) => c.length);

  it("a short, wide shape gives a row; a tall, narrow one a column", () => {
    expect(counts(packToShape(same(6), { w: 2000, h: 160 }))).toEqual([1, 1, 1, 1, 1, 1]);
    expect(counts(packToShape(same(6), { w: 220, h: 1200 }))).toEqual([6]);
  });

  it("one in between gives the compact rectangle nearest its shape, in reading order", () => {
    // Three columns of 180 and two rows of 120: 604 × 288.
    expect(packToShape(same(6), { w: 600, h: 290 })).toEqual([["i1", "i4"], ["i2", "i5"], ["i3", "i6"]]);
    expect(counts(packToShape(same(6), { w: 400, h: 430 }))).toEqual([3, 3]);
  });

  it("each item goes into the shortest column so far", () => {
    const boxes = [box("tall", 0, 0, 180, 260), box("a", 0, 0, 180, 120), box("b", 0, 0, 180, 120), box("t", 0, 0, 180, 80)];
    expect(packColumns(boxes, 2).columns).toEqual([["tall"], ["a", "b", "t"]]);
  });

  it("no boxes, no columns", () => {
    expect(packToShape([], { w: 100, h: 100 })).toEqual([]);
  });
});

describe("readingOrder", () => {
  it("top to bottom, then left to right along a row", () => {
    const order = readingOrder([box("c", 0, 100, 10, 10), box("b", 50, 0, 10, 10), box("a", 0, 0, 10, 10)]);
    expect(order.map((b) => b.id)).toEqual(["a", "b", "c"]);
  });
});

describe("room for names (#235)", () => {
  const named = (id: string, w = 90, h = 60): ChildBox => ({ id, x: 0, y: 0, w, h, named: true });
  const plain = (id: string, w = 90, h = 30): ChildBox => ({ id, x: 0, y: 0, w, h });

  it("a row of named items starts below a 24 band, 8 below the Frame's edge", () => {
    const g = layoutColumns({ x: 0, y: 0 }, [[named("a")], [named("b")]]);
    expect(g.positions).toEqual({ a: { x: 16, y: 32 }, b: { x: 122, y: 32 } });
    expect(g.h).toBe(8 + 24 + 60 + 16);
  });

  it("a row mixing named and plain items keeps their tops in line", () => {
    const g = layoutColumns({ x: 0, y: 0 }, [[plain("s")], [named("a")]]);
    expect(g.positions.s.y).toBe(32);
    expect(g.positions.a.y).toBe(32);
  });

  it("in a column, only a named item gets a band above it", () => {
    const g = layoutColumns({ x: 0, y: 0 }, [[named("a"), plain("s"), named("b")]]);
    expect(g.positions).toEqual({
      a: { x: 16, y: 32 },
      s: { x: 16, y: 32 + 60 + 16 },
      b: { x: 16, y: 32 + 60 + 16 + 30 + 16 + 24 },
    });
    expect(g.h).toBe(32 + 60 + 16 + 30 + 16 + 24 + 60 + 16);
  });

  it("no names, no band: as before", () => {
    expect(layoutColumns({ x: 0, y: 0 }, [[plain("s")]]).positions.s.y).toBe(16);
  });

  it("packing counts the bands, so its size is what's drawn", () => {
    const boxes = [named("a"), plain("s"), named("b")];
    const p = packColumns(boxes, 1);
    const g = layoutColumns({ x: 0, y: 0 }, [boxes]);
    expect(p.h).toBe(g.h);
    expect(p.w).toBe(g.w);
  });
});

describe("withoutIds", () => {
  it("takes the ids out, and the columns they empty", () => {
    expect(withoutIds([["a"], ["b", "c"], ["d"]], new Set(["a", "c"]))).toEqual([["b"], ["d"]]);
  });
});

describe("childrenOf", () => {
  it("every id, column by column", () => {
    expect(childrenOf({ columns: [["a"], ["b", "c"]] })).toEqual(["a", "b", "c"]);
  });
});

describe("near", () => {
  it("within half a unit, either way", () => {
    expect(near(10, 10.4)).toBe(true);
    expect(near(10.4, 10)).toBe(true);
    expect(near(10, 10.5)).toBe(false);
  });
});

describe("arrangeFor (#232)", () => {
  const same = (n: number) => Array.from({ length: n }, (_, i) => box(`i${i + 1}`, 0, 0, 180, 120));

  it("packs to the box's shape and lays out from its top-left", () => {
    const { columns, grid } = arrangeFor(same(4), { x: 100, y: 50, w: 400, h: 300 });
    expect(columns).toEqual([["i1", "i3"], ["i2", "i4"]]);
    expect(grid.positions.i1).toEqual({ x: 116, y: 66 });
    expect(grid.positions.i4).toEqual({ x: 100 + 16 + 180 + 16, y: 50 + 16 + 120 + 16 });
    expect(grid.w).toBe(16 + 180 + 16 + 180 + 16);
  });

  it("nothing to arrange, nothing laid out", () => {
    const { columns, grid } = arrangeFor([], { x: 0, y: 0, w: 100, h: 100 });
    expect(columns).toEqual([]);
    expect(grid.positions).toEqual({});
  });
});

describe("planReflow", () => {
  const area = { x: 0, y: 0, w: 16 + 90 + 16 + 90 + 16, h: 16 + 60 + 16 };
  const settled = [[box("a", 16, 16, 90, 60)], [box("b", 122, 16, 90, 60)]];

  it("a layout already in place moves nothing and keeps its size", () => {
    const plan = planReflow(area, [["a"], ["b"]], settled);
    expect(plan).toMatchObject({ empty: false, left: false, moves: false, resized: false, columns: [["a"], ["b"]] });
  });

  it("a child that grew moves the next along and resizes the Frame", () => {
    const plan = planReflow(area, [["a"], ["b"]], [[box("a", 16, 16, 140, 60)], [box("b", 122, 16, 90, 60)]]);
    if (plan.empty) throw new Error("not empty");
    expect(plan.moves).toBe(true);
    expect(plan.resized).toBe(true);
    expect(plan.grid.positions.b).toEqual({ x: 16 + 140 + 16, y: 16 });
    expect(plan.left).toBe(false);
  });

  it("a child dropped clear of the Frame leaves, and its column with it", () => {
    const plan = planReflow(area, [["a"], ["b"]], [[box("a", 16, 16, 90, 60)], [box("b", 900, 900, 90, 60)]]);
    if (plan.empty) throw new Error("not empty");
    expect(plan.left).toBe(true);
    expect(plan.columns).toEqual([["a"]]);
    expect(plan.boxes).toEqual([[box("a", 16, 16, 90, 60)], []]);
    expect(plan.grid.w).toBe(16 + 90 + 16);
    expect(plan.resized).toBe(true);
  });

  it("an id no longer on the board stays in the columns, but takes no room", () => {
    const plan = planReflow(area, [["a"], ["gone"], ["b"]], [[settled[0][0]], [], [settled[1][0]]]);
    if (plan.empty) throw new Error("not empty");
    expect(plan.columns).toEqual([["a"], ["gone"], ["b"]]);
    expect(plan.moves).toBe(false);
    expect(plan.left).toBe(false);
  });

  it("with every child gone or out, it is empty", () => {
    expect(planReflow(area, [["a"]], [[]])).toEqual({ empty: true });
    expect(planReflow(area, [["a"]], [[box("a", 900, 0, 10, 10)]])).toEqual({ empty: true });
  });
});
