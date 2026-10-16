import { describe, it, expect } from "vitest";
import { outlineFor } from "../palette";
import { applyColor, applyShapeStyle } from "../recolor";
import { createShape } from "../shapes";
import {
  DEFAULT_STYLE, hasAttrs, lineStyleAttrs, patchStyle, readStyle, styleAttrs, tintFor, type ShapeStyle,
} from "../shapeStyle";
import { SHAPE_STYLE } from "@/constants/canvas.constants";

// Issue #161: a shape's Color, Fill and Stroke.

const box = { x: 0, y: 0, width: 100, height: 60 };
const GREEN = "#45cf6e";
const style = (s: Partial<ShapeStyle>): ShapeStyle => ({ ...DEFAULT_STYLE, ...s });

describe("readStyle", () => {
  it("reads a new shape as the default: no colour, solid fill, solid stroke, width 2", () => {
    expect(readStyle(createShape("rect", box))).toEqual(DEFAULT_STYLE);
    expect(DEFAULT_STYLE).toEqual({ color: null, fill: "solid", stroke: "solid", width: 2 });
  });

  it("reads back what styleAttrs wrote", () => {
    const s = style({ color: GREEN, fill: "pattern", stroke: "dotted", width: 4 });
    const n = createShape("rect", box);
    n.setAttrs(styleAttrs(s));
    expect(readStyle(n)).toEqual(s);
  });
});

describe("styleAttrs", () => {
  it("draws the default exactly as shapes were drawn before the bar", () => {
    expect(styleAttrs(DEFAULT_STYLE)).toMatchObject({
      fill: SHAPE_STYLE.fill, stroke: SHAPE_STYLE.stroke, strokeWidth: 2,
      strokeEnabled: true, dashEnabled: false,
    });
  });

  it("Solid fills with the colour and outlines it a quarter darker", () => {
    expect(styleAttrs(style({ color: GREEN }))).toMatchObject({ fill: GREEN, stroke: outlineFor(GREEN) });
  });

  it("Pattern fills with a pale tint of the colour; the dots are drawn over it", () => {
    expect(styleAttrs(style({ color: GREEN, fill: "pattern" }))).toMatchObject({
      fill: tintFor(GREEN), stroke: outlineFor(GREEN), fillMode: "pattern",
    });
  });

  it("None is transparent, not unset, so the inside is still clickable", () => {
    expect(styleAttrs(style({ color: GREEN, fill: "none" }))).toMatchObject({
      fill: "transparent", stroke: outlineFor(GREEN),
    });
  });

  it("keeps no colour as an empty string, which Konva does not drop", () => {
    expect(styleAttrs(DEFAULT_STYLE).swatch).toBe("");
  });

  it("dashes and dots in proportion to the width", () => {
    expect(styleAttrs(style({ stroke: "dashed", width: 1 }))).toMatchObject({ dash: [4, 3], dashEnabled: true });
    expect(styleAttrs(style({ stroke: "dashed", width: 6 }))).toMatchObject({ dash: [24, 18] });
    expect(styleAttrs(style({ stroke: "dotted", width: 2 }))).toMatchObject({
      dash: [0, 6], dashEnabled: true, lineCap: "round",
    });
  });

  it("Stroke None turns the stroke off", () => {
    expect(styleAttrs(style({ stroke: "none" }))).toMatchObject({ strokeEnabled: false, dashEnabled: false });
  });
});

describe("tintFor", () => {
  it("is close to white, with the colour's hue", () => {
    expect(tintFor(GREEN)).toBe("#e9f9ee");
    expect(tintFor("#ffffff")).toBe("#ffffff");
    expect(tintFor("#000000")).toBe("#e0e0e0");
  });
});

