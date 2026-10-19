import { describe, it, expect, beforeEach } from "vitest";
import {
  applyAutoLayout, canAutoLayout, layoutRow, orderChildren, reflowAutoLayouts, removeAutoLayout,
  type ChildBox,
} from "../autoLayout";
import { useFrames, type FrameRecord } from "@/store/frame.store";
import { useKonvaNodes, type KonvaNodeRecord } from "@/store/konvaNodes.store";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { canvasHistory } from "@/lib/canvas/history";

const box = (id: string, x: number, y: number, w: number, h: number): ChildBox => ({ id, x, y, w, h });

describe("orderChildren", () => {
  it("goes left to right, ties by top edge", () => {
    const order = orderChildren([box("c", 300, 0, 10, 10), box("a", 10, 50, 10, 10), box("b", 10, 5, 10, 10)]);
    expect(order.map((b) => b.id)).toEqual(["b", "a", "c"]);
  });
});

describe("layoutRow", () => {
  it("pads 16, gaps 16, aligns tops and hugs the row", () => {
    const row = layoutRow({ x: 100, y: 200 }, [box("a", 0, 0, 90, 60), box("b", 0, 0, 90, 80)]);
    expect(row.positions).toEqual({ a: { x: 116, y: 216 }, b: { x: 222, y: 216 } });
    expect(row.w).toBe(16 + 90 + 16 + 90 + 16);
    expect(row.h).toBe(16 + 80 + 16);
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

  it("lays everything inside out in a row, left to right, and hugs it", () => {
    expect(applyAutoLayout("f")).toBe(true);
    // b (x 50), a (x 300), p (x 420).
    expect(f().layout).toEqual({ children: ["b", "a", "p"] });
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

    it("closes the gap a deleted child leaves, and keeps its id for undo", () => {
      useKonvaNodes.getState().remove("b");
      expect(reflowAutoLayouts()).toBe(true);
      expect(n("a")).toMatchObject({ canvasX: 16 });
      expect(p("p")).toMatchObject({ canvasX: 16 + 90 + 16 });
      expect(f().canvasW).toBe(16 + 90 + 16 + 100 + 16);
      expect(f().layout?.children).toEqual(["b", "a", "p"]);
    });

    it("follows a child that grows", () => {
      useKonvaNodes.getState().upsert({ ...n("b"), canvasW: 200, canvasH: 150 });
      reflowAutoLayouts();
      expect(n("a")).toMatchObject({ canvasX: 16 + 200 + 16 });
      expect(f().canvasH).toBe(16 + 150 + 16);
    });

    it("drops a child dragged clear of the Frame", () => {
      useKonvaNodes.getState().upsert({ ...n("a"), canvasX: 2000, canvasY: 2000 });
      reflowAutoLayouts();
      expect(f().layout?.children).toEqual(["b", "p"]);
      expect(n("a")).toMatchObject({ canvasX: 2000 });
      expect(p("p")).toMatchObject({ canvasX: 16 + 120 + 16 });
    });

    it("puts a child dropped inside back in its slot", () => {
      useKonvaNodes.getState().upsert({ ...n("a"), canvasX: 30, canvasY: 50 });
      reflowAutoLayouts();
      expect(n("a")).toMatchObject({ canvasX: 16 + 120 + 16, canvasY: 16 });
      expect(f().layout?.children).toEqual(["b", "a", "p"]);
    });

    it("keeps its children when the Frame moves with them, as a drag does", () => {
      useFrames.getState().upsert({ ...f(), canvasX: 1000, canvasY: 500 });
      for (const id of ["a", "b"]) {
        useKonvaNodes.getState().upsert({ ...n(id), canvasX: n(id).canvasX + 1000, canvasY: n(id).canvasY + 500 });
      }
      useNodePanel.getState().setCanvasPositions({ p: { x: p("p").canvasX + 1000, y: p("p").canvasY + 500 } });
      expect(reflowAutoLayouts()).toBe(false);
      expect(f().layout?.children).toEqual(["b", "a", "p"]);
    });
  });
});
