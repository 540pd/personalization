import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StorageValue } from "zustand/middleware";
import { panelStorage, type PanelInstance } from "../nodePanel.store";

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
  isActive: false, isPanelOpen: false,
  output: { type: "image", value: image },
  label: id, instruction: "a red kite", model: "gemini-3.1-flash-image",
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
    expect(p.instruction).toBe("a red kite");
    expect(p.model).toBe("gemini-3.1-flash-image");
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
