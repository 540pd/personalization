// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Konva from "konva";
import { useFrames, type FrameRecord } from "@/store/frame.store";
import { canvasHistory } from "@/lib/canvas/history";
import { COLORS } from "@/constants/canvas.constants";
import { createFrameRects, selectFrameRects } from "../frameRects";
import { bindFrames } from "../frameBindings";
import { colorEvent } from "../palette";

// A Group stands in for the layer (no Stage under jsdom); it has no
// batchDraw of its own.
const layer = () => Object.assign(new Konva.Group(), { batchDraw: vi.fn() }) as unknown as Konva.Layer;

const frame = (id: string, over: Partial<FrameRecord> = {}): FrameRecord =>
  ({ id, label: id, canvasX: 0, canvasY: 0, canvasW: 200, canvasH: 100, ...over });

const rects = (l: Konva.Layer) => l.find<Konva.Rect>(".frame");

beforeEach(() => {
  canvasHistory.clear();
  useFrames.setState({ frames: { a: frame("a"), b: frame("b", { canvasX: 300, stroke: "#ff0000" }) }, selectedIds: [] });
});

describe("createFrameRects", () => {
  it("draws one rect per frame, in the frame's outline or the default", () => {
    const l = layer();
    createFrameRects(l).render(useFrames.getState().frames);
    const [a, b] = ["a", "b"].map((id) => l.findOne<Konva.Rect>(`#${id}`)!);
    expect(rects(l)).toHaveLength(2);
    expect(a.stroke()).toBe(COLORS.frameStroke);
    expect(b.stroke()).toBe("#ff0000");
    expect(b.x()).toBe(300);
  });

  it("rebuilds rather than adding to what is there", () => {
    const l = layer();
    const r = createFrameRects(l);
    r.render(useFrames.getState().frames);
    r.render({ a: frame("a", { canvasW: 50 }) });
    expect(rects(l).map((n) => [n.id(), n.width()])).toEqual([["a", 50]]);
  });

  it("a press selects the frame", () => {
    const l = layer();
    createFrameRects(l).render(useFrames.getState().frames);
    const b = l.findOne("#b")!;
    // Konva's own drag start would want a stage; only our handler is under test.
    b.draggable(false);
    b.fire("mousedown");
    expect(useFrames.getState().selectedIds).toEqual(["b"]);
  });

  it("a resize bakes the scale into the size, stores it and is one undo step", () => {
    const l = layer();
    createFrameRects(l).render(useFrames.getState().frames);
    const a = l.findOne<Konva.Rect>("#a")!;
    a.fire("transformstart");
    a.scale({ x: 2, y: 3 });
    a.fire("transformend");
    expect([a.width(), a.height(), a.scaleX()]).toEqual([400, 300, 1]);
    expect(useFrames.getState().frames.a).toMatchObject({ canvasW: 400, canvasH: 300 });
    expect(canvasHistory.size).toBe(1);
  });

  it("frames resized together by one gesture share the one undo step (#128)", () => {
    const l = layer();
    createFrameRects(l).render(useFrames.getState().frames);
    const [a, b] = ["a", "b"].map((id) => l.findOne<Konva.Rect>(`#${id}`)!);
    a.fire("transformstart");
    b.fire("transformstart");
    a.fire("transformend");
    b.fire("transformend");
    expect(canvasHistory.size).toBe(1);
  });
});

describe("selectFrameRects", () => {
  it("attaches the transformer to the selected frames that are drawn", () => {
    const l = layer();
    createFrameRects(l).render(useFrames.getState().frames);
    const transformer = new Konva.Transformer();
    l.add(transformer);
    selectFrameRects(l, transformer, ["b", "gone"]);
    expect(transformer.nodes().map((n) => n.id())).toEqual(["b"]);
  });
});

describe("bindFrames", () => {
  let dispose: () => void;
  beforeEach(() => { dispose = bindFrames(); });
  afterEach(() => dispose());

  it("a swatch pick recolours the selected frames' outlines, as one step (#159)", () => {
    useFrames.setState({ selectedIds: ["a"] });
    colorEvent.emit({ hex: "#00ff00" });
    expect(useFrames.getState().frames.a.stroke).toBe("#00ff00");
    expect(useFrames.getState().frames.b.stroke).toBe("#ff0000");
    expect(canvasHistory.size).toBe(1);
  });

  it("a pick with nothing selected, or no change, is no step", () => {
    colorEvent.emit({ hex: "#00ff00" });
    useFrames.setState({ selectedIds: ["b"] });
    colorEvent.emit({ hex: "#ff0000" });
    expect(canvasHistory.size).toBe(0);
  });

  it("frames join the undo timeline", () => {
    canvasHistory.commit();
    useFrames.getState().upsert(frame("a", { canvasW: 999 }));
    canvasHistory.commit();
    canvasHistory.undo();
    expect(useFrames.getState().frames.a.canvasW).toBe(200);
  });

  it("stops listening once disposed", () => {
    dispose();
    useFrames.setState({ selectedIds: ["a"] });
    colorEvent.emit({ hex: "#00ff00" });
    expect(useFrames.getState().frames.a.stroke).toBeUndefined();
    dispose = () => {};
  });
});
