import { describe, it, expect } from "vitest";
import { DEFAULT_NODE_MAX_EDGE } from "@/constants/canvas.constants";
import { stripExtension, fitToBox } from "../upload";

// These were buried inside Board's upload handler, unreachable from a test.

describe("stripExtension", () => {
  it("removes only the last segment", () => {
    expect(stripExtension("photo-2024.final.png")).toBe("photo-2024.final");
  });

  it("leaves a name with no extension alone", () => {
    expect(stripExtension("untitled")).toBe("untitled");
  });

  it("does not empty a dotfile", () => {
    // lastIndexOf > 0 rather than >= 0: ".env" must not become "".
    expect(stripExtension(".env")).toBe(".env");
  });
});

describe("fitToBox", () => {
  const edge = DEFAULT_NODE_MAX_EDGE;

  it("fits a landscape image on its width", () => {
    expect(fitToBox(1600, 900)).toEqual({ w: edge, h: (edge * 900) / 1600 });
  });

  // Capping only the width let a tall image through at any height: a
  // 1000x3000 upload became 480x1440, taller than the viewport.
  it("fits a tall image on its height, not its width", () => {
    const { w, h } = fitToBox(1000, 3000);
    expect(h).toBe(edge);
    expect(w).toBeCloseTo((edge * 1000) / 3000, 6);
  });

  it("never scales a small image up", () => {
    // The leading 1 in Math.min. Blowing it up would only blur it.
    expect(fitToBox(80, 60)).toEqual({ w: 80, h: 60 });
  });

  it("leaves an image exactly at the cap untouched", () => {
    expect(fitToBox(edge, edge)).toEqual({ w: edge, h: edge });
  });

  it("preserves aspect ratio in both orientations", () => {
    const wide = fitToBox(4000, 1000);
    const tall = fitToBox(1000, 4000);
    expect(wide.w / wide.h).toBeCloseTo(4, 6);
    expect(tall.w / tall.h).toBeCloseTo(0.25, 6);
  });
});
