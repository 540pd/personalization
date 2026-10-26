// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import Konva from "konva";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { useConnectionStore, type Connection } from "@/store/connection.store";
import { useToolStore } from "@/store/tool.store";
import { createHistory } from "@/lib/canvas/history";
import { copySelection, createEditKeysHandler } from "../clipboard";

// A Group stands in for the layer, and a plain object for the transformer:
// neither needs a Stage, which jsdom cannot provide.
const layer = () => {
  const g = new Konva.Group() as unknown as Konva.Layer;
  g.batchDraw = () => g;
  return g;
};
function fakeTransformer() {
  let nodes: Konva.Node[] = [];
  return {
    nodes(next?: Konva.Node[]) {
      if (next === undefined) return nodes;
      nodes = next;
      return this;
    },
  } as unknown as Konva.Transformer;
}

// `isActive` here only marks a fixture as selected: setPanels puts it in the
// store's selection, where selection lives (not on the panel).
type Fixture = PanelInstance & { isActive?: boolean };
const panel = (over: Partial<Fixture>): Fixture => ({
  id: "p1", kind: "image", canvasX: 100, canvasY: 100, w: 200, h: 150, ...over,
});

function setPanels(list: Fixture[]) {
  useNodePanel.setState({
    panels: list.map(({ isActive: _a, ...p }) => p),
    selectedIds: list.filter((p) => p.isActive).map((p) => p.id),
    openId: null,
  });
}

const wire = (fromNodeId: string, fromNodeType: "panel" | "konva", toNodeId: string): Connection => ({
  id: `${fromNodeId}->${toNodeId}`, fromNodeId, fromNodeType, toNodeId, toNodeType: "panel",
});

const key = (code: string) => new KeyboardEvent("keydown", { code, ctrlKey: true });

function image(l: Konva.Layer, id: string) {
  const n = new Konva.Rect({ id, x: 10, y: 10, width: 50, height: 50, name: "selectable" });
  l.add(n);
  useKonvaNodes.getState().upsert({
    id, canvasX: 10, canvasY: 10, canvasW: 50, canvasH: 50,
    imageUrl: `data:${id}`, label: `${id}.png`,
  });
  return n;
}

function setup() {
  const l = layer();
  const transformer = fakeTransformer();
  const history = createHistory();
  history.register("panels", {
    capture: () => useNodePanel.getState().panels,
    restore: (s) => useNodePanel.getState().replaceAll(s as PanelInstance[]),
  });
  history.register("connections", {
    capture: () => useConnectionStore.getState().connections,
    restore: (s) => useConnectionStore.getState().replaceConnections(s as Connection[]),
  });
  const handle = createEditKeysHandler({
    layer: l, transformer,
    applyDraggability: () => {},
    syncAllNodeGeometry: () => {},
    updateSelectionChrome: () => {},
    saveSnapshot: (k) => history.commit(k),
  });
  history.commit();
  return { l, transformer, history, handle };
}

beforeEach(() => {
  useKonvaNodes.setState({ nodes: {} });
  useKonvaSelection.getState().clearSelection();
  useNodePanel.getState().clearAll();
  useConnectionStore.setState({ connections: [], drag: null, selectedIds: [] });
  useToolStore.setState({ activeTool: "pointer" });
});

describe("copySelection", () => {
  it("takes active panels and only the wires with both ends selected", () => {
    setPanels([
      panel({ id: "a", isActive: true }),
      panel({ id: "b", isActive: true }),
      panel({ id: "c" }),
    ]);
    useConnectionStore.setState({ connections: [wire("a", "panel", "b"), wire("b", "panel", "c")] });

    const clip = copySelection([]);
    expect(clip.panels.map((p) => p.id)).toEqual(["a", "b"]);
    expect(clip.connections.map((c) => c.id)).toEqual(["a->b"]);
  });

  it("counts a selected uploaded image as a wire end", () => {
    const img = image(layer(), "img");
    setPanels([panel({ id: "a", isActive: true })]);
    useConnectionStore.setState({ connections: [wire("img", "konva", "a")] });

    const clip = copySelection([img]);
    expect(clip.konva).toHaveLength(1);
    expect(clip.connections).toHaveLength(1);
  });
});

