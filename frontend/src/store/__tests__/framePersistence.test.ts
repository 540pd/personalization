import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/canvas/board/frameImageStorage", () => ({ saveFrameImagePositions: vi.fn() }));

const frame = { id: "frame-1", canvasX: 75, canvasY: 100, canvasW: 300, canvasH: 200, label: "Frame" };

async function store() {
  vi.resetModules();
  return (await import("../frame.store")).useFrames;
}

describe("Frame reload persistence", () => {
  let saved: Map<string, string>;
  let storage: { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void };
  beforeEach(() => {
    saved = new Map();
    storage = {
      getItem: (key) => saved.get(key) ?? null,
      setItem: (key, value) => { saved.set(key, value); },
    };
    vi.stubGlobal("window", { localStorage: storage });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("restores geometry after a simulated module reload, including the final dragend position", async () => {
    const frames = await store();
    frames.getState().upsert(frame);
    const initial = storage.getItem("gcos-frames");
    frames.getState().setDrag(frame.id, { dx: 50, dy: 25 });
    frames.getState().setResize(frame.id, { canvasX: 125, canvasY: 125, canvasW: 300, canvasH: 200 });
    expect(storage.getItem("gcos-frames")).toBe(initial); // no writes per drag/resize frame
    frames.getState().upsert({ ...frame, canvasX: 125, canvasY: 125 });

    const restored = await store();
    expect(restored.getState().frames[frame.id]).toEqual({ ...frame, canvasX: 125, canvasY: 125 });
    expect(restored.getState().drag).toEqual({});
    expect(restored.getState().resize).toEqual({});
    expect(restored.getState().selectedIds).toEqual([]);
  });

  it("does not persist draft or selection and persists undo and deletion", async () => {
    const frames = await store();
    frames.getState().upsert(frame);
    frames.getState().select(frame.id);
    frames.getState().setDraft({ x: 1, y: 2, width: 3, height: 4 });
    expect(JSON.parse(storage.getItem("gcos-frames")!)).toEqual({ [frame.id]: frame });
    frames.getState().replaceAll({ [frame.id]: { ...frame, canvasX: 10 } });
    expect((await store()).getState().frames[frame.id].canvasX).toBe(10);
    frames.getState().remove(frame.id);
    expect((await store()).getState().frames).toEqual({});
  });

  it("does not crash when stored data is malformed or storage is unavailable", async () => {
    storage.setItem("gcos-frames", "{broken");
    expect((await store()).getState().frames).toEqual({});
    const spy = vi.spyOn(storage, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError"); });
    const frames = await store();
    expect(() => frames.getState().upsert(frame)).not.toThrow();
    expect(frames.getState().frames[frame.id]).toEqual(frame);
    spy.mockRestore();
  });
});
