// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import Konva from "konva";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { useConnectionStore } from "@/store/connection.store";
import { useFrames } from "@/store/frame.store";
import { useLayerOrder } from "@/store/layerOrder.store";
import { BoardShape } from "../shapes";
import {
  BOARD_FILE_FORMAT,
  BOARD_FILE_VERSION,
  boardFileName,
  plainAttrs,
  serializeBoard,
} from "../boardFile";

const panel = (over: Partial<PanelInstance>): PanelInstance => ({
  id: "p1", kind: "image", canvasX: 100, canvasY: 100, w: 200, h: 150,
  isActive: false, isPanelOpen: false, ...over,
});

beforeEach(() => {
  useKonvaNodes.setState({ nodes: {} });
  useNodePanel.setState({ panels: [], selectedId: null });
  useConnectionStore.setState({ connections: [], selectedIds: [] });
  useFrames.setState({ frames: {}, selectedIds: [] });
  useLayerOrder.setState({ topLayer: "dom" });
});

describe("plainAttrs", () => {
  it("keeps JSON values and drops what JSON cannot hold", () => {
    const img = document.createElement("img");
    const attrs = plainAttrs({
      x: 10, text: "hi", visible: true, fill: null,
      linePoints: [0, 0, 40, 20], nested: { a: 1 },
      hitFunc: () => {}, image: img, gone: undefined, bad: NaN,
    });
    expect(attrs).toEqual({
      x: 10, text: "hi", visible: true, fill: null,
      linePoints: [0, 0, 40, 20], nested: { a: 1 },
    });
  });

  it("drops an array holding something it cannot keep, rather than a half of it", () => {
    expect(plainAttrs({ list: [1, () => {}] })).toEqual({});
  });
});

describe("serializeBoard", () => {
  it("marks the file with its format and version", () => {
    const file = serializeBoard(new Konva.Group(), new Date("2026-10-18T09:30:00Z"));
    expect(file.format).toBe(BOARD_FILE_FORMAT);
    expect(file.version).toBe(BOARD_FILE_VERSION);
    expect(file.savedAt).toBe("2026-10-18T09:30:00.000Z");
  });

  it("stores Konva nodes in paint order, with their image and label", () => {
    const g = new Konva.Group();
    g.add(new BoardShape({ id: "s1", name: "selectable", shapeKind: "rect", x: 5, y: 6, width: 50, height: 40 }));
    // A media placeholder. Text needs a 2D context jsdom lacks; e2e covers it.
    g.add(new Konva.Rect({ id: "r1", name: "selectable", x: 1, y: 2, width: 240, height: 64, fill: "#eee" }));
    g.add(new Konva.Image({ id: "i1", name: "selectable", image: document.createElement("img"), x: 0, y: 0, width: 10, height: 10, hitFunc: () => {} }));
    // Not a board node: a draw preview is never "selectable".
    g.add(new Konva.Rect({ id: "preview", x: 0, y: 0, width: 5, height: 5 }));
    useKonvaNodes.getState().upsert({ id: "i1", canvasX: 0, canvasY: 0, canvasW: 10, canvasH: 10, imageUrl: "data:image/png;base64,AAAA", label: "cat" });

    const { nodes } = serializeBoard(g);
    expect(nodes.map((n) => n.className)).toEqual(["BoardShape", "Rect", "Image"]);
    expect(nodes[0].attrs).toMatchObject({ id: "s1", shapeKind: "rect", x: 5, y: 6 });
    expect(nodes[1].attrs).toMatchObject({ x: 1, y: 2, fill: "#eee" });
    expect(nodes[2]).toMatchObject({ imageUrl: "data:image/png;base64,AAAA", label: "cat" });
    expect(nodes[2].attrs).not.toHaveProperty("image");
    expect(nodes[2].attrs).not.toHaveProperty("hitFunc");
  });

  it("keeps panels in order without selection, open state or a running job", () => {
    useNodePanel.setState({
      panels: [
        panel({ id: "p1", isActive: true, isPanelOpen: true, job: "job-1", label: "Hero", output: { type: "image", value: "data:image/png;base64,BBBB" } }),
        panel({ id: "p2", kind: "compose" }),
      ],
    });
    const { panels } = serializeBoard(new Konva.Group());
    expect(panels.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(panels[0]).toMatchObject({ label: "Hero", output: { type: "image", value: "data:image/png;base64,BBBB" } });
    for (const p of panels) {
      expect(p).not.toHaveProperty("isActive");
      expect(p).not.toHaveProperty("isPanelOpen");
      expect(p).not.toHaveProperty("job");
    }
  });

  it("includes frames, wires and which layer paints on top", () => {
    useFrames.setState({ frames: { f1: { id: "f1", canvasX: 0, canvasY: 0, canvasW: 300, canvasH: 200, label: "Frame" } } });
    useConnectionStore.setState({
      connections: [{ id: "c1", fromNodeId: "i1", fromNodeType: "konva", toNodeId: "p1", toNodeType: "panel" }],
    });
    useLayerOrder.setState({ topLayer: "canvas" });
    const file = serializeBoard(new Konva.Group());
    expect(file.frames).toEqual([{ id: "f1", canvasX: 0, canvasY: 0, canvasW: 300, canvasH: 200, label: "Frame" }]);
    expect(file.connections).toHaveLength(1);
    expect(file.topLayer).toBe("canvas");
  });

  it("survives a JSON round trip unchanged", () => {
    const g = new Konva.Group();
    g.add(new BoardShape({ id: "s1", name: "selectable", shapeKind: "arrow", x: 0, y: 0, width: 80, height: 10, linePoints: [0, 0, 80, 10], bend: 12 }));
    useNodePanel.setState({ panels: [panel({ id: "p1" })] });
    const file = serializeBoard(g);
    expect(JSON.parse(JSON.stringify(file))).toEqual(file);
  });
});

describe("boardFileName", () => {
  it("uses the local date, zero-padded", () => {
    expect(boardFileName(new Date(2026, 0, 5, 23, 59))).toBe("PlaySpace 2026-01-05.json");
  });
});