describe("Ctrl+C / Ctrl+V", () => {
  it("pastes a generated node with its output, size and kind, minus the job", () => {
    const { handle } = setup();
    setPanels([panel({
      id: "a", kind: "video", isActive: true, label: "sunset",
      output: { type: "video", value: "https://x/v.mp4" }, job: "job-1",
    })]);

    handle(key("KeyC"));
    handle(key("KeyV"));

    const { panels } = useNodePanel.getState();
    expect(panels).toHaveLength(2);
    const [orig, copy] = panels;
    expect(copy.id).not.toBe("a");
    expect(copy).toMatchObject({
      kind: "video", w: 200, h: 150, canvasX: 120, canvasY: 120,
      output: { type: "video", value: "https://x/v.mp4" },
    });
    expect(copy.job).toBeUndefined();
    // Names are model context, so the copy is told apart from its original.
    expect(copy.label).toBe("sunset (2)");
    // The copy is the selection, not the original; no panel is open.
    expect(useNodePanel.getState().selectedIds).toEqual([copy.id]);
    expect(useNodePanel.getState().openId).toBeNull();
    expect(orig.id).toBe("a");
  });

  it("pastes every kind: image, instruction and video", () => {
    const { handle } = setup();
    setPanels([
      panel({ id: "a", kind: "image", isActive: true }),
      panel({ id: "b", kind: "instruction", isActive: true, output: { type: "text", value: "hi" } }),
      panel({ id: "c", kind: "video", isActive: true }),
    ]);

    handle(key("KeyC"));
    handle(key("KeyV"));

    const copies = useNodePanel.getState().panels.slice(3);
    expect(copies.map((p) => p.kind)).toEqual(["image", "instruction", "video"]);
    expect(copies[1].output).toEqual({ type: "text", value: "hi" });
  });

  it("pastes a mixed selection with the wires re-pointed at the copies", () => {
    const { l, transformer, handle } = setup();
    const img = image(l, "img");
    transformer.nodes([img]);
    setPanels([
      panel({ id: "a", isActive: true }),
      panel({ id: "b", isActive: true }),
    ]);
    useConnectionStore.setState({ connections: [wire("img", "konva", "a"), wire("a", "panel", "b")] });

    handle(key("KeyC"));
    handle(key("KeyV"));

    const pastedImg = transformer.nodes()[0];
    expect(transformer.nodes()).toHaveLength(1);
    expect(pastedImg.id()).not.toBe("img");
    expect(useKonvaNodes.getState().nodes[pastedImg.id()]).toMatchObject({
      imageUrl: "data:img", label: "img.png (2)",
    });

    const [, , copyA, copyB] = useNodePanel.getState().panels;
    const { connections, selectedIds } = useConnectionStore.getState();
    expect(connections).toHaveLength(4);
    const pasted = connections.slice(2);
    expect(pasted.map((c) => [c.fromNodeId, c.toNodeId])).toEqual([
      [pastedImg.id(), copyA.id],
      [copyA.id, copyB.id],
    ]);
    expect(selectedIds).toEqual(pasted.map((c) => c.id));
  });

  it("drops a wire whose other end was not copied", () => {
    const { handle } = setup();
    setPanels([panel({ id: "a" }), panel({ id: "b", isActive: true })]);
    useConnectionStore.setState({ connections: [wire("a", "panel", "b")] });

    handle(key("KeyC"));
    handle(key("KeyV"));

    expect(useConnectionStore.getState().connections).toHaveLength(1);
    expect(useConnectionStore.getState().selectedIds).toEqual([]);
  });

  it("deselects uploaded images when only panels are pasted", () => {
    const { l, transformer, handle } = setup();
    setPanels([panel({ id: "a", isActive: true })]);
    handle(key("KeyC"));
    transformer.nodes([image(l, "img")]);

    handle(key("KeyV"));
    expect(transformer.nodes()).toHaveLength(0);
  });

  it("is one undo step for nodes and wires together", () => {
    const { history, handle } = setup();
    setPanels([
      panel({ id: "a", isActive: true }),
      panel({ id: "b", isActive: true }),
    ]);
    useConnectionStore.setState({ connections: [wire("a", "panel", "b")] });
    history.commit();

    handle(key("KeyC"));
    handle(key("KeyV"));
    expect(useNodePanel.getState().panels).toHaveLength(4);

    history.undo();
    expect(useNodePanel.getState().panels).toHaveLength(2);
    expect(useConnectionStore.getState().connections).toHaveLength(1);
  });

  it("keeps the previous clipboard when Ctrl+C has nothing selected", () => {
    const { handle } = setup();
    setPanels([panel({ id: "a", isActive: true })]);
    handle(key("KeyC"));
    useNodePanel.getState().clearSelection();
    handle(key("KeyC"));

    handle(key("KeyV"));
    expect(useNodePanel.getState().panels).toHaveLength(2);
  });

  it("leaves Ctrl+C / Ctrl+V in a text field alone", () => {
    const { handle } = setup();
    setPanels([panel({ id: "a", isActive: true })]);
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    const inField = (code: string) => {
      const e = key(code);
      Object.defineProperty(e, "target", { value: textarea });
      return e;
    };

    handle(inField("KeyC"));
    handle(inField("KeyV"));
    expect(useNodePanel.getState().panels).toHaveLength(1);
    textarea.remove();
  });
});

