import { describe, expect, it } from "vitest";
import type { FrameRecord } from "@/store/frame.store";
import {
  BAR_GAP, BAR_HEIGHT, FRAME_NAME_CLEARANCE, barMeetsNames, barPlacement, frameNameBox, NAME_CLEARANCE,
  type ScreenBox,
} from "../styleBarPlacement";

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

describe("barPlacement", () => {
  // Every name 35 px wide on screen.
  const measure = () => 35;
  const shape = (x: number, y: number, w = 400, h = 200, label?: string) =>
    ({ canvasX: x, canvasY: y, canvasW: w, canvasH: h, label });

  it("centres the bar above the selection, a gap clear of it", () => {
    const p = barPlacement({ items: [shape(350, 250)], frames: [], vp: at100, barW: 200, measure });
    expect(p).toEqual({ centre: 550, top: 250 - BAR_GAP - BAR_HEIGHT, below: false });
  });

  it("spans every selected item, Frames included", () => {
    const p = barPlacement({ items: [shape(0, 300, 100, 100)], frames: [frame(500, 250, 100)], vp: at100, barW: 100, measure });
    expect(p.centre).toBe(300);
    expect(p.top).toBe(250 - BAR_GAP - BAR_HEIGHT);
  });

  it("follows pan and zoom, keeping its own screen size", () => {
    const p = barPlacement({ items: [shape(100, 400)], frames: [], vp: { x: 10, y: 20, scale: 0.5 }, barW: 200, measure });
    expect(p.centre).toBe(10 + (100 + 200) * 0.5);
    expect(p.top).toBe(20 + 400 * 0.5 - BAR_GAP - BAR_HEIGHT);
  });

  it("stays put over a Frame whose name it does not meet (#223)", () => {
    const p = barPlacement({ items: [], frames: [frame(350, 250, 400)], vp: at100, barW: 200, measure });
    expect(p.top).toBe(250 - BAR_GAP - BAR_HEIGHT);
  });

  it("lifts over a Frame's name it would sit on", () => {
    const p = barPlacement({ items: [], frames: [frame(350, 250, 400)], vp: at100, barW: 400, measure });
    expect(p.top).toBe(250 - BAR_GAP - BAR_HEIGHT - FRAME_NAME_CLEARANCE);
  });

  it("lifts over a named item's name, and not over an unnamed one's (#243)", () => {
    const named = barPlacement({ items: [shape(350, 250, 400, 200, "Image 1")], frames: [], vp: at100, barW: 400, measure });
    expect(named.top).toBe(250 - BAR_GAP - BAR_HEIGHT - FRAME_NAME_CLEARANCE);
    const unnamed = barPlacement({ items: [shape(350, 250)], frames: [], vp: at100, barW: 400, measure });
    expect(unnamed.top).toBe(250 - BAR_GAP - BAR_HEIGHT);
  });

  it("flips below when there is no room above on screen", () => {
    const p = barPlacement({ items: [shape(0, 50)], frames: [], vp: at100, barW: 200, measure });
    expect(p).toEqual({ centre: 200, top: 50 + 200 + BAR_GAP, below: true });
  });
});
