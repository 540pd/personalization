// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Konva from "konva";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { useConnectionStore } from "@/store/connection.store";
import { useFrames } from "@/store/frame.store";
import { useLayerOrder } from "@/store/layerOrder.store";
import { canvasHistory, createHistory } from "@/lib/canvas/history";
import { BoardShape } from "../shapes";
import { BOARD_FILE_FORMAT } from "../boardFile";
import {
  CANVAS_STORAGE_KEY,
  readSavedCanvas,
  startCanvasPersistence,
  writeCanvas,
} from "../canvasPersistence";

const panel = (over: Partial<PanelInstance>): PanelInstance => ({
  id: "panel-1", kind: "image", canvasX: 100, canvasY: 100, w: 200, h: 150,
  ...over,
});

/** A Storage whose setItem can be made to fail for values over `limit` characters. */
function memoryStorage(limit = Infinity): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get length() { return data.size; },
    clear: () => data.clear(),
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    removeItem: (k) => { data.delete(k); },
    setItem: (k, v) => {
      if (v.length > limit) throw new DOMException("quota", "QuotaExceededError");
      data.set(k, v);
    },
  };
}

function boardWithImage() {
  const g = new Konva.Group();
  g.add(new BoardShape({ id: "s1", name: "selectable", shapeKind: "rect", x: 5, y: 6, width: 50, height: 40 }));
  g.add(new Konva.Image({ id: "i1", name: "selectable", image: document.createElement("img"), x: 0, y: 0, width: 10, height: 10 }));
  useKonvaNodes.getState().upsert({ id: "i1", canvasX: 0, canvasY: 0, canvasW: 10, canvasH: 10, imageUrl: `data:image/png;base64,${"A".repeat(5000)}`, label: "cat" });
  return g;
}

beforeEach(() => {
  useKonvaNodes.setState({ nodes: {} });
  useNodePanel.setState({ panels: [], selectedIds: [], openId: null });
  useConnectionStore.setState({ connections: [], selectedIds: [] });
  useFrames.setState({ frames: {}, selectedIds: [] });
  useLayerOrder.setState({ topLayer: "dom" });
});

describe("writeCanvas / readSavedCanvas", () => {
  it("round-trips the canvas, leaving the panels to their own key", () => {
    const storage = memoryStorage();
    const g = boardWithImage();
    useNodePanel.setState({ panels: [panel({ id: "panel-1" })] });
    useFrames.setState({ frames: { f1: { id: "f1", canvasX: 0, canvasY: 0, canvasW: 300, canvasH: 200, label: "Frame" } } });
    useConnectionStore.setState({
      connections: [{ id: "c1", fromNodeId: "i1", fromNodeType: "konva", toNodeId: "panel-1", toNodeType: "panel" }],
    });
    useLayerOrder.setState({ topLayer: "canvas" });

    writeCanvas(g, storage);
    const raw = JSON.parse(storage.data.get(CANVAS_STORAGE_KEY)!);
    expect(raw.format).toBe(BOARD_FILE_FORMAT);
    expect(raw).not.toHaveProperty("panels");

    const restored = readSavedCanvas(storage)!;
    expect(restored.nodes.map((n) => n.attrs.id)).toEqual(["s1", "i1"]);
    expect(restored.nodes[1]).toMatchObject({ label: "cat" });
    expect(restored.nodes[1].imageUrl).toMatch(/^data:image\/png/);
    expect(restored.frames.map((f) => f.id)).toEqual(["f1"]);
    expect(restored.connections.map((c) => c.id)).toEqual(["c1"]);
    expect(restored.topLayer).toBe("canvas");
  });

  it("drops a saved wire whose panel did not come back", () => {
    const storage = memoryStorage();
    const g = boardWithImage();
    useNodePanel.setState({ panels: [panel({ id: "panel-1" })] });
    useConnectionStore.setState({
      connections: [{ id: "c1", fromNodeId: "i1", fromNodeType: "konva", toNodeId: "panel-1", toNodeType: "panel" }],
    });
    writeCanvas(g, storage);
    useNodePanel.setState({ panels: [] });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(readSavedCanvas(storage)!.connections).toEqual([]);
    warn.mockRestore();
  });

  it("over quota, saves everything but the pictures, and warns once", () => {
    const storage = memoryStorage(2000);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    writeCanvas(boardWithImage(), storage);
    const raw = JSON.parse(storage.data.get(CANVAS_STORAGE_KEY)!);
    expect(raw.nodes.map((n: { attrs: { id: string } }) => n.attrs.id)).toEqual(["s1", "i1"]);
    expect(raw.nodes[1]).not.toHaveProperty("imageUrl");
    expect(raw.nodes[1].label).toBe("cat");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/^\[board\]/);
    warn.mockRestore();
  });

  it("never throws when nothing can be saved", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => writeCanvas(boardWithImage(), memoryStorage(10))).not.toThrow();
    warn.mockRestore();
  });

  it("restores nothing, without throwing, from a missing, corrupt or newer save", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = memoryStorage();
    expect(readSavedCanvas(storage)).toBeNull();
    storage.setItem(CANVAS_STORAGE_KEY, "{not json");
    expect(readSavedCanvas(storage)).toBeNull();
    storage.setItem(CANVAS_STORAGE_KEY, JSON.stringify({ format: "other", version: 1 }));
    expect(readSavedCanvas(storage)).toBeNull();
    storage.setItem(CANVAS_STORAGE_KEY, JSON.stringify({ format: BOARD_FILE_FORMAT, version: 99 }));
    expect(readSavedCanvas(storage)).toBeNull();
    expect(warn.mock.calls.every(([m]) => String(m).startsWith("[board]"))).toBe(true);
    // Left for the next save to replace, not deleted.
    expect(storage.data.has(CANVAS_STORAGE_KEY)).toBe(true);
    warn.mockRestore();
  });
});

