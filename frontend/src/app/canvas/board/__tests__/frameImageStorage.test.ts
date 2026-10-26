import { afterEach, describe, expect, it, vi } from "vitest";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { saveFrameImagePositions } from "../frameImageStorage";

const frame = { id: "frame-1", canvasX: 20, canvasY: 40, canvasW: 500, canvasH: 500, label: "Frame" };
const image = { id: "uploaded-1", canvasX: 90, canvasY: 110, canvasW: 100, canvasH: 80,
  label: "photo", imageUrl: "data:image/png;base64,AAA" };

const saved = new Map<string, string>();
const storage = {
  setItem: (key: string, value: string) => { saved.set(key, value); },
  getItem: (key: string) => saved.get(key) ?? null,
};

const positions = () => JSON.parse(saved.get("gcos-frame-images") ?? "[]") as Array<typeof image>;

describe("Frame-contained uploaded image manifest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    saved.clear();
    useKonvaNodes.setState({ nodes: {} });
  });

  it("records geometry but not large image URLs, and excludes images outside frames", () => {
    vi.stubGlobal("window", { localStorage: storage });
    useKonvaNodes.getState().upsert(image);
    useKonvaNodes.getState().upsert({ ...image, id: "outside", canvasX: 1000 });
    saveFrameImagePositions({ [frame.id]: frame });
    expect(positions()).toEqual([{ id: image.id, canvasX: image.canvasX, canvasY: image.canvasY,
      canvasW: image.canvasW, canvasH: image.canvasH, label: image.label }]);
  });

  it("updates the position at dragend and clears entries when a Frame is deleted", () => {
    vi.stubGlobal("window", { localStorage: storage });
    useKonvaNodes.getState().upsert(image);
    saveFrameImagePositions({ [frame.id]: frame });
    useKonvaNodes.getState().upsert({ ...image, canvasX: 180 });
    saveFrameImagePositions({ [frame.id]: { ...frame, canvasX: 110 } });
    expect(positions()[0].canvasX).toBe(180);
    saveFrameImagePositions({});
    expect(positions()).toEqual([]);
  });
});
