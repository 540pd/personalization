import { describe, it, expect, beforeEach } from "vitest";
import {
  dropIntoLayout, dropTarget, joinLayout, layoutFrameAt, placeInto, sideOf, trackLayoutDrag,
} from "../autoLayoutDrop";
import { useFrames, type FrameRecord } from "@/store/frame.store";
import { useKonvaNodes, type KonvaNodeRecord } from "@/store/konvaNodes.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { useLayoutDrop } from "@/store/layoutDrop.store";

describe("sideOf", () => {
  const b = { x: 0, y: 0, w: 200, h: 100 };
  it("is the side the pointer is nearest, split corner to corner", () => {
    expect(sideOf(b, { x: 10, y: 50 })).toBe("left");
    expect(sideOf(b, { x: 190, y: 50 })).toBe("right");
    expect(sideOf(b, { x: 100, y: 5 })).toBe("top");
    expect(sideOf(b, { x: 100, y: 95 })).toBe("bottom");
  });
  it("by share of half the size, so a wide box still has a top and bottom", () => {
    // 40 right of centre is 40% of the half-width; 30 below is 60% of the half-height.
    expect(sideOf(b, { x: 140, y: 80 })).toBe("bottom");
  });
});

describe("placeInto", () => {
  it("adds a new column, or into a column's stack", () => {
    expect(placeInto([["a"], ["b"]], "n", { kind: "column", index: 1 })).toEqual([["a"], ["n"], ["b"]]);
    expect(placeInto([["a"], ["b", "c"]], "n", { kind: "stack", column: 1, index: 1 })).toEqual([["a"], ["b", "n", "c"]]);
  });
});

const node = (id: string, x: number, y = 16, w = 90, h = 60): KonvaNodeRecord =>
  ({ id, canvasX: x, canvasY: y, canvasW: w, canvasH: h });
const frame = (id: string, x: number, columns?: string[][]): FrameRecord => ({
  id, label: id, canvasX: x, canvasY: 0, canvasW: 334, canvasH: 112,
  ...(columns ? { layout: { columns } } : {}),
});
const cols = (id: string) => useFrames.getState().frames[id].layout?.columns;

