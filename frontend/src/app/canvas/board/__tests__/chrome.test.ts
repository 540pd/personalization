import { describe, it, expect, beforeEach } from "vitest";
import Konva from "konva";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useToolStore } from "@/store/tool.store";
import { createOutlineRect, traceShape } from "../outline";
import { createHoverOutline } from "../hoverOutline";
import { updateSelectionChrome } from "../selectionChrome";
import { syncNodeGeometry, syncAllNodeGeometry } from "../geometry";

// A Group stands in for the layer: it is a Konva container with no canvas of
// its own, so none of this needs a Stage (which jsdom cannot provide).
const layer = () => new Konva.Group() as unknown as Konva.Layer;

const node = (over: Konva.ShapeConfig = {}) =>
  new Konva.Rect({ name: "selectable", x: 10, y: 20, width: 30, height: 40, ...over });

beforeEach(() => {
  useKonvaNodes.setState({ nodes: {} });
  useToolStore.setState({ activeTool: "pointer" });
});

describe("createOutlineRect", () => {
  it("is inert: invisible and not hit-testable", () => {
    // Chrome must never swallow a click meant for the node underneath, and
    // must not appear before something asks it to.
    const r = createOutlineRect("hover-outline");
    expect(r.visible()).toBe(false);
    expect(r.listening()).toBe(false);
    expect(r.name()).toBe("hover-outline");
  });

  it("keeps a constant stroke weight at every zoom", () => {
    expect(createOutlineRect("x").strokeScaleEnabled()).toBe(false);
  });
});

describe("traceShape", () => {
  it("lays the rect exactly over the shape", () => {
    const r = createOutlineRect("x");
    traceShape(r, node());
    expect(r.position()).toEqual({ x: 10, y: 20 });
    expect(r.size()).toEqual({ width: 30, height: 40 });
  });

  it("takes scale into account, not just width", () => {
    // A resized node carries its new size in scaleX/scaleY; reading width()
    // alone left the outline at the pre-resize box.
    const r = createOutlineRect("x");
    traceShape(r, node({ scaleX: 2, scaleY: 3 }));
    expect(r.size()).toEqual({ width: 60, height: 120 });
  });

  it("follows the shape's corners", () => {
    const r = createOutlineRect("x");
    traceShape(r, node({ cornerRadius: 10 }));
    expect(r.cornerRadius()).toBe(10);
  });

  it("squares off for a shape with no radius", () => {
    const r = createOutlineRect("x");
    r.cornerRadius(10);
    traceShape(r, node());
    expect(r.cornerRadius()).toBe(0);
  });
});

describe("createHoverOutline", () => {
  const setup = () => {
    const l = layer();
    const transformer = new Konva.Transformer();
    l.add(transformer);
    return { l, transformer, hover: createHoverOutline(l, transformer) };
  };

  it("traces the hovered shape and shows it", () => {
    const { hover } = setup();
    hover.show(node());
    expect(hover.node.visible()).toBe(true);
    expect(hover.node.size()).toEqual({ width: 30, height: 40 });
  });

  it("stays hidden for a selected node", () => {
    // The transformer already draws a border there; two would double up.
    const { transformer, hover } = setup();
    const n = node();
    transformer.nodes([n]);
    hover.show(n);
    expect(hover.node.visible()).toBe(false);
  });

  it("stays hidden under any tool but pointer", () => {
    const { hover } = setup();
    useToolStore.setState({ activeTool: "frame" });
    hover.show(node());
    expect(hover.node.visible()).toBe(false);
  });

  it("hides again on hide()", () => {
    const { hover } = setup();
    hover.show(node());
    hover.hide();
    expect(hover.node.visible()).toBe(false);
  });

  it("sits above the node it traces", () => {
    // Shapes are added after the layer's chrome, so without the raise the
    // outline is painted underneath the image it is outlining.
    const { l, hover } = setup();
    const n = node();
    l.add(n);
    hover.show(n);
    expect(hover.node.zIndex()).toBeGreaterThan(n.zIndex());
  });
});

