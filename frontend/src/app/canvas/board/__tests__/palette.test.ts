import { describe, it, expect, vi } from "vitest";
import Konva from "konva";
import { PALETTE, colorEvent, outlineFor, pickColor } from "../palette";
import { useToolStore } from "@/store/tool.store";
import { applyColor, colorAttrs } from "../recolor";
import { createShape } from "../shapes";
import { hasAttrs } from "../shapeStyle";
import { SHAPE_STYLE } from "@/constants/canvas.constants";

// Text is covered in e2e/color.spec.ts: a Konva.Text measures itself on a
// canvas, which this environment does not have.

const box = { x: 0, y: 0, width: 100, height: 60 };

describe("PALETTE", () => {
  it("has the reference's twelve swatches, all distinct", () => {
    expect(PALETTE).toHaveLength(12);
    expect(new Set(PALETTE.map((s) => s.hex)).size).toBe(12);
  });
});

describe("outlineFor", () => {
  it("is a quarter darker than the fill", () => {
    expect(outlineFor("#ffffff")).toBe("#bfbfbf");
    expect(outlineFor("#f8695f")).toBe("#ba4f47");
  });

  it("leaves black black", () => {
    expect(outlineFor("#000000")).toBe("#000000");
  });
});

describe("colorAttrs", () => {
  it("fills a box shape and outlines it darker", () => {
    expect(colorAttrs(createShape("rect", box), "#3b9ef5")).toMatchObject({
      fill: "#3b9ef5",
      stroke: outlineFor("#3b9ef5"),
    });
  });

  it("strokes a line, and never fills it", () => {
    for (const kind of ["line", "arrow"] as const) {
      const attrs = colorAttrs(createShape(kind, box), "#3b9ef5");
      expect(attrs).toMatchObject({ stroke: "#3b9ef5" });
      expect(attrs).not.toHaveProperty("fill");
    }
  });

  it("leaves an image alone", () => {
    expect(colorAttrs(new Konva.Image({ image: undefined }), "#3b9ef5")).toBeNull();
  });
});

describe("applyColor", () => {
  it("says whether anything changed", () => {
    const rect = createShape("rect", box);
    expect(applyColor([rect], "#45cf6e")).toBe(true);
    expect(applyColor([rect], "#45cf6e")).toBe(false);
    expect(applyColor([new Konva.Image({ image: undefined })], "#45cf6e")).toBe(false);
  });
});

describe("creating in the current colour", () => {
  it("keeps the default style when no colour is picked", () => {
    const rect = createShape("rect", box, null);
    expect(rect.fill()).toBe(SHAPE_STYLE.fill);
    expect(rect.stroke()).toBe(SHAPE_STYLE.stroke);
  });

  it("uses the picked colour by the same rules as a recolour", () => {
    const rect = createShape("rect", box, "#c08cf5");
    expect(hasAttrs(rect, colorAttrs(rect, "#c08cf5")!)).toBe(true);
    const line = createShape("line", box, "#c08cf5");
    expect(line.stroke()).toBe("#c08cf5");
    expect(line.fill()).toBeUndefined();
  });
});

describe("pickColor", () => {
  it("sets the drawing colour and announces the pick", () => {
    const emit = vi.spyOn(colorEvent, "emit").mockImplementation(() => {});
    pickColor("#3b9ef5");
    expect(useToolStore.getState().color).toBe("#3b9ef5");
    expect(emit).toHaveBeenCalledWith({ hex: "#3b9ef5" });
    emit.mockRestore();
  });
});
