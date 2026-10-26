import { describe, it, expect } from "vitest";
import type { PanelInstance } from "@/store/nodePanel.store";
import type { KonvaNodeRecord } from "@/store/konvaNodes.store";
import { chromeCovered } from "../chromeCovered";

// canvasY is the vertical centre: this node spans (0,0)–(200,200).
const node = (over: Partial<PanelInstance> = {}): PanelInstance =>
  ({ id: "self", kind: "image", canvasX: 0, canvasY: 100, w: 200, h: 200, isActive: false, isPanelOpen: false, ...over }) as PanelInstance;

describe("chromeCovered", () => {
  it("is all clear with nothing above", () => {
    expect(chromeCovered(node(), [], [], "dom", 1)).toEqual({ input: false, output: false, label: false });
  });

  it("hides only the port a later panel overlaps", () => {
    const leftEdge = node({ id: "left", canvasX: -100, w: 150 });
    expect(chromeCovered(node(), [leftEdge], [], "dom", 1)).toEqual({ input: true, output: false, label: false });
  });

  it("hides the name under a panel that reaches above the node", () => {
    const above = node({ id: "above", canvasY: 0, h: 60 });
    expect(chromeCovered(node(), [above], [], "dom", 1).label).toBe(true);
  });

  it("counts uploaded images only while the canvas is the front layer", () => {
    const img: KonvaNodeRecord = { id: "img", canvasX: -10, canvasY: -40, canvasW: 300, canvasH: 300, z: 1 };
    expect(chromeCovered(node(), [], [img], "dom", 1)).toEqual({ input: false, output: false, label: false });
    expect(chromeCovered(node(), [], [img], "canvas", 1)).toEqual({ input: true, output: true, label: true });
  });
});
