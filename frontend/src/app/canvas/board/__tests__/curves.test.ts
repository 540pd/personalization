import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Konva from "konva";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import {
  bendToward,
  controlPoint,
  createShape,
  curveMid,
  lineAttrs,
  lineEnds,
} from "../shapes";
import { syncNodeGeometry } from "../geometry";
import { moveMembers } from "../frameMembers";
import { boardStage } from "@/lib/canvas/boardStage";

const a = { x: 0, y: 0 };
const b = { x: 100, y: 0 };

beforeEach(() => useKonvaNodes.setState({ nodes: {} }));

describe("bend geometry", () => {
  // Left of a->b in screen coordinates (y down) is up.
  it("puts a positive bend's midpoint on the left of the line", () => {
    expect(curveMid(a, b, 30)).toEqual({ x: 50, y: -30 });
    expect(curveMid(a, b, -30)).toEqual({ x: 50, y: 30 });
  });

  // A quadratic's midpoint is (a + 2c + b) / 4, so for the curve to pass
  // through the handle the control point sits twice as far out.
  it("puts the control point twice as far out as the midpoint", () => {
    expect(controlPoint(a, b, 30)).toEqual({ x: 50, y: -60 });
  });

  it("reads back the bend from a handle position", () => {
    expect(bendToward(a, b, { x: 50, y: -30 })).toBeCloseTo(30);
  });

  // Symmetric only: sliding the handle along the line changes nothing.
  it("ignores the part of the handle's position that runs along the line", () => {
    expect(bendToward(a, b, { x: 90, y: -30 })).toBeCloseTo(30);
    expect(bendToward(a, b, { x: 10, y: 0 })).toBeCloseTo(0);
  });
});

describe("a curved line's box", () => {
  it("contains the bulge, not just the chord", () => {
    const attrs = lineAttrs(a, b, 30);
    expect(attrs.y).toBeCloseTo(-30);
    expect(attrs.height).toBeCloseTo(30);
    expect(attrs.width).toBeCloseTo(100);
  });

  it("keeps the ends where they were put", () => {
    const n = createShape("line", { x: 0, y: 0, width: 0, height: 0 });
    n.setAttrs(lineAttrs({ x: 10, y: 20 }, { x: 110, y: 70 }, -25));
    const ends = lineEnds(n);
    expect(ends.a.x).toBeCloseTo(10);
    expect(ends.a.y).toBeCloseTo(20);
    expect(ends.b.x).toBeCloseTo(110);
    expect(ends.b.y).toBeCloseTo(70);
  });

  it("is straight by default", () => {
    expect(lineAttrs(a, b).bend).toBe(0);
  });

  it("publishes the bend with the ends, for the handles", () => {
    const n = createShape("arrow", { x: 0, y: 0, width: 0, height: 0 });
    n.setAttrs({ ...lineAttrs(a, b, 30), id: "l" });
    syncNodeGeometry(n);
    expect(useKonvaNodes.getState().nodes.l.ends?.bend).toBe(30);
  });
});

describe("a curved line inside a moving Frame", () => {
  afterEach(() => { boardStage.current = null; });

  // #157. Read straight off the store, not through a click: selecting a line
  // republishes every node, which would hide a move that left `ends` stale.
  it.each(["line", "arrow"] as const)("republishes the ends and bend of a moved %s", (kind) => {
    const group = new Konva.Group();
    const n = createShape(kind, { x: 0, y: 0, width: 0, height: 0 });
    n.setAttrs({ ...lineAttrs({ x: 10, y: 20 }, { x: 110, y: 20 }, 30), id: "l", name: "selectable" });
    group.add(n);
    syncNodeGeometry(n);
    // A Group stands in for the stage, which jsdom cannot construct.
    boardStage.current = Object.assign(group, { batchDraw: () => {} }) as unknown as Konva.Stage;

    const { canvasX, canvasY } = useKonvaNodes.getState().nodes.l;
    const members = { images: [{ id: "l", startX: canvasX, startY: canvasY }], panels: [] };
    moveMembers(members, 100, 60);
    moveMembers(members, 150, 40);  // absolute from the start, not cumulative

    const ends = useKonvaNodes.getState().nodes.l.ends!;
    expect(ends.a.x).toBeCloseTo(160);
    expect(ends.a.y).toBeCloseTo(60);
    expect(ends.b.x).toBeCloseTo(260);
    expect(ends.b.y).toBeCloseTo(60);
    expect(ends.bend).toBe(30);
  });
});
