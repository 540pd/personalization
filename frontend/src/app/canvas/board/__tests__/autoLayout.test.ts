import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  applyAutoLayout, canAutoLayout, finishRearrange, rearrangeLive, reflowAutoLayouts, removeAutoLayout,
  startRearrange, type ChildBox,
} from "../autoLayout";
import { useFrames, type FrameRecord } from "@/store/frame.store";
import { useKonvaNodes, type KonvaNodeRecord } from "@/store/konvaNodes.store";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { canvasHistory } from "@/lib/canvas/history";
import { boardStage } from "@/lib/canvas/boardStage";

const box = (id: string, x: number, y: number, w: number, h: number): ChildBox => ({ id, x, y, w, h });

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

    it("gives a named image its band, and lays out again when a panel gets a name (#235)", () => {
      useKonvaNodes.getState().upsert({ ...n("b"), label: "beach" });
      reflowAutoLayouts();
      expect(n("b")).toMatchObject({ canvasX: 16, canvasY: 8 + 24 });
      // Every column starts below the band.
      expect(n("a")).toMatchObject({ canvasY: 8 + 24 });
      const before = f().canvasH;
      useNodePanel.getState().setCanvasPositions({ p: { x: p("p").canvasX, y: p("p").canvasY } });
      useNodePanel.setState({ panels: useNodePanel.getState().panels.map((q) => ({ ...q, label: "hero" })) });
      reflowAutoLayouts();
      expect(f().canvasH).toBe(before);
      expect(p("p")).toMatchObject({ canvasY: 8 + 24 + 40 });
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
