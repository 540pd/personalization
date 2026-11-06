import { describe, expect, it } from "vitest";
import { readPixels } from "../logoAnalysis";

// Reading a logo's transparency and colours (#417).

/** RGBA pixels: `count` of each [r, g, b, a]. */
const pixels = (...runs: [number, [number, number, number, number]][]) =>
  new Uint8ClampedArray(runs.flatMap(([count, px]) => Array.from({ length: count }, () => px).flat()));

describe("readPixels", () => {
  it("says a logo with any see-through pixel is transparent, and one without is not", () => {
    expect(readPixels(pixels([10, [0, 0, 0, 255]], [1, [0, 0, 0, 0]])).transparent).toBe(true);
    expect(readPixels(pixels([10, [0, 0, 0, 255]])).transparent).toBe(false);
  });

  it("suggests the main colours, most used first, ignoring see-through pixels", () => {
    const { colours } = readPixels(pixels([50, [0x1a, 0x2b, 0x3c, 255]], [30, [0xff, 0x55, 0x00, 255]], [100, [0x00, 0xff, 0x00, 10]]));
    expect(colours).toEqual(["#1A2B3C", "#FF5500"]);
  });

  it("counts near colours (edges, anti-aliasing) as one, and stops at four", () => {
    const { colours } = readPixels(
      pixels(
        [60, [250, 250, 250, 255]],
        [40, [255, 255, 255, 255]],
        [30, [200, 0, 0, 255]],
        [20, [0, 0, 200, 255]],
        [15, [0, 160, 0, 255]],
        [10, [20, 20, 20, 255]],
      ),
    );
    expect(colours).toHaveLength(4);
    expect(colours).toEqual(["#FCFCFC", "#C80000", "#0000C8", "#00A000"]);
  });

  it("has nothing to suggest for an empty or fully see-through logo", () => {
    expect(readPixels(new Uint8ClampedArray())).toEqual({ transparent: false, colours: [] });
    expect(readPixels(pixels([4, [9, 9, 9, 0]])).colours).toEqual([]);
  });
});