describe("dropping into a Frame with auto layout", () => {
  // As #225 lays it out: a at 16, b at 122, c at 228 (taller).
  beforeEach(() => {
    useFrames.setState({
      frames: { f: frame("f", 0, [["a"], ["b"], ["c"]]), g: frame("g", 1000, [["d"]]), plain: frame("plain", 2000) },
    });
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

  it("on an item's right side: a new column after it, with an upright line beside its column", () => {
    const t = dropTarget({ x: 0, y: 0, w: 334, h: 112 }, [["a"], ["c"]], { x: 100, y: 46 });
    expect(t.placement).toEqual({ kind: "column", index: 1 });
    expect(t.line).toEqual({ x: 16 + 90 + 8, y: 16, length: 60, vertical: true });
  });

  it("on an item's bottom: into its column below it, with a flat line under it", () => {
    const t = dropTarget({ x: 0, y: 0, w: 334, h: 112 }, [["a"], ["c"]], { x: 61, y: 72 });
    expect(t.placement).toEqual({ kind: "stack", column: 0, index: 1 });
    expect(t.line).toEqual({ x: 16, y: 16 + 60 + 8, length: 90, vertical: false });
  });

  it("on a named item's top: the flat line is above its name band (#235)", () => {
    useKonvaNodes.getState().upsert({ ...useKonvaNodes.getState().nodes.c, label: "hero", canvasY: 60 });
    const t = dropTarget({ x: 0, y: 0, w: 334, h: 200 }, [["a"], ["c"]], { x: 273, y: 64 });
    expect(t.placement).toEqual({ kind: "stack", column: 1, index: 0 });
    expect(t.line).toMatchObject({ y: 60 - 24 - 8, vertical: false });
  });

  it("over a gap: a new column between", () => {
    const t = dropTarget({ x: 0, y: 0, w: 334, h: 112 }, [["a"], ["c"]], { x: 115, y: 100 });
    expect(t.placement).toEqual({ kind: "column", index: 1 });
  });

  it("dropped on the next item's right side, it moves after it", () => {
    expect(dropIntoLayout("a", { x: 200, y: 46 })).toBe(true);
    expect(cols("f")).toEqual([["b"], ["a"], ["c"]]);
  });

  it("dropped on another item's bottom, it stacks under it", () => {
    expect(dropIntoLayout("a", { x: 167, y: 72 })).toBe(true);
    expect(cols("f")).toEqual([["b", "a"], ["c"]]);
  });

  it("dropped on another item's top, it stacks above it", () => {
    expect(dropIntoLayout("c", { x: 167, y: 20 })).toBe(true);
    expect(cols("f")).toEqual([["a"], ["c", "b"]]);
  });

  it("dropped back where it was, nothing changes", () => {
    expect(dropIntoLayout("b", { x: 115, y: 100 })).toBe(false);
    expect(cols("f")).toEqual([["a"], ["b"], ["c"]]);
  });

  describe("in a stack, dropped back where it was (#349)", () => {
    // a stacked over b in the first column: a at 16, b at 16 + 60 + 16 = 92.
    beforeEach(() => {
      useFrames.getState().upsert({ ...frame("f", 0, [["a", "b"], ["c"]]), canvasH: 168 });
      useKonvaNodes.getState().upsert(node("a", 16));
      useKonvaNodes.getState().upsert(node("b", 16, 92));
      useKonvaNodes.getState().upsert(node("c", 122));
    });

    it("the bottom one stays in the stack", () => {
      // Dragged a few pixels: the pointer is still in b's place.
      useKonvaNodes.getState().upsert(node("b", 22, 97));
      expect(dropIntoLayout("b", { x: 70, y: 120 })).toBe(false);
      expect(cols("f")).toEqual([["a", "b"], ["c"]]);
    });

    it("the top one stays in the stack", () => {
      useKonvaNodes.getState().upsert(node("a", 22, 21));
      expect(dropIntoLayout("a", { x: 70, y: 40 })).toBe(false);
      expect(cols("f")).toEqual([["a", "b"], ["c"]]);
    });

    it("shows no line while over its own place", () => {
      trackLayoutDrag("b", { x: 70, y: 120 });
      expect(useLayoutDrop.getState().line).toBeNull();
    });
  });

  it("dropped outside its Frame, it leaves, and its column goes", () => {
    useKonvaNodes.getState().upsert(node("b", 560, 570));
    expect(dropIntoLayout("b", { x: 600, y: 600 })).toBe(true);
    expect(cols("f")).toEqual([["a"], ["c"]]);
  });

  it("dropped in another Frame, it moves there", () => {
    expect(dropIntoLayout("a", { x: 1300, y: 40 })).toBe(true);
    expect(cols("f")).toEqual([["b"], ["c"]]);
    expect(cols("g")).toEqual([["d"], ["a"]]);
  });

  it("an outsider dropped on an item's left side joins before it", () => {
    expect(dropIntoLayout("e", { x: 20, y: 46 })).toBe(true);
    expect(cols("f")).toEqual([["e"], ["a"], ["b"], ["c"]]);
  });

  describe("with the pointer off the Frame but the item over it (#348)", () => {
    // e, 90 wide, dropped half over f's left edge: x -60 to 30, the pointer at -40.
    beforeEach(() => useKonvaNodes.getState().upsert(node("e", -60, 16)));

    it("it joins, placed by the part over the Frame", () => {
      expect(dropIntoLayout("e", { x: -40, y: 46 })).toBe(true);
      expect(cols("f")).toEqual([["e"], ["a"], ["b"], ["c"]]);
    });

    it("the line shows while it is over", () => {
      trackLayoutDrag("e", { x: -40, y: 46 });
      expect(useLayoutDrop.getState().line).toMatchObject({ vertical: true });
    });

    it("one of its own, dragged half out, stays in its layout", () => {
      useKonvaNodes.getState().upsert(node("c", 300, 16, 90, 80));
      expect(dropIntoLayout("c", { x: 360, y: 56 })).toBe(false);
      expect(cols("f")).toEqual([["a"], ["b"], ["c"]]);
    });

    it("over two Frames, it goes to the one it covers more of", () => {
      // 20 over f, 34 over g; the middle of that 34 is on d's left side.
      useKonvaNodes.getState().upsert(node("e", 314, 16, 720, 60));
      expect(dropIntoLayout("e", { x: 660, y: 46 })).toBe(true);
      expect(cols("g")).toEqual([["e"], ["d"]]);
      expect(cols("f")).toEqual([["a"], ["b"], ["c"]]);
    });

    it("clear of every Frame, nothing joins", () => {
      useKonvaNodes.getState().upsert(node("e", 600, 300));
      expect(dropIntoLayout("e", { x: 640, y: 330 })).toBe(false);
      expect(cols("f")).toEqual([["a"], ["b"], ["c"]]);
    });
  });

  it("taken out of a stack and put beside another, the stack shrinks", () => {
    useFrames.getState().upsert({ ...useFrames.getState().frames.f, layout: { columns: [["a", "b"], ["c"]] } });
    useKonvaNodes.getState().upsert(node("b", 16, 92));
    dropIntoLayout("b", { x: 310, y: 56 });
    expect(cols("f")).toEqual([["a"], ["c"], ["b"]]);
  });

  it("shows the line while over the Frame, and hides it off it and on the drop", () => {
    trackLayoutDrag("a", { x: 200, y: 46 });
    expect(useLayoutDrop.getState().line).toMatchObject({ vertical: true });
    trackLayoutDrag("a", { x: 167, y: 72 });
    expect(useLayoutDrop.getState().line).toMatchObject({ vertical: false });
    useKonvaNodes.getState().upsert(node("a", 560, 570));
    trackLayoutDrag("a", { x: 600, y: 600 });
    expect(useLayoutDrop.getState().line).toBeNull();
    trackLayoutDrag("a", { x: 200, y: 46 });
    dropIntoLayout("a", { x: 200, y: 46 });
    expect(useLayoutDrop.getState().line).toBeNull();
  });
});

describe("joinLayout", () => {
  beforeEach(() => {
    useFrames.setState({ frames: { f: frame("f", 0, [["a"]]) } });
    useKonvaNodes.setState({ nodes: { a: node("a", 16), n: node("n", 200, 20, 50, 40), half: node("half", 300, 20, 100, 40) } });
  });

  it("adds an item drawn fully inside as a column at the end", () => {
    expect(joinLayout("n")).toBe(true);
    expect(cols("f")).toEqual([["a"], ["n"]]);
  });

  it("not one only partly inside", () => {
    expect(joinLayout("half")).toBe(false);
  });

  it("with a drop point, the Frame under it decides", () => {
    expect(joinLayout("half", { x: 320, y: 40 })).toBe(true);
    expect(cols("f")).toEqual([["a"], ["half"]]);
  });

  it("not twice", () => {
    expect(joinLayout("a")).toBe(false);
  });
});
