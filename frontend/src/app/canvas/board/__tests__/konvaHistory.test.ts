import { describe, it, expect, beforeEach, vi } from "vitest";
import Konva from "konva";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useToolStore } from "@/store/tool.store";
import { captureLayer, restoreSnapshot } from "../konvaHistory";
import { createHoverOutline } from "../hoverOutline";
import { applyDraggability } from "../draggability";
import { syncAllNodeGeometry } from "../geometry";

// A Group stands in for the layer (no Stage under jsdom); it has no
// batchDraw of its own.
const layer = () => Object.assign(new Konva.Group(), { batchDraw: vi.fn() }) as unknown as Konva.Layer;

const node = (id: string, x = 0) =>
  new Konva.Rect({ id, name: "selectable", x, y: 0, width: 10, height: 10 });

function deps(l: Konva.Layer) {
  const transformer = new Konva.Transformer();
  return {
    layer: l,
    transformer,
    hover: createHoverOutline(l, transformer),
    applyDraggability: () => applyDraggability(l),
    syncAllNodeGeometry: () => syncAllNodeGeometry(l),
    updateSelectionChrome: vi.fn(),
  };
}

beforeEach(() => {
  useKonvaNodes.setState({ nodes: {} });
  useKonvaSelection.getState().clearSelection();
  useToolStore.setState({ activeTool: "pointer" });
});

describe("captureLayer", () => {
  it("records each node in paint order with its attrs and store fields", () => {
    const l = layer();
    l.add(node("a"), node("b"));
    useKonvaNodes.getState().upsert({
      id: "b", canvasX: 0, canvasY: 0, canvasW: 10, canvasH: 10, imageUrl: "data:x", label: "cat",
    });
    const snap = captureLayer(l);
    expect(snap.map((s) => s.node.id())).toEqual(["a", "b"]);
    expect(snap[1]).toMatchObject({ imageUrl: "data:x", label: "cat" });
    expect(snap[0].attrs.id).toBe("a");
  });

  it("copies attrs, so a later change does not reach the snapshot", () => {
    const l = layer();
    const a = node("a", 5);
    l.add(a);
    const snap = captureLayer(l);
    a.x(50);
    expect(snap[0].attrs.x).toBe(5);
  });
});

describe("restoreSnapshot", () => {
  it("puts back attrs, removed nodes and their order", () => {
    const l = layer();
    const a = node("a", 1);
    const b = node("b", 2);
    l.add(a, b);
    const snap = captureLayer(l);

    a.x(100);
    b.remove();
    restoreSnapshot(snap, deps(l));

    expect(a.x()).toBe(1);
    expect(b.getParent()).toBe(l);
    expect((l.find(".selectable") as Konva.Shape[]).map((n) => n.id())).toEqual(["a", "b"]);
  });

  it("drops a node the snapshot does not have, with its record", () => {
    const l = layer();
    l.add(node("a"));
    const snap = captureLayer(l);
    const extra = node("x");
    l.add(extra);
    useKonvaNodes.getState().upsert({ id: "x", canvasX: 0, canvasY: 0, canvasW: 1, canvasH: 1 });

    restoreSnapshot(snap, deps(l));

    expect(extra.getParent()).toBeNull();
    expect(useKonvaNodes.getState().nodes.x).toBeUndefined();
  });

  it("brings back a deleted node's name, but never overwrites a live one", () => {
    const l = layer();
    l.add(node("a"), node("b"));
    useKonvaNodes.getState().upsert({ id: "a", canvasX: 0, canvasY: 0, canvasW: 10, canvasH: 10, label: "old" });
    useKonvaNodes.getState().upsert({ id: "b", canvasX: 0, canvasY: 0, canvasW: 10, canvasH: 10, label: "cat" });
    const snap = captureLayer(l);
    // A rename of a, and b deleted with its record.
    useKonvaNodes.getState().upsert({ ...useKonvaNodes.getState().nodes.a, label: "new" });
    useKonvaNodes.getState().remove("b");

    restoreSnapshot(snap, deps(l));

    expect(useKonvaNodes.getState().nodes.a.label).toBe("new");
    expect(useKonvaNodes.getState().nodes.b.label).toBe("cat");
  });

  it("clears the selection in the transformer and the store", () => {
    const l = layer();
    const a = node("a");
    l.add(a);
    const d = deps(l);
    d.transformer.nodes([a]);
    useKonvaSelection.getState().select("a");

    restoreSnapshot(captureLayer(l), d);

    expect(d.transformer.nodes()).toEqual([]);
    expect(useKonvaSelection.getState().selectedIds).toEqual([]);
    expect(d.updateSelectionChrome).toHaveBeenCalled();
  });
});
