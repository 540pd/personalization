import { describe, it, expect } from "vitest";
import Konva from "konva";
import { createSelectionTransformer, minEdgeBoundBox, minResizeEdge } from "../transformer";
import { CORNERS } from "../selectionChrome";
import { createShape } from "../shapes";
import { MIN_NODE_SIZE, SHAPE_MIN_SIZE } from "@/constants/canvas.constants";

const box = (width: number, height: number) => ({ x: 0, y: 0, width, height, rotation: 0 });

describe("minEdgeBoundBox", () => {
  it("refuses a box with a side under the floor, keeping the old one", () => {
    const fn = minEdgeBoundBox(() => 20);
    const old = box(50, 50);
    expect(fn(old, box(19, 50))).toBe(old);
    expect(fn(old, box(50, 19))).toBe(old);
    const next = box(20, 20);
    expect(fn(old, next)).toBe(next);
  });

  // Boxes arrive post-zoom: at 200% a 30px box is 15 canvas units.
  it("measures in canvas units when given the zoom", () => {
    const old = box(100, 100);
    const next = box(30, 30);
    expect(minEdgeBoundBox(() => 20, () => 2)(old, next)).toBe(old);
    expect(minEdgeBoundBox(() => 20, () => 1)(old, next)).toBe(next);
  });

  it("treats a zero zoom as 1 rather than dividing by it", () => {
    const next = box(30, 30);
    expect(minEdgeBoundBox(() => 20, () => 0)(box(100, 100), next)).toBe(next);
  });
});

describe("minResizeEdge", () => {
  it("lets shapes and text go down to the shape floor", () => {
    const shape = createShape("rect", { x: 0, y: 0, width: 50, height: 50 });
    // Konva.Text measures itself on a canvas jsdom does not have; a board
    // text is only ever told apart by its class and name.
    const text = Object.assign(Object.create(Konva.Text.prototype), { hasName: () => true });
    expect(minResizeEdge([shape, text])).toBe(SHAPE_MIN_SIZE);
  });

  it("holds anything else, an image say, to the node floor", () => {
    const shape = createShape("rect", { x: 0, y: 0, width: 50, height: 50 });
    expect(minResizeEdge([shape, new Konva.Rect()])).toBe(MIN_NODE_SIZE);
  });
});

describe("createSelectionTransformer", () => {
  it("has the four corners and no rotate or flip", () => {
    const t = createSelectionTransformer({ minEdge: () => 1 });
    expect(t.enabledAnchors()).toEqual(CORNERS);
    expect(t.rotateEnabled()).toBe(false);
    expect(t.flipEnabled()).toBe(false);
  });

  it("takes overrides on top of the shared look", () => {
    const t = createSelectionTransformer({ minEdge: () => 1, keepRatio: false, ignoreStroke: true });
    expect(t.keepRatio()).toBe(false);
    expect(t.ignoreStroke()).toBe(true);
    expect(t.rotateEnabled()).toBe(false);
  });

  it("floors the resize at minEdge", () => {
    const t = createSelectionTransformer({ minEdge: () => 40 });
    const old = box(100, 100);
    expect(t.boundBoxFunc()!(old, box(39, 100))).toBe(old);
  });
});
