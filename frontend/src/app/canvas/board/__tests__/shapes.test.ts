import { describe, it, expect, beforeEach } from "vitest";
import Konva from "konva";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useToolStore } from "@/store/tool.store";
import { BoardShape, bakeScale, createShape, drawnBox, isBoardShape, pointingOf } from "../shapes";
import { finalBox } from "../shapeDraw";
import { copyNodes, pasteNodes } from "../clipboard";
import { syncNodeGeometry } from "../geometry";
import { updateSelectionChrome } from "../selectionChrome";
import {
  SHAPE_DEFAULT_SIZE,
  SHAPE_MIN_SIZE,
  SHAPE_STYLE,
} from "@/constants/canvas.constants";

// A Group stands in for the layer: it is a Konva container with no canvas of
// its own, so none of this needs a Stage (which jsdom cannot provide).
const layer = () => new Konva.Group() as unknown as Konva.Layer;

const rect = (over: Partial<Konva.ShapeConfig> = {}) =>
  new BoardShape({
    shapeKind: "rect", id: "s", name: "selectable",
    x: 10, y: 20, width: 30, height: 40, ...over,
  });

beforeEach(() => {
  useKonvaNodes.setState({ nodes: {} });
  useToolStore.setState({ activeTool: "pointer", lastShape: "rect" });
});

describe("BoardShape", () => {
  it("reports its own class name, which is what a paste rebuilds from", () => {
    expect(rect().getClassName()).toBe("BoardShape");
  });

  it("is told apart from other nodes", () => {
    expect(isBoardShape(rect())).toBe(true);
    expect(isBoardShape(new Konva.Rect())).toBe(false);
  });

  it("is created in the neutral default style", () => {
    const s = createShape("rect", { x: 0, y: 0, width: 5, height: 5 });
    expect(s.fill()).toBe(SHAPE_STYLE.fill);
    expect(s.stroke()).toBe(SHAPE_STYLE.stroke);
    expect(s.strokeWidth()).toBe(SHAPE_STYLE.strokeWidth);
    expect(s.shapeKind()).toBe("rect");
  });
});

describe("bakeScale", () => {
  // The transformer resizes by scale. Left there, the stroke would scale too.
  it("moves a resize from scale into width and height", () => {
    const s = rect({ scaleX: 2, scaleY: 0.5 });
    bakeScale(s);
    expect(s.width()).toBe(60);
    expect(s.height()).toBe(20);
    expect(s.scaleX()).toBe(1);
    expect(s.scaleY()).toBe(1);
  });
});

describe("drawnBox", () => {
  const start = { x: 100, y: 100 };

  it("spans from the press to the pointer", () => {
    expect(drawnBox(start, { x: 160, y: 140 }, false)).toEqual({ x: 100, y: 100, width: 60, height: 40 });
  });

  it("normalises a drag up and to the left", () => {
    expect(drawnBox(start, { x: 40, y: 70 }, false)).toEqual({ x: 40, y: 70, width: 60, height: 30 });
  });

  it("squares to the longer side under Shift", () => {
    expect(drawnBox(start, { x: 160, y: 120 }, true)).toEqual({ x: 100, y: 100, width: 60, height: 60 });
  });

  // The square has to keep growing toward the pointer, or a Shift-draw up
  // and to the left would flip back below the press point.
  it("squares toward the pointer when dragging up and left", () => {
    expect(drawnBox(start, { x: 40, y: 80 }, true)).toEqual({ x: 40, y: 40, width: 60, height: 60 });
  });
});

