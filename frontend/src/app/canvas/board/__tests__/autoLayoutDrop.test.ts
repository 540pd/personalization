import { describe, it, expect, beforeEach } from "vitest";
import { dropIntoLayout, joinLayout, layoutFrameAt, slotIndex, slotLine, trackLayoutDrag } from "../autoLayoutDrop";
import type { ChildBox } from "../autoLayout";
import { useFrames, type FrameRecord } from "@/store/frame.store";
import { useKonvaNodes, type KonvaNodeRecord } from "@/store/konvaNodes.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { useLayoutDrop } from "@/store/layoutDrop.store";

const box = (id: string, x: number, w = 90, h = 60): ChildBox => ({ id, x, y: 16, w, h });
// A row as #225 lays it out: 16 padding, 16 gap.
const row = [box("a", 16), box("b", 122), box("c", 228, 90, 80)];

describe("slotIndex", () => {
  it("is after every child whose middle is left of the pointer", () => {
    expect(slotIndex(row, { x: 10, y: 0 })).toBe(0);
    expect(slotIndex(row, { x: 70, y: 0 })).toBe(1);
    expect(slotIndex(row, { x: 160, y: 0 })).toBe(1);
    expect(slotIndex(row, { x: 170, y: 0 })).toBe(2);
    expect(slotIndex(row, { x: 400, y: 0 })).toBe(3);
  });
});

describe("slotLine", () => {
  const frame = { x: 0, y: 0, w: 334, h: 112 };
  it("sits in the padding before the first and after the last", () => {
    expect(slotLine(frame, row, 0)).toEqual({ x: 8, y: 16, h: 80 });
    expect(slotLine(frame, row, 3)).toEqual({ x: 326, y: 16, h: 80 });
  });
  it("sits in the middle of a gap", () => {
    expect(slotLine(frame, row, 1)).toEqual({ x: 114, y: 16, h: 80 });
  });
  it("with no other children, spans the inside of the Frame", () => {
    expect(slotLine(frame, [], 0)).toEqual({ x: 8, y: 16, h: 80 });
  });
});

const node = (id: string, x: number, y = 16, w = 90, h = 60): KonvaNodeRecord =>
  ({ id, canvasX: x, canvasY: y, canvasW: w, canvasH: h });
const frame = (id: string, x: number, children?: string[]): FrameRecord => ({
  id, label: id, canvasX: x, canvasY: 0, canvasW: 334, canvasH: 112,
  ...(children ? { layout: { children } } : {}),
});
const kids = (id: string) => useFrames.getState().frames[id].layout?.children;

describe("dropping into rows", () => {
  beforeEach(() => {
    useFrames.setState({ frames: { f: frame("f", 0, ["a", "b", "c"]), g: frame("g", 1000, ["d"]), plain: frame("plain", 2000) } });
    useKonvaNodes.setState({
      nodes: { a: node("a", 16), b: node("b", 122), c: node("c", 228, 16, 90, 80), d: node("d", 1016), e: node("e", 600, 300) },
    });
    useNodePanel.setState({ panels: [] });
    useLayoutDrop.setState({ line: null });
  });

  it("finds the Frame with auto layout under the pointer, not one without", () => {
    expect(layoutFrameAt({ x: 50, y: 50 })?.id).toBe("f");
    expect(layoutFrameAt({ x: 2050, y: 50 })).toBeNull();
  });

  it("reorders: the first child dropped past the second's middle goes after it", () => {
    expect(dropIntoLayout("a", { x: 180, y: 40 })).toBe(true);
    expect(kids("f")).toEqual(["b", "a", "c"]);
  });

  it("dropped back in its own slot, nothing changes", () => {
    expect(dropIntoLayout("b", { x: 160, y: 40 })).toBe(false);
    expect(kids("f")).toEqual(["a", "b", "c"]);
  });

  it("dropped outside its Frame, it leaves the row", () => {
    expect(dropIntoLayout("b", { x: 600, y: 600 })).toBe(true);
    expect(kids("f")).toEqual(["a", "c"]);
  });

  it("dropped in another row, it moves there", () => {
    expect(dropIntoLayout("a", { x: 1300, y: 40 })).toBe(true);
    expect(kids("f")).toEqual(["b", "c"]);
    expect(kids("g")).toEqual(["d", "a"]);
  });

  it("an outsider dropped in a row joins at the slot", () => {
    expect(dropIntoLayout("e", { x: 10, y: 40 })).toBe(true);
    expect(kids("f")).toEqual(["e", "a", "b", "c"]);
  });

  it("keeps a deleted child's id in its place", () => {
    useKonvaNodes.getState().remove("b");
    dropIntoLayout("e", { x: 300, y: 40 });
    expect(kids("f")).toEqual(["a", "b", "c", "e"]);
  });

  it("shows the line while over a row, and hides it off one and on the drop", () => {
    trackLayoutDrag("a", { x: 180, y: 40 });
    // Without a, the others are b and c: the slot between them.
    expect(useLayoutDrop.getState().line).toEqual({ x: (122 + 90 + 228) / 2, y: 16, h: 80 });
    trackLayoutDrag("a", { x: 600, y: 600 });
    expect(useLayoutDrop.getState().line).toBeNull();
    trackLayoutDrag("a", { x: 180, y: 40 });
    dropIntoLayout("a", { x: 180, y: 40 });
    expect(useLayoutDrop.getState().line).toBeNull();
  });
});

describe("joinLayout", () => {
  beforeEach(() => {
    useFrames.setState({ frames: { f: frame("f", 0, ["a"]) } });
    useKonvaNodes.setState({ nodes: { a: node("a", 16), n: node("n", 200, 20, 50, 40), half: node("half", 300, 20, 100, 40) } });
  });

  it("adds an item drawn fully inside at the end", () => {
    expect(joinLayout("n")).toBe(true);
    expect(kids("f")).toEqual(["a", "n"]);
  });

  it("not one only partly inside", () => {
    expect(joinLayout("half")).toBe(false);
  });

  it("with a drop point, the Frame under it decides", () => {
    expect(joinLayout("half", { x: 320, y: 40 })).toBe(true);
    expect(kids("f")).toEqual(["a", "half"]);
  });

  it("not twice", () => {
    expect(joinLayout("a")).toBe(false);
  });
});
