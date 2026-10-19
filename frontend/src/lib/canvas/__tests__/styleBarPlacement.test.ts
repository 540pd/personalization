import { describe, expect, it } from "vitest";
import type { FrameRecord } from "@/store/frame.store";
import { barMeetsNames, frameNameBox, NAME_CLEARANCE, type ScreenBox } from "../styleBarPlacement";

const frame = (x: number, y: number, w: number, h = 200): FrameRecord => ({
  id: "f", label: "Frame", canvasX: x, canvasY: y, canvasW: w, canvasH: h,
});
const at100 = { x: 0, y: 0, scale: 1 };

describe("frameNameBox", () => {
  it("is left-aligned to the Frame and as wide as its text", () => {
    const n = frameNameBox(frame(350, 250, 400), at100, 35)!;
    expect(n.left).toBe(350);
    expect(n.right).toBe(385);
    // Line box 16 tall, glyphs 8 above the edge: 228..244 for a top at 250.
    expect(n.top).toBe(228);
    expect(n.bottom).toBe(244);
  });

  it("is never wider than the Frame", () => {
    const n = frameNameBox(frame(0, 0, 120), at100, 500)!;
    expect(n.right - n.left).toBe(120);
  });

  it("follows pan and zoom", () => {
    const n = frameNameBox(frame(100, 100, 400), { x: 10, y: 20, scale: 0.5 }, 35)!;
    expect(n.left).toBe(60);
    expect(n.bottom).toBe(20 + 50 - 6);
  });

  it("is null for a Frame too narrow on screen to show a name", () => {
    expect(frameNameBox(frame(0, 0, 150), { x: 0, y: 0, scale: 0.5 }, 35)).toBeNull();
  });
});

describe("barMeetsNames", () => {
  // The bar at the shapes' height over a Frame whose top is at 250.
  const bar = (left: number, width = 46): ScreenBox => ({ left, right: left + width, top: 192, bottom: 236 });
  const name = { left: 350, right: 385, top: 228, bottom: 244 };

  it("is false when the bar is clear of the name", () => {
    expect(barMeetsNames(bar(527), [name])).toBe(false);
  });

  it("is true when the bar is over the name", () => {
    expect(barMeetsNames(bar(367), [name])).toBe(true);
  });

  it("keeps NAME_CLEARANCE either side", () => {
    expect(barMeetsNames(bar(385 + NAME_CLEARANCE - 1), [name])).toBe(true);
    expect(barMeetsNames(bar(385 + NAME_CLEARANCE), [name])).toBe(false);
  });

  it("ignores a name well below the bar", () => {
    expect(barMeetsNames(bar(367), [{ ...name, top: 500, bottom: 516 }])).toBe(false);
  });

  it("is false with no names", () => {
    expect(barMeetsNames(bar(367), [])).toBe(false);
  });
});