describe("finalBox", () => {
  const start = { x: 200, y: 300 };

  it("turns a click into the default size, centred on it", () => {
    const half = SHAPE_DEFAULT_SIZE / 2;
    expect(finalBox(start, { x: 200, y: 300, width: 0, height: 0 }, 1)).toEqual({
      x: 200 - half, y: 300 - half, width: SHAPE_DEFAULT_SIZE, height: SHAPE_DEFAULT_SIZE,
    });
  });

  // Measured on screen: 3 canvas units is a click at 100% but a real drag at
  // 400%, where it covers 12 screen px.
  it("judges a click in screen px, not canvas units", () => {
    const small = { x: 200, y: 300, width: 3, height: 3 };
    expect(finalBox(start, small, 1).width).toBe(SHAPE_DEFAULT_SIZE);
    expect(finalBox(start, small, 4).width).toBe(SHAPE_MIN_SIZE);
  });

  it("keeps a real drag, holding each side to the minimum", () => {
    expect(finalBox(start, { x: 200, y: 300, width: 120, height: 2 }, 1)).toEqual({
      x: 200, y: 300, width: 120, height: SHAPE_MIN_SIZE,
    });
  });
});

describe("shapes on the shared node paths", () => {
  // Marks the record, which is what keeps a port off it.
  it("publishes the shape kind with its geometry", () => {
    syncNodeGeometry(rect());
    expect(useKonvaNodes.getState().nodes.s).toMatchObject({
      canvasX: 10, canvasY: 20, canvasW: 30, canvasH: 40, shape: "rect",
    });
  });

  it("leaves an image's record without a shape kind", () => {
    syncNodeGeometry(new Konva.Rect({ id: "img", width: 10, height: 10 }));
    expect(useKonvaNodes.getState().nodes.img.shape).toBeUndefined();
  });

  it("pastes an ellipse back as an ellipse", () => {
    const [copy] = pasteNodes(layer(), copyNodes([rect({ shapeKind: "ellipse" } as Partial<Konva.ShapeConfig>)]));
    expect((copy as BoardShape).shapeKind()).toBe("ellipse");
  });

  it("pastes back as a BoardShape of the same kind and size", () => {
    const l = layer();
    const [copy] = pasteNodes(l, copyNodes([rect()]));
    expect(isBoardShape(copy)).toBe(true);
    expect((copy as BoardShape).shapeKind()).toBe("rect");
    expect(copy.width()).toBe(30);
    expect(copy.height()).toBe(40);
    expect(copy.id()).not.toBe("s");
  });
});

describe("resize handles", () => {
  const select = (nodes: Konva.Shape[]) => {
    const l = layer();
    const tr = new Konva.Transformer();
    nodes.forEach((n) => l.add(n));
    l.add(tr);
    tr.nodes(nodes);
    updateSelectionChrome(l, tr);
    return tr;
  };

  it("gives a shape all eight handles and a free ratio", () => {
    const tr = select([rect()]);
    expect(tr.enabledAnchors()).toHaveLength(8);
    expect(tr.keepRatio()).toBe(false);
  });

  it("keeps an image on its four corners with the ratio locked", () => {
    const tr = select([new Konva.Rect({ name: "selectable", width: 10, height: 10 })]);
    expect(tr.enabledAnchors()).toHaveLength(4);
    expect(tr.keepRatio()).toBe(true);
  });

  it("goes back to corners when the selection moves from a shape to an image", () => {
    const l = layer();
    const tr = new Konva.Transformer();
    const s = rect();
    const img = new Konva.Rect({ name: "selectable", width: 10, height: 10 });
    l.add(s, img, tr);
    tr.nodes([s]);
    updateSelectionChrome(l, tr);
    tr.nodes([img]);
    updateSelectionChrome(l, tr);
    expect(tr.enabledAnchors()).toHaveLength(4);
    expect(tr.keepRatio()).toBe(true);
  });
});

describe("pointingOf", () => {
  const start = { x: 100, y: 100 };

  it("follows the axis the drag mostly went along", () => {
    expect(pointingOf(start, { x: 200, y: 150 })).toBe("right");
    expect(pointingOf(start, { x: 0, y: 150 })).toBe("left");
    expect(pointingOf(start, { x: 150, y: 220 })).toBe("down");
    expect(pointingOf(start, { x: 150, y: 0 })).toBe("up");
  });

  it("prefers sideways on an exact diagonal", () => {
    expect(pointingOf(start, { x: 150, y: 150 })).toBe("right");
  });
});
