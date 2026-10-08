import { describe, it, expect, beforeEach } from "vitest";
import Konva from "konva";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useToolStore } from "@/store/tool.store";
import { copyNodes, pasteNodes, deleteNodes, type ClipboardEntry } from "../clipboard";
import { applyDraggability } from "../draggability";

// A Group stands in for the layer: it is a Konva container with no canvas of
// its own, so none of this needs a Stage (which jsdom cannot provide).
const layer = () => new Konva.Group() as unknown as Konva.Layer;

beforeEach(() => {
  useKonvaNodes.setState({ nodes: {} });
  useToolStore.setState({ activeTool: "pointer" });
});

describe("copyNodes", () => {
  it("captures one entry per selected node, with its class and attrs", () => {
    const a = new Konva.Rect({ id: "a", x: 1, y: 2, name: "selectable" });
    const b = new Konva.Rect({ id: "b", x: 3, y: 4, name: "selectable" });
    const out = copyNodes([a, b]);
    expect(out).toHaveLength(2);
    expect(out[0].className).toBe("Rect");
    expect(out[0].attrs.x).toBe(1);
    expect(out[1].attrs.y).toBe(4);
  });

  // imageUrl lives in konvaNodes, not on the shape. Without carrying it, a
  // pasted image cannot be used as a generation reference.
  it("carries imageUrl across from the geometry store", () => {
    useKonvaNodes.getState().upsert({
      id: "a", canvasX: 0, canvasY: 0, canvasW: 10, canvasH: 10,
      imageUrl: "data:image/png;base64,AAA",
    });
    const a = new Konva.Rect({ id: "a", name: "selectable" });
    expect(copyNodes([a])[0].imageUrl).toBe("data:image/png;base64,AAA");
  });
});

describe("pasteNodes", () => {
  const entry = (over: Partial<ClipboardEntry> = {}): ClipboardEntry => ({
    className: "Rect",
    attrs: { x: 10, y: 20, width: 30, height: 40, id: "original", name: "selectable" },
    ...over,
  });

  it("offsets the copy so it does not land on the original", () => {
    const l = layer();
    const [node] = pasteNodes(l, [entry()]);
    expect(node.x()).toBe(30);
    expect(node.y()).toBe(40);
  });

  it("mints a fresh id rather than reusing the source's", () => {
    // syncNodeGeometry skips id-less nodes, and a duplicate id would collide
    // in konvaNodes -- either way the paste would end up with no port.
    const l = layer();
    const [node] = pasteNodes(l, [entry()]);
    expect(node.id()).toBeTruthy();
    expect(node.id()).not.toBe("original");
  });

  it("gives every node of a multi-paste a distinct id", () => {
    const l = layer();
    const nodes = pasteNodes(l, [entry(), entry(), entry()]);
    expect(new Set(nodes.map((n) => n.id())).size).toBe(3);
  });

  it("adds the copies to the layer and keeps them selectable", () => {
    const l = layer();
    pasteNodes(l, [entry(), entry()]);
    expect(l.find(".selectable")).toHaveLength(2);
  });

  it("registers an image paste in the geometry store with its imageUrl", () => {
    const l = layer();
    const [node] = pasteNodes(l, [entry({ imageUrl: "data:image/png;base64,BBB" })]);
    const rec = useKonvaNodes.getState().nodes[node.id()];
    expect(rec?.imageUrl).toBe("data:image/png;base64,BBB");
    expect(rec?.canvasX).toBe(30);
  });

  it("does not register a node that carries no image", () => {
    const l = layer();
    const [node] = pasteNodes(l, [entry()]);
    expect(useKonvaNodes.getState().nodes[node.id()]).toBeUndefined();
  });
});

describe("deleteNodes", () => {
  it("removes the node from its layer and from the store", () => {
    const l = layer();
    const a = new Konva.Rect({ id: "a", name: "selectable" });
    l.add(a);
    useKonvaNodes.getState().upsert({ id: "a", canvasX: 0, canvasY: 0, canvasW: 1, canvasH: 1 });

    deleteNodes([a]);
    expect(l.find(".selectable")).toHaveLength(0);
    expect(useKonvaNodes.getState().nodes["a"]).toBeUndefined();
  });
});

describe("applyDraggability", () => {
  it("makes selectable nodes draggable in pointer mode", () => {
    const l = layer();
    const a = new Konva.Rect({ name: "selectable" });
    l.add(a);
    applyDraggability(l);
    expect(a.draggable()).toBe(true);
  });

  it("makes them undraggable under any other tool", () => {
    const l = layer();
    const a = new Konva.Rect({ name: "selectable" });
    l.add(a);
    useToolStore.setState({ activeTool: "frame" });
    applyDraggability(l);
    expect(a.draggable()).toBe(false);
  });

  // Reading the tool at call time is the whole point: capturing it at
  // construction left a node created under another tool permanently stuck.
  it("reflects a tool change on the next call", () => {
    const l = layer();
    const a = new Konva.Rect({ name: "selectable" });
    l.add(a);
    useToolStore.setState({ activeTool: "frame" });
    applyDraggability(l);
    useToolStore.setState({ activeTool: "pointer" });
    applyDraggability(l);
    expect(a.draggable()).toBe(true);
  });

  it("leaves nodes that are not selectable alone", () => {
    const l = layer();
    const chrome = new Konva.Rect({ name: "selection-outline" });
    l.add(chrome);
    applyDraggability(l);
    expect(chrome.draggable()).toBe(false);
  });
});
