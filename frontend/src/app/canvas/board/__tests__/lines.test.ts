import { describe, it, expect, beforeEach } from "vitest";
import Konva from "konva";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { createShape, lineAttrs, lineEnds, snap45, type BoardShape } from "../shapes";
import { drawnLine } from "../shapeDraw";
import { syncNodeGeometry } from "../geometry";
import { updateSelectionChrome } from "../selectionChrome";
import { LINE_DEFAULT_LENGTH, LINE_HIT_SLOP } from "@/constants/canvas.constants";

// A Group stands in for the layer: it is a Konva container with no canvas of
// its own, so none of this needs a Stage (which jsdom cannot provide).
const layer = () => new Konva.Group() as unknown as Konva.Layer;

const line = (a: Konva.Vector2d, b: Konva.Vector2d, kind: "line" | "arrow" = "line") => {
  const n = createShape(kind, { x: 0, y: 0, width: 0, height: 0 });
  n.setAttrs({ ...lineAttrs(a, b), id: "l", name: "selectable" });
  return n;
};

beforeEach(() => useKonvaNodes.setState({ nodes: {} }));

describe("line ends", () => {
  // Every direction has to survive the round trip through a box and two
  // flags, or an arrow drawn up-left would come back pointing down-right.
  it.each([
    [{ x: 10, y: 20 }, { x: 110, y: 70 }],
    [{ x: 110, y: 70 }, { x: 10, y: 20 }],
    [{ x: 110, y: 20 }, { x: 10, y: 70 }],
    [{ x: 10, y: 70 }, { x: 110, y: 20 }],
    [{ x: 10, y: 40 }, { x: 110, y: 40 }],
  ])("keep their direction from %o to %o", (a, b) => {
    expect(lineEnds(line(a, b))).toEqual({ a, b });
  });

  it("sit in a box that frames and occlusion can read", () => {
    const n = line({ x: 110, y: 70 }, { x: 10, y: 20 });
    expect({ x: n.x(), y: n.y(), w: n.width(), h: n.height() }).toEqual({ x: 10, y: 20, w: 100, h: 50 });
  });

  it("are published with the record, for the end handles", () => {
    syncNodeGeometry(line({ x: 0, y: 0 }, { x: 30, y: 40 }, "arrow"));
    expect(useKonvaNodes.getState().nodes.l).toMatchObject({
      shape: "arrow",
      ends: { a: { x: 0, y: 0 }, b: { x: 30, y: 40 } },
    });
  });
});

describe("snap45", () => {
  it("swings to the nearest 45 degrees, keeping the length", () => {
    const p = snap45({ x: 0, y: 0 }, { x: 100, y: 10 });
    expect(p).toEqual({ x: 100.499, y: 0 });
    const d = snap45({ x: 0, y: 0 }, { x: 50, y: 60 });
    expect(Math.abs(d.x - d.y)).toBeLessThan(0.01);
  });
});

describe("drawnLine", () => {
  const start = { x: 100, y: 100 };

  it("runs from the press to the pointer", () => {
    expect(drawnLine(start, { x: 40, y: 160 }, false, 1, true)).toMatchObject({
      x: 40, y: 100, width: 60, height: 60, linePoints: [60, 0, 0, 60],
    });
  });

  it("places a horizontal default-length line on a click", () => {
    expect(drawnLine(start, { x: 101, y: 101 }, false, 1, true)).toMatchObject({
      x: 100, y: 100, width: LINE_DEFAULT_LENGTH, height: 0,
    });
  });

  // Mid-draw the pointer may still be near the press: the preview shows that
  // honestly instead of jumping to the default.
  it("does not substitute the default before the release", () => {
    expect(drawnLine(start, { x: 101, y: 100 }, false, 1, false).width).toBe(1);
  });
});

describe("a line node", () => {
  it("is stroked only, with round ends", () => {
    const n = line({ x: 0, y: 0 }, { x: 10, y: 10 });
    expect(n.fill()).toBeUndefined();
    expect(n.lineCap()).toBe("round");
  });

  // LINE_HIT_SLOP is in screen px, so the hit width in canvas units shrinks
  // as the board zooms in.
  it("is hit-tested LINE_HIT_SLOP screen px either side, at any zoom", () => {
    const g = new Konva.Group({ scaleX: 2, scaleY: 2 });
    const n = line({ x: 0, y: 0 }, { x: 10, y: 10 }) as BoardShape;
    g.add(n);
    expect(n.hitStrokeWidth()).toBe((LINE_HIT_SLOP * 2) / 2);
    g.scale({ x: 0.5, y: 0.5 });
    expect(n.hitStrokeWidth()).toBe((LINE_HIT_SLOP * 2) / 0.5);
  });

  it("leaves a box shape's hit width to Konva", () => {
    expect(createShape("rect", { x: 0, y: 0, width: 5, height: 5 }).hitStrokeWidth()).toBe("auto");
  });

  // Its ends are moved by LineHandles; the transformer's box would only
  // stretch the box the line sits in.
  it("hides the transformer's border and anchors when selected alone", () => {
    const l = layer();
    const tr = new Konva.Transformer();
    const n = line({ x: 0, y: 0 }, { x: 10, y: 10 });
    l.add(n, tr);
    tr.nodes([n]);
    updateSelectionChrome(l, tr);
    expect(tr.borderEnabled()).toBe(false);
    expect(tr.resizeEnabled()).toBe(false);
  });
});
