import { describe, it, expect, vi, beforeEach } from "vitest";
import Konva from "konva";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useToolStore } from "@/store/tool.store";
import { layerFor, onShapesLayer } from "../boardLayers";
import { captureLayer, restoreSnapshot } from "../konvaHistory";
import { pasteNodes, copyNodes } from "../clipboard";
import { serializeBoard } from "../boardFile";
import { createHoverOutline } from "../hoverOutline";
import { createShape } from "../shapes";

// Shapes on a layer of their own (#430). Groups stand in for the stage and
// its layers: jsdom has no Stage.

const group = () => Object.assign(new Konva.Group(), { batchDraw: vi.fn() }) as unknown as Konva.Layer;

function board() {
  const root = new Konva.Group();
  const shapes = group();
  const main = group();
  root.add(shapes, main);
  return { root, shapes, main, layerFor: (n: Konva.Node) => layerFor({ shapes, main }, n) };
}

const image = (id: string) => new Konva.Rect({ id, name: "selectable", x: 0, y: 0, width: 10, height: 10 });
const shape = (id: string) => {
  const s = createShape("rect", { x: 0, y: 0, width: 10, height: 10 });
  s.setAttrs({ id, name: "selectable" });
  return s;
};

beforeEach(() => {
  useKonvaNodes.setState({ nodes: {} });
  useKonvaSelection.getState().clearSelection();
  useToolStore.setState({ activeTool: "pointer" });
});

describe("onShapesLayer / layerFor", () => {
  it("sends every drawn kind to the shapes layer, and the rest to the main one", () => {
    const b = board();
    for (const kind of ["rect", "ellipse", "triangle", "diamond", "line", "arrow", "blockArrow"] as const) {
      const s = createShape(kind, { x: 0, y: 0, width: 10, height: 10 });
      expect(onShapesLayer(s)).toBe(true);
      expect(b.layerFor(s)).toBe(b.shapes);
    }
    // Anything without a shape kind -- an image, a text -- goes on the main one.
    expect(b.layerFor(image("i"))).toBe(b.main);
  });
});

describe("across both layers", () => {
  it("undo puts a deleted shape back on the shapes layer and an image on the main one", () => {
    const b = board();
    const s = shape("s");
    const i = image("i");
    b.shapes.add(s);
    b.main.add(i);
    const snap = captureLayer(b.root);
    s.remove();
    i.remove();

    const transformer = new Konva.Transformer();
    restoreSnapshot(snap, {
      layer: b.main, shapes: b.shapes, root: b.root, layerFor: b.layerFor, transformer,
      hover: createHoverOutline(b.main, transformer),
      applyDraggability: () => {}, syncAllNodeGeometry: () => {}, updateSelectionChrome: () => {},
    });
    expect(s.getParent()).toBe(b.shapes);
    expect(i.getParent()).toBe(b.main);
  });

  it("a paste puts each copy on its own layer", () => {
    const b = board();
    const [s, i] = pasteNodes(b.layerFor, copyNodes([shape("s"), image("i")]));
    expect(s.getParent()).toBe(b.shapes);
    expect(i.getParent()).toBe(b.main);
  });

  it("saving reads both layers, shapes first, as they paint", () => {
    const b = board();
    b.main.add(image("i"));
    b.shapes.add(shape("s1"), shape("s2"));
    expect(serializeBoard(b.root).nodes.map((n) => n.attrs.id)).toEqual(["s1", "s2", "i"]);
  });

  it("the hover outline follows the hovered node onto its layer", () => {
    const b = board();
    const s = shape("s");
    b.shapes.add(s);
    // A real layer has getLayer(); a Group stands in for one here.
    (s as unknown as { getLayer: () => Konva.Layer }).getLayer = () => b.shapes;
    const hover = createHoverOutline(b.main, new Konva.Transformer());
    hover.show(s);
    expect(hover.node.getParent()).toBe(b.shapes);
  });
});