describe("panel draft", () => {
  it("is carried to the pasted copy", () => {
    const { handle } = setup();
    setPanels([panel({
      id: "a", isActive: true, draft: { model: "gemini-3-pro-image", instruction: "a cat on a beach" },
    })]);

    handle(key("KeyC"));
    handle(key("KeyV"));

    expect(useNodePanel.getState().panels[1].draft).toEqual({
      model: "gemini-3-pro-image", instruction: "a cat on a beach",
    });
  });

  it("is not reverted by undoing an unrelated step", () => {
    const { history } = setup();
    setPanels([panel({ id: "a" })]);
    history.commit();
    useNodePanel.getState().setCanvasPos("a", 500, 500);
    history.commit();
    // Typing is not an undo step.
    useNodePanel.getState().setDraft("a", { model: "m", instruction: "still typing" });

    history.undo();
    const [a] = useNodePanel.getState().panels;
    expect(a.canvasX).toBe(100);
    expect(a.draft?.instruction).toBe("still typing");
  });
});

describe("labels on paste", () => {
  it("does not stack suffixes: copying \"cat (2)\" gives \"cat (3)\"", () => {
    const { handle } = setup();
    setPanels([
      panel({ id: "a", label: "cat" }),
      panel({ id: "b", label: "cat (2)", isActive: true }),
    ]);

    handle(key("KeyC"));
    handle(key("KeyV"));

    expect(useNodePanel.getState().panels[2].label).toBe("cat (3)");
  });

  it("is unique across images and panels in one mixed paste", () => {
    const { l, transformer, handle } = setup();
    const img = image(l, "img");
    useKonvaNodes.getState().upsert({ ...useKonvaNodes.getState().nodes.img, label: "cat" });
    transformer.nodes([img]);
    setPanels([panel({ id: "a", isActive: true, label: "cat" })]);

    handle(key("KeyC"));
    handle(key("KeyV"));

    const pastedImg = transformer.nodes()[0];
    const imgLabel = useKonvaNodes.getState().nodes[pastedImg.id()].label;
    const panelLabel = useNodePanel.getState().panels[1].label;
    expect(imgLabel).toBe("cat (2)");
    expect(panelLabel).toBe("cat (3)");
  });

  it("checks the panel copy against uploaded image names", () => {
    const { l, handle } = setup();
    image(l, "img");
    useKonvaNodes.getState().upsert({ ...useKonvaNodes.getState().nodes.img, label: "cat (2)" });
    setPanels([panel({ id: "a", isActive: true, label: "cat" })]);

    handle(key("KeyC"));
    handle(key("KeyV"));

    expect(useNodePanel.getState().panels[1].label).toBe("cat (3)");
  });
});