describe("updateSelectionChrome", () => {
  const setup = () => {
    const l = layer();
    const transformer = new Konva.Transformer();
    l.add(transformer);
    return { l, transformer };
  };
  const visibleOutlines = (l: Konva.Layer) =>
    (l.find(".selection-outline") as Konva.Rect[]).filter((r) => r.visible());

  it("draws no outline for a single selection", () => {
    // One node is already marked by the transformer's own border.
    const { l, transformer } = setup();
    transformer.nodes([node()]);
    updateSelectionChrome(l, transformer);
    expect(visibleOutlines(l)).toHaveLength(0);
    expect(transformer.borderEnabled()).toBe(true);
  });

  it("draws one outline per node when several are selected", () => {
    const { l, transformer } = setup();
    transformer.nodes([node(), node({ x: 100 })]);
    updateSelectionChrome(l, transformer);
    expect(visibleOutlines(l)).toHaveLength(2);
  });

  it("suppresses the transformer's own border and handles when multi", () => {
    // A combined bounding box hides which nodes are actually in the set.
    const { l, transformer } = setup();
    transformer.nodes([node(), node()]);
    updateSelectionChrome(l, transformer);
    expect(transformer.borderEnabled()).toBe(false);
    expect(transformer.resizeEnabled()).toBe(false);
  });

  it("keeps the transformer's node list intact while multi-selected", () => {
    // Delete, Ctrl+C and the dragstart check all read transformer.nodes();
    // emptying it to hide the border would quietly break all three.
    const { l, transformer } = setup();
    transformer.nodes([node(), node()]);
    updateSelectionChrome(l, transformer);
    expect(transformer.nodes()).toHaveLength(2);
  });

  it("reuses the pooled rects instead of growing on every call", () => {
    // This runs on every dragmove frame.
    const { l, transformer } = setup();
    transformer.nodes([node(), node()]);
    updateSelectionChrome(l, transformer);
    updateSelectionChrome(l, transformer);
    updateSelectionChrome(l, transformer);
    expect(l.find(".selection-outline")).toHaveLength(2);
  });

  it("hides the surplus when the selection shrinks", () => {
    const { l, transformer } = setup();
    transformer.nodes([node(), node(), node()]);
    updateSelectionChrome(l, transformer);
    transformer.nodes([node()]);
    updateSelectionChrome(l, transformer);
    expect(visibleOutlines(l)).toHaveLength(0);
  });

  it("tracks the nodes as they move", () => {
    const { l, transformer } = setup();
    const a = node();
    transformer.nodes([a, node({ x: 100 })]);
    updateSelectionChrome(l, transformer);
    a.position({ x: 500, y: 600 });
    updateSelectionChrome(l, transformer);
    expect(visibleOutlines(l)[0].position()).toEqual({ x: 500, y: 600 });
  });
});

describe("syncNodeGeometry", () => {
  it("publishes the node's box to konvaNodes", () => {
    syncNodeGeometry(node({ id: "a", scaleX: 2 }));
    expect(useKonvaNodes.getState().nodes["a"]).toMatchObject({
      canvasX: 10,
      canvasY: 20,
      canvasW: 60,
      canvasH: 40,
    });
  });

  it("skips a node with no id", () => {
    // An entry keyed by "" would collide with the next id-less node and
    // neither would get a port.
    syncNodeGeometry(node());
    expect(Object.keys(useKonvaNodes.getState().nodes)).toHaveLength(0);
  });
});

describe("syncAllNodeGeometry", () => {
  it("publishes every selectable node", () => {
    const l = layer();
    l.add(node({ id: "a" }), node({ id: "b" }));
    syncAllNodeGeometry(l);
    expect(Object.keys(useKonvaNodes.getState().nodes).sort()).toEqual(["a", "b"]);
  });

  it("ignores chrome", () => {
    const l = layer();
    l.add(createOutlineRect("selection-outline"));
    syncAllNodeGeometry(l);
    expect(Object.keys(useKonvaNodes.getState().nodes)).toHaveLength(0);
  });

  it("refreshes z for nodes other than the one that moved", () => {
    // Raising one node shifts everyone else's index; syncing only the moved
    // node would leave the rest stale and a port would hide against the
    // wrong stacking.
    const l = layer();
    const a = node({ id: "a" });
    const b = node({ id: "b" });
    l.add(a, b);
    syncAllNodeGeometry(l);
    expect(useKonvaNodes.getState().nodes["b"].z).toBe(1);
    a.moveToTop();
    syncAllNodeGeometry(l);
    expect(useKonvaNodes.getState().nodes["b"].z).toBe(0);
  });
});
