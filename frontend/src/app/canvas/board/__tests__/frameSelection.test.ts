import { beforeEach, describe, expect, it } from "vitest";
import { canFrame, frameAround, removableFrame, removeSelectedFrame, type SelectedBox } from "../frameSelection";
import { useFrames, type FrameRecord } from "@/store/frame.store";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { registerNodeChromeSelect } from "@/lib/canvas/selection";

const box = (id: string, x: number, y: number, w: number, h: number, named = false): SelectedBox => ({ id, x, y, w, h, named });
const frame = (x: number, y: number, w: number, h: number): FrameRecord => ({
  id: "f", canvasX: x, canvasY: y, canvasW: w, canvasH: h, label: "Frame",
});

describe("frameAround (#243)", () => {
  it("pads 16 on every side when nothing has a name", () => {
    expect(frameAround([box("a", 100, 100, 50, 40), box("b", 200, 120, 30, 60)])).toEqual({
      x: 84, y: 84, w: 162, h: 112,
    });
  });

  it("leaves 8 + 24 above an item with a name, so its name stays inside", () => {
    expect(frameAround([box("a", 100, 100, 50, 40, true), box("b", 200, 100, 30, 40)]).y).toBe(100 - 32);
  });

  it("goes by whichever item needs the Frame's top highest", () => {
    // A named item lower down needs less than the unnamed one above it.
    expect(frameAround([box("a", 0, 0, 10, 10), box("b", 0, 30, 10, 10, true)]).y).toBe(-16);
    // Higher up, it needs more.
    expect(frameAround([box("a", 0, 10, 10, 10), box("b", 20, 0, 10, 10, true)]).y).toBe(-32);
  });
});

describe("canFrame (#243)", () => {
  const two = [box("a", 100, 100, 50, 40), box("b", 200, 120, 30, 60)];

  it("needs two or more items and no Frame among them", () => {
    expect(canFrame(two, [], 0)).toBe(true);
    expect(canFrame(two.slice(0, 1), [], 0)).toBe(false);
    expect(canFrame(two, [], 1)).toBe(false);
  });

  it("not when every item is already inside one Frame; yes when only some are", () => {
    expect(canFrame(two, [frame(0, 0, 400, 400)], 0)).toBe(false);
    expect(canFrame(two, [frame(0, 0, 180, 180)], 0)).toBe(true);
  });
});

describe("removeSelectedFrame (#244)", () => {
  // Board's transformer isn't here: select the ids straight into the store.
  registerNodeChromeSelect((ids) => ids.forEach((id) => useKonvaSelection.getState().addToSelection(id)));
  const panel = (id: string, x: number, y: number) =>
    ({ id, kind: "image", canvasX: x, canvasY: y, w: 100, h: 60, isActive: false, isPanelOpen: false }) as unknown as PanelInstance;

  beforeEach(() => {
    useFrames.setState({
      frames: { f: { ...frame(0, 0, 400, 300), stroke: "#f00" }, empty: { ...frame(1000, 0, 100, 100), id: "empty" } },
      selectedIds: ["f"],
    });
    useKonvaNodes.setState({
      nodes: {
        a: { id: "a", canvasX: 20, canvasY: 20, canvasW: 50, canvasH: 40 },
        out: { id: "out", canvasX: 600, canvasY: 20, canvasW: 50, canvasH: 40 },
      },
    });
    useKonvaSelection.setState({ nodeIds: [] });
    // A panel's canvasY is its centre: 100 high around 100 is inside.
    useNodePanel.setState({ panels: [panel("p", 200, 100), panel("far", 900, 500)] });
  });

  it("removes the Frame and selects what was inside it, nothing moved", () => {
    expect(removeSelectedFrame()).toBe(true);
    expect(useFrames.getState().frames.f).toBeUndefined();
    expect(useFrames.getState().selectedIds).toEqual([]);
    expect(useKonvaSelection.getState().nodeIds).toEqual(["a"]);
    expect(useNodePanel.getState().panels.filter((p) => p.isActive).map((p) => p.id)).toEqual(["p"]);
    expect(useKonvaNodes.getState().nodes.a.canvasX).toBe(20);
    expect(useNodePanel.getState().panels[0].canvasX).toBe(200);
  });

  it("an empty Frame just goes, leaving nothing selected", () => {
    useFrames.setState({ selectedIds: ["empty"] });
    expect(removeSelectedFrame()).toBe(true);
    expect(useFrames.getState().frames.empty).toBeUndefined();
    expect(useKonvaSelection.getState().nodeIds).toEqual([]);
    expect(useNodePanel.getState().panels.some((p) => p.isActive)).toBe(false);
  });

  it("selects auto layout's children by id too", () => {
    useFrames.setState({
      frames: { f: { ...frame(0, 0, 10, 10), layout: { columns: [["out"], ["gone"]] } } },
      selectedIds: ["f"],
    });
    removeSelectedFrame();
    expect(useKonvaSelection.getState().nodeIds).toEqual(["out"]);
  });

  it("only with exactly one Frame selected and nothing else", () => {
    useFrames.setState({ selectedIds: ["f", "empty"] });
    expect(removableFrame()).toBeNull();
    useFrames.setState({ selectedIds: ["f"] });
    useKonvaSelection.setState({ nodeIds: ["out"] });
    expect(removableFrame()).toBeNull();
    expect(removeSelectedFrame()).toBe(false);
    expect(useFrames.getState().frames.f).toBeDefined();
  });
});