describe("startCanvasPersistence", () => {
  let stop: () => void = () => {};
  let storage: ReturnType<typeof memoryStorage>;
  let writes = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    storage = memoryStorage();
    writes = 0;
    const setItem = storage.setItem;
    storage.setItem = (k, v) => {
      if (k === CANVAS_STORAGE_KEY) writes++;
      setItem(k, v);
    };
    // jsdom here has no localStorage; writeCanvas reads it at save time.
    vi.stubGlobal("localStorage", storage);
  });
  afterEach(() => {
    stop();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const canvasWrites = () => writes;

  it("saves once changes settle, not on every change", () => {
    const g = new Konva.Group();
    stop = startCanvasPersistence(() => g, 150);
    // A drag: geometry published on every pointermove.
    for (let i = 0; i < 30; i++) {
      useKonvaNodes.getState().upsert({ id: "n", canvasX: i, canvasY: 0, canvasW: 10, canvasH: 10 });
      vi.advanceTimersByTime(16);
    }
    expect(canvasWrites()).toBe(0);
    vi.advanceTimersByTime(150);
    expect(canvasWrites()).toBe(1);
  });

  it("saves straight away when the page is hidden or unloaded", () => {
    const g = new Konva.Group();
    stop = startCanvasPersistence(() => g, 150);
    useFrames.getState().replaceAll({ f1: { id: "f1", canvasX: 0, canvasY: 0, canvasW: 1, canvasH: 1, label: "F" } });
    window.dispatchEvent(new Event("pagehide"));
    expect(canvasWrites()).toBe(1);
  });

  it("saves on undo history changes and on wire, frame and layer changes", () => {
    const g = new Konva.Group();
    stop = startCanvasPersistence(() => g, 150);
    const changes = [
      () => canvasHistory.commit(),
      () => useConnectionStore.getState().replaceConnections([]),
      () => useFrames.getState().replaceAll({}),
      () => useLayerOrder.setState({ topLayer: "canvas" }),
    ];
    for (const change of changes) {
      change();
      vi.advanceTimersByTime(150);
    }
    expect(canvasWrites()).toBe(changes.length);
  });

  it("ignores frame-store changes that are not the frames themselves", () => {
    const g = new Konva.Group();
    stop = startCanvasPersistence(() => g, 150);
    useFrames.getState().setDraft({ x: 0, y: 0, width: 10, height: 10 });
    useFrames.getState().selectAll();
    vi.advanceTimersByTime(150);
    expect(canvasWrites()).toBe(0);
  });

  it("writes what is pending when stopped, then stops listening", () => {
    const g = new Konva.Group();
    stop = startCanvasPersistence(() => g, 150);
    useLayerOrder.setState({ topLayer: "canvas" });
    stop();
    expect(canvasWrites()).toBe(1);
    useLayerOrder.setState({ topLayer: "dom" });
    vi.advanceTimersByTime(150);
    expect(canvasWrites()).toBe(1);
    stop = () => {};
  });
});

describe("history.subscribe", () => {
  it("fires on commit, undo and redo, and stops when unsubscribed", () => {
    const h = createHistory();
    const listener = vi.fn();
    const off = h.subscribe(listener);
    h.commit();
    h.commit();
    h.undo();
    h.redo();
    expect(listener).toHaveBeenCalledTimes(4);
    // Nothing to undo past the first entry: no change, no call.
    h.undo();
    h.undo();
    expect(listener).toHaveBeenCalledTimes(5);
    off();
    h.commit();
    expect(listener).toHaveBeenCalledTimes(5);
  });
});
