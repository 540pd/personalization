import { describe, expect, it } from "vitest";
import type { KonvaNodeRecord } from "@/store/konvaNodes.store";
import type { FrameRecord } from "@/store/frame.store";
import { COLORS, SHAPE_STYLE, TEXT_STYLE } from "@/constants/canvas.constants";
import { STROKE_MODES, type ShapeStyle } from "../../../board/shapeStyle";
import type { TextStyle } from "../../../board/text";
import type { ShapeKind } from "@/store/tool.store";
import { barModel, shared, type BarSelection } from "../barModel";

const box = { canvasX: 0, canvasY: 0, canvasW: 100, canvasH: 60 };
const style = (over: Partial<ShapeStyle> = {}): ShapeStyle =>
  ({ color: null, fill: "solid", stroke: "solid", width: 2, ...over });
const shape = (id: string, kind: ShapeKind = "rect", over: Partial<ShapeStyle> = {}): KonvaNodeRecord =>
  ({ id, ...box, shape: kind, style: style(over) });
const text = (id: string, over: Partial<TextStyle> = {}): KonvaNodeRecord => ({
  id, ...box, text: true,
  textStyle: { color: null, size: 24, bold: false, italic: false, align: "left", ...over },
});
const image = (id: string): KonvaNodeRecord => ({ id, ...box, imageUrl: "blob:x" });
const frame = (id: string, over: Partial<FrameRecord> = {}): FrameRecord =>
  ({ id, label: "Frame", ...box, ...over });

const model = (over: Partial<BarSelection>) => {
  const records = over.records ?? [];
  return barModel({ records, selected: records.length, frames: [], panelsSelected: false, ...over });
};

describe("shared", () => {
  it("is the value they all have, or undefined when they differ or there are none", () => {
    expect(shared([{ a: 1 }, { a: 1 }], "a")).toBe(1);
    expect(shared([{ a: 1 }, { a: 2 }], "a")).toBeUndefined();
    expect(shared<{ a: number }, "a">([], "a")).toBeUndefined();
  });
});

describe("barModel", () => {
  it("styles shapes, text and Frames, and nothing else", () => {
    expect(model({ records: [shape("a")] }).styleable).toBe(true);
    expect(model({ records: [text("a")] }).styleable).toBe(true);
    expect(model({ frames: [frame("f")] }).styleable).toBe(true);
    expect(model({ records: [shape("a"), image("b")] }).styleable).toBe(false);
    expect(model({ records: [shape("a")], panelsSelected: true }).styleable).toBe(false);
    expect(model({}).styleable).toBe(false);
  });

  it("is not styleable when a selected node has no record yet", () => {
    expect(model({ records: [shape("a")], selected: 2 }).styleable).toBe(false);
  });

  it("gives shapes Fill and every stroke, with their shared values", () => {
    const m = model({ records: [shape("a", "rect", { fill: "pattern" }), shape("b", "ellipse", { fill: "pattern", width: 4 })] });
    expect(m.colorOnly).toBe(false);
    expect(m.hasFill).toBe(true);
    expect(m.strokeModes).toEqual(STROKE_MODES);
    expect(m.fill).toBe("pattern");
    expect(m.stroke).toBe("solid");
    expect(m.width).toBeUndefined();
  });

  it("drops Fill and No stroke once a line is in the selection (#162)", () => {
    const m = model({ records: [shape("a"), shape("b", "line")] });
    expect(m.hasFill).toBe(false);
    expect(m.strokeModes).not.toContain("none");
  });

  it("gives text alone its text controls", () => {
    const m = model({ records: [text("a", { bold: true, size: 36 }), text("b", { bold: true, size: 36, align: "center" })] });
    expect(m.textOnly).toBe(true);
    expect(m.colorOnly).toBe(true);
    expect(m.size).toBe(36);
    expect(m.bold).toBe(true);
    expect(m.italic).toBe(false);
    expect(m.align).toBeUndefined();
    expect(m.fill).toBeUndefined();
  });

  it("gives text with a shape, or a Frame, Color only", () => {
    const m = model({ records: [text("a"), shape("b")] });
    expect(m.textOnly).toBe(false);
    expect(m.colorOnly).toBe(true);
    expect(m.stroke).toBeUndefined();
    expect(model({ frames: [frame("f")] }).colorOnly).toBe(true);
  });

  describe("the Color dot", () => {
    it("is the shared colour", () => {
      const m = model({ records: [shape("a", "rect", { color: "#3b9ef5" }), text("b", { color: "#3b9ef5" })] });
      expect(m.color).toBe("#3b9ef5");
      expect(m.dotHex).toBe("#3b9ef5");
    });

    it("is the wheel when the colours differ", () => {
      const m = model({ records: [shape("a", "rect", { color: "#3b9ef5" }), shape("b")] });
      expect(m.color).toBeUndefined();
      expect(m.dotHex).toBeUndefined();
    });

    it("is each kind's own default when none is picked", () => {
      expect(model({ records: [shape("a")] }).dotHex).toBe(SHAPE_STYLE.fill);
      expect(model({ records: [shape("a", "arrow")] }).dotHex).toBe(SHAPE_STYLE.stroke);
      expect(model({ records: [text("a")] }).dotHex).toBe(TEXT_STYLE.fill);
      expect(model({ frames: [frame("f")] }).dotHex).toBe(COLORS.frameStroke);
      // A mix of defaults reads as a shape's.
      expect(model({ records: [text("a")], frames: [frame("f")] }).dotHex).toBe(SHAPE_STYLE.fill);
    });

    it("reads a Frame's colour from its outline", () => {
      expect(model({ frames: [frame("f", { stroke: "#f8695f" })] }).dotHex).toBe("#f8695f");
    });
  });

  it("offers Auto layout and Remove frame for one Frame alone", () => {
    const f = frame("f");
    expect(model({ frames: [f] }).layoutFrame).toBe(f);
    expect(model({ frames: [f, frame("g")] }).layoutFrame).toBeNull();
    expect(model({ frames: [f], records: [shape("a")] }).layoutFrame).toBeNull();
  });
});
