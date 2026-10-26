import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NODE_KINDS } from "@/app/canvas/components/NodePanel/kinds";
import { SAVE_DELAY_MS, isKnownKind, useNodePanel, type NodeKind, type PanelInstance } from "../nodePanel.store";

// #186: a saved node of a kind this build does not know used to crash the
// whole board. It is now set aside on load and written back on save.

const KEY = "gcos-node-panels";

const node = (id: string, kind: string, extra: Partial<PanelInstance> = {}) => ({
  id, kind, canvasX: 0, canvasY: 0, w: 200, h: 150,
  isActive: false, isPanelOpen: false, label: id, ...extra,
}) as PanelInstance;

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("unknown node kinds", () => {
  let store: ReturnType<typeof memoryStorage>;
  let warn: ReturnType<typeof vi.spyOn>;

  const seed = (panels: unknown[]) =>
    store.data.set(KEY, JSON.stringify({ state: { panels }, version: 0 }));
  const saved = () => JSON.parse(store.data.get(KEY)!).state.panels as PanelInstance[];

  beforeEach(async () => {
    store = memoryStorage();
    vi.stubGlobal("window", { localStorage: store });
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    useNodePanel.setState({ panels: [], parked: [], selectedIds: [], openId: null });
    // That reset queues a deferred save; a read flushes it. Flush it now, or
    // the first rehydrate below writes the empty board over the seed.
    await useNodePanel.persist.rehydrate();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    warn.mockRestore();
    vi.useRealTimers();
  });

  it("every known kind has a spec, so nothing known can still crash the board", () => {
    for (const kind of Object.keys(NODE_KINDS)) expect(isKnownKind(kind)).toBe(true);
    for (const kind of ["image", "video", "instruction", "compose"] satisfies NodeKind[]) {
      expect(NODE_KINDS[kind]).toBeDefined();
    }
    expect(isKnownKind("mask")).toBe(false);
    expect(isKnownKind("toString")).toBe(false);
    expect(isKnownKind(undefined)).toBe(false);
  });

  it("loads the known nodes and sets the unknown ones aside", async () => {
    seed([node("panel-1", "image"), node("panel-2", "mask"), node("panel-3", "instruction")]);
    await useNodePanel.persist.rehydrate();

    const { panels, parked } = useNodePanel.getState();
    expect(panels.map((p) => p.id)).toEqual(["panel-1", "panel-3"]);
    expect(parked.map((p) => p.id)).toEqual(["panel-2"]);
  });

  it("warns once, naming the unknown kinds and how many nodes", async () => {
    seed([node("panel-1", "mask"), node("panel-2", "mask"), node("panel-3", "sticky")]);
    await useNodePanel.persist.rehydrate();

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain("3 saved node(s)");
    expect(message).toContain('"mask"');
    expect(message).toContain('"sticky"');
  });

  it("does not warn when every kind is known", async () => {
    seed([node("panel-1", "image"), node("panel-2", "compose")]);
    await useNodePanel.persist.rehydrate();
    expect(warn).not.toHaveBeenCalled();
  });

  it("Ctrl+A selects only the known nodes", async () => {
    seed([node("panel-1", "image"), node("panel-2", "mask")]);
    await useNodePanel.persist.rehydrate();

    useNodePanel.getState().selectAll();
    const { panels, parked, selectedIds } = useNodePanel.getState();
    expect(selectedIds).toEqual(panels.map((p) => p.id));
    expect(selectedIds).not.toContain(parked[0].id);
  });

  it("keeps the unknown node's data unchanged across a save", async () => {
    const unknown = node("panel-2", "mask", {
      canvasX: 40, canvasY: 70, label: "my mask",
      output: { type: "image", value: "data:x" }, draft: { model: "m", instruction: "keep me" },
    });
    seed([node("panel-1", "image"), unknown]);
    await useNodePanel.persist.rehydrate();

    vi.useFakeTimers();
    useNodePanel.getState().setCanvasPos("panel-1", 500, 500);
    vi.advanceTimersByTime(SAVE_DELAY_MS + 1);

    const after = saved();
    expect(after.find((p) => p.id === "panel-1")?.canvasX).toBe(500);
    expect(after.find((p) => p.id === "panel-2")).toEqual(unknown);
  });

  it("a build that knows the kind gets it back", async () => {
    seed([node("panel-1", "image"), node("panel-2", "mask")]);
    await useNodePanel.persist.rehydrate();

    vi.useFakeTimers();
    useNodePanel.getState().setCanvasPos("panel-1", 10, 10);
    vi.advanceTimersByTime(SAVE_DELAY_MS + 1);
    vi.useRealTimers();

    // Stand-in for the newer build: the same node, now of a kind we know.
    seed(saved().map((p) => (p.id === "panel-2" ? { ...p, kind: "instruction" } : p)));
    await useNodePanel.persist.rehydrate();
    expect(useNodePanel.getState().panels.map((p) => p.id).sort()).toEqual(["panel-1", "panel-2"]);
    expect(useNodePanel.getState().parked).toEqual([]);
  });

  it("a new node never takes the id of a set-aside one", async () => {
    seed([node("panel-1", "image"), node("panel-9", "mask")]);
    await useNodePanel.persist.rehydrate();

    useNodePanel.getState().addPanel(0, 0);
    const ids = useNodePanel.getState().panels.map((p) => p.id);
    expect(ids).not.toContain("panel-9");
    expect(Number(ids[ids.length - 1].replace("panel-", ""))).toBeGreaterThan(9);
  });
});
