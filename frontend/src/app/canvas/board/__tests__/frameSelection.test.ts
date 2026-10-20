import { describe, expect, it } from "vitest";
import { canFrame, frameAround, type SelectedBox } from "../frameSelection";
import type { FrameRecord } from "@/store/frame.store";

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
