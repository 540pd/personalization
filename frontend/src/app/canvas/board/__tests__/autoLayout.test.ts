import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  applyAutoLayout, canAutoLayout, finishRearrange, layoutColumns, orderChildren, packColumns, packToShape,
  readingOrder, rearrangeLive, reflowAutoLayouts, removeAutoLayout, startRearrange, withoutIds,
  type ChildBox,
} from "../autoLayout";
import { useFrames, type FrameRecord } from "@/store/frame.store";
import { useKonvaNodes, type KonvaNodeRecord } from "@/store/konvaNodes.store";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { canvasHistory } from "@/lib/canvas/history";
import { boardStage } from "@/lib/canvas/boardStage";

const box = (id: string, x: number, y: number, w: number, h: number): ChildBox => ({ id, x, y, w, h });

describe("orderChildren", () => {
  it("goes left to right, ties by top edge", () => {
    const order = orderChildren([box("c", 300, 0, 10, 10), box("a", 10, 50, 10, 10), box("b", 10, 5, 10, 10)]);
    expect(order.map((b) => b.id)).toEqual(["b", "a", "c"]);
  });
});

describe("layoutColumns", () => {
  it("one item per column is a row: pads 16, gaps 16, aligns tops, hugs", () => {
    const g = layoutColumns({ x: 100, y: 200 }, [[box("a", 0, 0, 90, 60)], [box("b", 0, 0, 90, 80)]]);
    expect(g.positions).toEqual({ a: { x: 116, y: 216 }, b: { x: 222, y: 216 } });
    expect(g.w).toBe(16 + 90 + 16 + 90 + 16);
    expect(g.h).toBe(16 + 80 + 16);
  });

  it("stacks a column top to bottom, aligned left, as wide as its widest", () => {
    const g = layoutColumns({ x: 0, y: 0 }, [
      [box("a", 0, 0, 90, 60)],
      [box("b", 0, 0, 120, 60), box("c", 0, 0, 70, 50)],
      [box("d", 0, 0, 90, 80)],
    ]);
    expect(g.positions).toEqual({
      a: { x: 16, y: 16 },
      b: { x: 122, y: 16 }, c: { x: 122, y: 16 + 60 + 16 },
      d: { x: 122 + 120 + 16, y: 16 },
    });
    expect(g.w).toBe(16 + 90 + 16 + 120 + 16 + 90 + 16);
    expect(g.h).toBe(16 + 60 + 16 + 50 + 16);
  });

  it("an empty column takes no space", () => {
    const g = layoutColumns({ x: 0, y: 0 }, [[box("a", 0, 0, 90, 60)], [], [box("b", 0, 0, 90, 60)]]);
    expect(g.positions.b).toEqual({ x: 16 + 90 + 16, y: 16 });
  });
});

describe("packToShape (#232)", () => {
  const same = (n: number, w = 180, h = 120) => Array.from({ length: n }, (_, i) => box(`i${i + 1}`, 0, 0, w, h));
  const counts = (cols: string[][]) => cols.map((c) => c.length);

  it("a short, wide shape gives a row; a tall, narrow one a column", () => {
    expect(counts(packToShape(same(6), { w: 2000, h: 160 }))).toEqual([1, 1, 1, 1, 1, 1]);
    expect(counts(packToShape(same(6), { w: 220, h: 1200 }))).toEqual([6]);
  });

  it("one in between gives the compact rectangle nearest its shape, in reading order", () => {
    // Three columns of 180 and two rows of 120: 604 × 288.
    expect(packToShape(same(6), { w: 600, h: 290 })).toEqual([["i1", "i4"], ["i2", "i5"], ["i3", "i6"]]);
    expect(counts(packToShape(same(6), { w: 400, h: 430 }))).toEqual([3, 3]);
  });

  it("each item goes into the shortest column so far", () => {
    const boxes = [box("tall", 0, 0, 180, 260), box("a", 0, 0, 180, 120), box("b", 0, 0, 180, 120), box("t", 0, 0, 180, 80)];
    expect(packColumns(boxes, 2).columns).toEqual([["tall"], ["a", "b", "t"]]);
  });

  it("no boxes, no columns", () => {
    expect(packToShape([], { w: 100, h: 100 })).toEqual([]);
  });
});

describe("readingOrder", () => {
  it("top to bottom, then left to right along a row", () => {
    const order = readingOrder([box("c", 0, 100, 10, 10), box("b", 50, 0, 10, 10), box("a", 0, 0, 10, 10)]);
    expect(order.map((b) => b.id)).toEqual(["a", "b", "c"]);
  });
});

describe("withoutIds", () => {
  it("takes the ids out, and the columns they empty", () => {
    expect(withoutIds([["a"], ["b", "c"], ["d"]], new Set(["a", "c"]))).toEqual([["b"], ["d"]]);
  });
});

