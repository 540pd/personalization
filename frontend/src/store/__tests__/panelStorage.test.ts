import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StorageValue } from "zustand/middleware";
import { deferredStorage, panelStorage, useNodePanel, type PanelInstance } from "../nodePanel.store";

type Saved = StorageValue<{ panels: PanelInstance[] }> | null;
// getItem may be sync or async by the interface; this implementation is sync.
const read = (k: string) => panelStorage.getItem(k) as Saved;

/** A localStorage that throws past `quota` characters, as a browser does. */
function quotaStorage(quota: number) {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (v.length > quota) throw new DOMException("over quota", "QuotaExceededError");
      data.set(k, v);
    },
    removeItem: (k: string) => void data.delete(k),
  };
}

const node = (id: string, image: string): PanelInstance => ({
  id, kind: "image", canvasX: 0, canvasY: 0, w: 200, h: 150,
  output: { type: "image", value: image },
  label: id, draft: { instruction: "a red kite", model: "gemini-3.1-flash-image" },
});

const value = (panels: PanelInstance[]) => ({ state: { panels }, version: 0 });

describe("panelStorage", () => {
  let store: ReturnType<typeof quotaStorage>;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    store = quotaStorage(10_000);
    // The default test environment is node, where there is no window and the
    // storage would return before doing anything -- so every assertion below
    // would pass without testing a thing.
    vi.stubGlobal("window", { localStorage: store });
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    warn.mockRestore();
  });

  it("saves and reads back a board that fits", () => {
    panelStorage.setItem("k", value([node("a", "data:small")]));
    expect(read("k")).toEqual(value([node("a", "data:small")]));
  });

  // The bug: a throw here escaped into the caller and aborted it.
  it("never throws when the board is over quota", () => {
    const big = "x".repeat(20_000);
    expect(() => panelStorage.setItem("k", value([node("a", big)]))).not.toThrow();
    expect(store.data.has("k")).toBe(true);
  });

  it("keeps positions and inputs but drops images when they do not fit", () => {
    panelStorage.setItem("k", value([node("a", "x".repeat(20_000))]));

    const saved = read("k");
    const [p] = saved!.state.panels;
    expect(p.id).toBe("a");
    expect(p.draft).toEqual({ instruction: "a red kite", model: "gemini-3.1-flash-image" });
    expect(p.output).toBeUndefined();
    // No assertion on the warning: it is once per session by design, and an
    // earlier test in this file has already spent it.
  });

  it("gives up quietly when even the lean save does not fit", () => {
    store = quotaStorage(10);
    vi.stubGlobal("window", { localStorage: store });

    expect(() => panelStorage.setItem("k", value([node("a", "x".repeat(200))]))).not.toThrow();
    expect(store.data.has("k")).toBe(false);
  });

  it("reads a corrupt entry as nothing saved, rather than throwing", () => {
    store.data.set("k", "{not json");
    expect(read("k")).toBeNull();
  });
});

// #155: a Frame drag set positions on every pointermove, and each set wrote
// the whole board -- images included -- to localStorage.
describe("deferredStorage", () => {
  const memory = () => {
    const data = new Map<string, unknown>();
    return {
      data,
      writes: 0,
      getItem: (k: string) => (data.get(k) ?? null) as Saved,
      setItem(k: string, v: unknown) { this.writes++; data.set(k, v); },
      removeItem: (k: string) => void data.delete(k),
    };
  };

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("writes once, the latest value, after changes pause", () => {
    const inner = memory();
    const s = deferredStorage(inner as never, 150);
    for (let i = 0; i < 50; i++) {
      s.setItem("k", value([{ ...node("a", "img"), canvasX: i }]));
      vi.advanceTimersByTime(10);
    }
    expect(inner.writes).toBe(0);
    vi.advanceTimersByTime(150);
    expect(inner.writes).toBe(1);
    expect((inner.getItem("k") as Saved)!.state.panels[0].canvasX).toBe(49);
  });

  it("a read sees a write that is still waiting", () => {
    const inner = memory();
    const s = deferredStorage(inner as never, 150);
    s.setItem("k", value([node("a", "img")]));
    expect((s.getItem("k") as Saved)!.state.panels[0].id).toBe("a");
  });

  it("a remove drops a waiting write rather than resurrecting it", () => {
    const inner = memory();
    const s = deferredStorage(inner as never, 150);
    s.setItem("k", value([node("a", "img")]));
    s.removeItem("k");
    vi.advanceTimersByTime(500);
    expect(inner.data.has("k")).toBe(false);
  });
});

describe("setCanvasPositions", () => {
  it("moves several panels in one write, and leaves the rest alone", () => {
    useNodePanel.setState({ panels: [node("a", "x"), node("b", "x"), node("c", "x")] });
    let notified = 0;
    const off = useNodePanel.subscribe(() => notified++);
    useNodePanel.getState().setCanvasPositions({ a: { x: 10, y: 20 }, c: { x: 30, y: 40 } });
    off();
    const [a, b, c] = useNodePanel.getState().panels;
    expect([a.canvasX, a.canvasY, c.canvasX, c.canvasY]).toEqual([10, 20, 30, 40]);
    expect([b.canvasX, b.canvasY]).toEqual([0, 0]);
    expect(notified).toBe(1);
  });
});