describe("patchStyle: never invisible", () => {
  it("Fill None on a shape with no stroke brings back a solid stroke", () => {
    expect(patchStyle(style({ stroke: "none" }), { fill: "none" })).toMatchObject({ fill: "none", stroke: "solid" });
  });

  it("Stroke None on a shape with no fill keeps a solid stroke", () => {
    expect(patchStyle(style({ fill: "none", stroke: "dashed" }), { stroke: "none" }))
      .toMatchObject({ fill: "none", stroke: "solid" });
  });

  it("allows no stroke on a filled shape", () => {
    expect(patchStyle(style({ fill: "pattern" }), { stroke: "none" })).toMatchObject({ stroke: "none" });
  });

  it("changes only what the patch names", () => {
    const s = style({ color: GREEN, fill: "pattern", stroke: "dotted", width: 6 });
    expect(patchStyle(s, { width: 1 })).toEqual({ ...s, width: 1 });
  });
});

describe("applyShapeStyle", () => {
  it("restyles filled shapes and says so", () => {
    const rect = createShape("rect", box);
    expect(applyShapeStyle([rect], { fill: "none" })).toBe(true);
    expect(readStyle(rect).fill).toBe("none");
  });

  it("reports no change when nothing changes", () => {
    const rect = createShape("rect", box);
    expect(applyShapeStyle([rect], { fill: "solid" })).toBe(false);
  });

  it("restyles a line's stroke and ignores Fill (#162)", () => {
    const line = createShape("line", box);
    expect(applyShapeStyle([line], { fill: "none" })).toBe(false);
    expect(applyShapeStyle([line], { stroke: "dashed", width: 4 })).toBe(true);
    expect(readStyle(line)).toMatchObject({ stroke: "dashed", width: 4 });
    expect(line.fill()).toBeUndefined();
  });

  it("never takes a line's stroke away", () => {
    const arrow = createShape("arrow", box);
    applyShapeStyle([arrow], { stroke: "none" });
    expect(readStyle(arrow).stroke).toBe("solid");
    expect(arrow.strokeEnabled()).toBe(true);
  });
});

describe("lineStyleAttrs (#162)", () => {
  it("draws the default exactly as lines were drawn before the bar", () => {
    const line = createShape("line", box);
    expect(readStyle(line)).toMatchObject({ color: null, stroke: "solid", width: 2 });
    expect(line.stroke()).toBe(SHAPE_STYLE.stroke);
    expect(line.dashEnabled()).toBe(false);
  });

  it("strokes in the swatch itself, not a darker outline, and never fills", () => {
    const attrs = lineStyleAttrs(style({ color: GREEN }));
    expect(attrs).toMatchObject({ stroke: GREEN, swatch: GREEN });
    expect(attrs).not.toHaveProperty("fill");
  });

  it("dashes and dots in proportion to the width", () => {
    expect(lineStyleAttrs(style({ stroke: "dashed", width: 2 }))).toMatchObject({ dash: [6, 8], dashEnabled: true });
    expect(lineStyleAttrs(style({ stroke: "dotted", width: 4 }))).toMatchObject({ dash: [0, 10], dashEnabled: true });
  });

  it("reads None as solid", () => {
    expect(lineStyleAttrs(style({ stroke: "none" }))).toMatchObject({ strokeMode: "solid", dashEnabled: false });
  });
});

describe("Color keeps the fill and stroke", () => {
  it("recolours a dotted line as a dotted line", () => {
    const line = createShape("line", box);
    applyShapeStyle([line], { stroke: "dotted" });
    applyColor([line], GREEN);
    expect(readStyle(line)).toMatchObject({ color: GREEN, stroke: "dotted" });
    expect(line.stroke()).toBe(GREEN);
  });

  it("recolours a Pattern shape as a Pattern shape", () => {
    const rect = createShape("rect", box);
    applyShapeStyle([rect], { fill: "pattern", stroke: "dotted" });
    applyColor([rect], GREEN);
    expect(readStyle(rect)).toEqual(style({ color: GREEN, fill: "pattern", stroke: "dotted" }));
    expect(hasAttrs(rect, { fill: tintFor(GREEN) })).toBe(true);
  });
});