const node = (id: string, x: number, y: number, w = 90, h = 60): KonvaNodeRecord =>
  ({ id, canvasX: x, canvasY: y, canvasW: w, canvasH: h });
// Panels are centre-anchored: canvasY is the middle.
const panel = (id: string, x: number, top: number, w = 100, h = 80): PanelInstance =>
  ({ id, kind: "image", canvasX: x, canvasY: top + h / 2, w, h, isActive: false, isPanelOpen: false }) as PanelInstance;
const frame = (over: Partial<FrameRecord> = {}): FrameRecord =>
  ({ id: "f", label: "Frame", canvasX: 0, canvasY: 0, canvasW: 600, canvasH: 400, ...over });

const f = () => useFrames.getState().frames.f;
const n = (id: string) => useKonvaNodes.getState().nodes[id];
const p = (id: string) => useNodePanel.getState().panels.find((q) => q.id === id)!;

describe("auto layout on a Frame", () => {
  beforeEach(() => {
    canvasHistory.clear();
    useFrames.setState({ frames: { f: frame() }, selectedIds: [] });
    useKonvaNodes.setState({ nodes: { a: node("a", 300, 40), b: node("b", 50, 200, 120, 100) } });
    useNodePanel.setState({ panels: [panel("p", 420, 150)] });
  });

  it("lays everything inside out one per column, left to right, and hugs it", () => {
    expect(applyAutoLayout("f")).toBe(true);
    // b (x 50), a (x 300), p (x 420).
    expect(f().layout).toEqual({ columns: [["b"], ["a"], ["p"]] });
    expect(n("b")).toMatchObject({ canvasX: 16, canvasY: 16 });
    expect(n("a")).toMatchObject({ canvasX: 16 + 120 + 16, canvasY: 16 });
    expect(p("p")).toMatchObject({ canvasX: 16 + 120 + 16 + 90 + 16, canvasY: 16 + 40 });
    expect(f()).toMatchObject({ canvasX: 0, canvasY: 0, canvasW: 16 + 120 + 16 + 90 + 16 + 100 + 16, canvasH: 16 + 100 + 16 });
  });

  it("is one undo step", () => {
    const unregister = canvasHistory.register("frames", {
      capture: () => ({ ...useFrames.getState().frames }),
      restore: (s) => useFrames.getState().replaceAll({ ...(s as Record<string, FrameRecord>) }),
    });
    canvasHistory.commit();
    applyAutoLayout("f");
    expect(canvasHistory.size).toBe(2);
    canvasHistory.undo();
    expect(f().layout).toBeUndefined();
    expect(f().canvasW).toBe(600);
    unregister();
  });

  it("leaves out what is only partly inside, and an empty Frame can't take it", () => {
    useKonvaNodes.setState({ nodes: { a: node("a", 580, 40) } });
    useNodePanel.setState({ panels: [] });
    expect(canAutoLayout(f())).toBe(false);
    expect(applyAutoLayout("f")).toBe(false);
    expect(f().layout).toBeUndefined();
  });

  it("Remove leaves everything where it is and the Frame its size", () => {
    applyAutoLayout("f");
    const before = { a: { ...n("a") }, w: f().canvasW, h: f().canvasH };
    expect(removeAutoLayout("f")).toBe(true);
    expect(f().layout).toBeUndefined();
    expect(n("a")).toEqual(before.a);
    expect(f()).toMatchObject({ canvasW: before.w, canvasH: before.h });
    // Removed: nothing lays it out any more.
    useKonvaNodes.getState().remove("b");
    expect(reflowAutoLayouts()).toBe(false);
  });

  describe("laying out again", () => {
    beforeEach(() => { applyAutoLayout("f"); });

    it("is a no-op when nothing changed", () => {
      expect(reflowAutoLayouts()).toBe(false);
    });

    it("lays out a stack (#230)", () => {
      useFrames.getState().upsert({ ...f(), layout: { columns: [["b"], ["a", "p"]] } });
      reflowAutoLayouts();
      expect(n("a")).toMatchObject({ canvasX: 16 + 120 + 16, canvasY: 16 });
      expect(p("p")).toMatchObject({ canvasX: 16 + 120 + 16, canvasY: 16 + 60 + 16 + 40 });
      expect(f()).toMatchObject({ canvasW: 16 + 120 + 16 + 100 + 16, canvasH: 16 + 60 + 16 + 80 + 16 });
    });

    it("closes the gap a deleted child leaves, and keeps its id for undo", () => {
      useKonvaNodes.getState().remove("b");
      expect(reflowAutoLayouts()).toBe(true);
      expect(n("a")).toMatchObject({ canvasX: 16 });
      expect(p("p")).toMatchObject({ canvasX: 16 + 90 + 16 });
      expect(f().canvasW).toBe(16 + 90 + 16 + 100 + 16);
      expect(f().layout?.columns).toEqual([["b"], ["a"], ["p"]]);
    });

    it("follows a child that grows", () => {
      useKonvaNodes.getState().upsert({ ...n("b"), canvasW: 200, canvasH: 150 });
      reflowAutoLayouts();
      expect(n("a")).toMatchObject({ canvasX: 16 + 200 + 16 });
      expect(f().canvasH).toBe(16 + 150 + 16);
    });

    it("drops a child dragged clear of the Frame, and its emptied column", () => {
      useKonvaNodes.getState().upsert({ ...n("a"), canvasX: 2000, canvasY: 2000 });
      reflowAutoLayouts();
      expect(f().layout?.columns).toEqual([["b"], ["p"]]);
      expect(n("a")).toMatchObject({ canvasX: 2000 });
      expect(p("p")).toMatchObject({ canvasX: 16 + 120 + 16 });
    });

    it("puts a child dropped inside back in its place", () => {
      useKonvaNodes.getState().upsert({ ...n("a"), canvasX: 30, canvasY: 50 });
      reflowAutoLayouts();
      expect(n("a")).toMatchObject({ canvasX: 16 + 120 + 16, canvasY: 16 });
    });

    it("keeps its children when the Frame moves with them, as a drag does", () => {
      useFrames.getState().upsert({ ...f(), canvasX: 1000, canvasY: 500 });
      for (const id of ["a", "b"]) {
        useKonvaNodes.getState().upsert({ ...n(id), canvasX: n(id).canvasX + 1000, canvasY: n(id).canvasY + 500 });
      }
      useNodePanel.getState().setCanvasPositions({ p: { x: p("p").canvasX + 1000, y: p("p").canvasY + 500 } });
      expect(reflowAutoLayouts()).toBe(false);
      expect(f().layout?.columns).toEqual([["b"], ["a"], ["p"]]);
    });

    describe("resizing rearranges (#232)", () => {
      it("live: the items follow the shape being dragged, and nothing is stored", () => {
        const order = startRearrange("f");
        expect(order.map((b) => b.id)).toEqual(["b", "a", "p"]);
        rearrangeLive(order, { x: 0, y: 0, w: 150, h: 900 });
        // A tall, narrow box: one column.
        expect(n("b")).toMatchObject({ canvasX: 16, canvasY: 16 });
        expect(n("a")).toMatchObject({ canvasX: 16, canvasY: 16 + 100 + 16 });
        expect(f().layout).toEqual({ columns: [["b"], ["a"], ["p"]] });
      });

      it("on release: stored, and the Frame snaps to fit", () => {
        const order = startRearrange("f");
        finishRearrange("f", order, { x: 0, y: 0, w: 150, h: 900 });
        expect(f().layout).toEqual({ columns: [["b", "a", "p"]] });
        expect(f()).toMatchObject({ canvasW: 16 + 120 + 16, canvasH: 16 + 100 + 16 + 60 + 16 + 80 + 16 });
      });

      it("from the top-left: the items are packed from the new corner", () => {
        const order = startRearrange("f");
        finishRearrange("f", order, { x: -200, y: -100, w: 2000, h: 120 });
        expect(n("b")).toMatchObject({ canvasX: -200 + 16, canvasY: -100 + 16 });
        expect(f()).toMatchObject({ canvasX: -200, canvasY: -100 });
      });

      it("keeps the order it began with, though the items move", () => {
        const order = startRearrange("f");
        rearrangeLive(order, { x: 0, y: 0, w: 150, h: 900 });
        rearrangeLive(order, { x: 0, y: 0, w: 2000, h: 120 });
        expect(n("b").canvasX).toBeLessThan(n("a").canvasX);
        expect(n("a").canvasX).toBeLessThan(p("p").canvasX);
      });

      it("leaves deleted ids out", () => {
        useFrames.getState().upsert({ ...f(), layout: { columns: [["b", "gone"], ["a"], ["p"]] } });
        finishRearrange("f", startRearrange("f"), { x: 0, y: 0, w: 150, h: 900 });
        expect(f().layout).toEqual({ columns: [["b", "a", "p"]] });
      });
    });

    describe("with nothing left in it (#230)", () => {
      beforeEach(() => { boardStage.current = {} as never; });
      afterEach(() => { boardStage.current = null; });

      it("turns auto layout off, and the Frame keeps its size", () => {
        const { canvasW, canvasH } = f();
        useKonvaNodes.setState({ nodes: {} });
        useNodePanel.setState({ panels: [] });
        reflowAutoLayouts();
        expect(f().layout).toBeUndefined();
        expect(f()).toMatchObject({ canvasW, canvasH });
      });
    });

    it("but not while the board isn't up: a loading board's nodes aren't known yet", () => {
      useKonvaNodes.setState({ nodes: {} });
      useNodePanel.setState({ panels: [] });
      reflowAutoLayouts();
      expect(f().layout).toEqual({ columns: [["b"], ["a"], ["p"]] });
    });
  });
});
