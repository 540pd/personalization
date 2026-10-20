import { describe, it, expect, beforeEach } from "vitest";
import Konva from "konva";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { nodeEntry } from "../nodeEntry";
import { nodeBox } from "../geometry";

beforeEach(() => {
  useKonvaNodes.setState({ nodes: {} });
});

describe("nodeEntry", () => {
  it("is the class and a copy of the attrs by default", () => {
    const n = new Konva.Rect({ id: "a", x: 1, y: 2 });
    const entry = nodeEntry(n);
    expect(entry.className).toBe("Rect");
    expect(entry.attrs).toEqual(n.getAttrs());
    expect(entry.attrs).not.toBe(n.getAttrs());
  });

  it("takes the attrs it is given instead", () => {
    const n = new Konva.Rect({ id: "a", x: 1 });
    expect(nodeEntry(n, { only: true }).attrs).toEqual({ only: true });
  });

  it("carries imageUrl and label from konvaNodes, and leaves out what is absent", () => {
    useKonvaNodes.getState().upsert({
      id: "a", canvasX: 0, canvasY: 0, canvasW: 1, canvasH: 1, imageUrl: "data:x", label: "cat",
    });
    expect(nodeEntry(new Konva.Rect({ id: "a" }))).toMatchObject({ imageUrl: "data:x", label: "cat" });
    const bare = nodeEntry(new Konva.Rect({ id: "b" }));
    expect("imageUrl" in bare).toBe(false);
    expect("label" in bare).toBe(false);
  });
});

describe("nodeBox", () => {
  it("folds the scale into the size", () => {
    const n = new Konva.Rect({ x: 3, y: 4, width: 10, height: 20, scaleX: 2, scaleY: 0.5 });
    expect(nodeBox(n)).toEqual({ canvasX: 3, canvasY: 4, canvasW: 20, canvasH: 10 });
  });
});
