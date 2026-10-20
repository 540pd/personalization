import { describe, it, expect, beforeEach } from "vitest";
import Konva from "konva";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useToolStore } from "@/store/tool.store";
import { copyNodes, pasteNodes, deleteNodes } from "../clipboard";
import type { NodeEntry } from "../nodeEntry";
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

  // Same reason as imageUrl: the label lives in konvaNodes, not on the shape,
  // so copying the Konva attrs alone loses it.
  it("carries the label across from the geometry store", () => {
    useKonvaNodes.getState().upsert({
      id: "a", canvasX: 0, canvasY: 0, canvasW: 10, canvasH: 10, label: "cat",
    });
    const a = new Konva.Rect({ id: "a", name: "selectable" });
    expect(copyNodes([a])[0].label).toBe("cat");
  });
});

describe("pasteNodes", () => {
  const entry = (over: Partial<NodeEntry> = {}): NodeEntry => ({
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

  it("does not register a node that carries no image and no label", () => {
    const l = layer();
    const [node] = pasteNodes(l, [entry()]);
    expect(useKonvaNodes.getState().nodes[node.id()]).toBeUndefined();
  });

  // Without this the paste lands nameless: KonvaNodeLabels renders nothing
  // for a record with no label.
  it("carries the label onto the copy", () => {
    const l = layer();
    const [node] = pasteNodes(l, [entry({ label: "cat" })]);
    expect(useKonvaNodes.getState().nodes[node.id()]?.label).toBe("cat");
  });

  it("suffixes the label when the original is still on the board", () => {
    useKonvaNodes.getState().upsert({
      id: "original", canvasX: 0, canvasY: 0, canvasW: 1, canvasH: 1, label: "cat",
    });
    const l = layer();
    const [node] = pasteNodes(l, [entry({ label: "cat" })]);
    expect(useKonvaNodes.getState().nodes[node.id()]?.label).toBe("cat (2)");
  });

  // The store does not yet know about the first of the batch when the second
  // is named, so the running list has to carry within one paste.
  it("keeps labels distinct across a multi-node paste", () => {
    useKonvaNodes.getState().upsert({
      id: "original", canvasX: 0, canvasY: 0, canvasW: 1, canvasH: 1, label: "cat",
    });
    const l = layer();
    const nodes = pasteNodes(l, [entry({ label: "cat" }), entry({ label: "cat" })]);
    const labels = nodes.map((n) => useKonvaNodes.getState().nodes[n.id()]?.label);
    expect(labels).toEqual(["cat (2)", "cat (3)"]);
  });

  it("registers a labelled node even when it carries no image", () => {
    const l = layer();
    const [node] = pasteNodes(l, [entry({ label: "cat" })]);
    expect(useKonvaNodes.getState().nodes[node.id()]).toBeDefined();
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
