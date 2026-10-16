// The dock's Color swatches (#159), and the outline a filled shape gets.
//
// A fixed palette, as in the reference: no custom colours and no opacity.
// The order is the card's, row by row.

export interface Swatch {
  name: string;
  hex: string;
}

export const PALETTE: readonly Swatch[] = [
  { name: "Black", hex: "#1f1f1f" },
  { name: "White", hex: "#ffffff" },
  { name: "Grey", hex: "#a3aab3" },
  { name: "Purple", hex: "#c08cf5" },
  { name: "Yellow", hex: "#fcd12a" },
  { name: "Peach", hex: "#fba870" },
  { name: "Coral", hex: "#f8695f" },
  { name: "Pink", hex: "#fcc8c8" },
  { name: "Light green", hex: "#98e08a" },
  { name: "Green", hex: "#45cf6e" },
  { name: "Blue", hex: "#3b9ef5" },
  { name: "Light blue", hex: "#80cbef" },
];

/** What the dock's dot shows before any swatch is picked. */
export const DEFAULT_SWATCH = PALETTE[0];

/** How much darker a filled shape's outline is than its fill. */
const OUTLINE_SHADE = 0.25;

/**
 * A filled shape's outline: its fill, a little darker. Without it a white or
 * pale shape would all but vanish on the board.
 */
export function outlineFor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const darken = (c: number) => Math.round(c * (1 - OUTLINE_SHADE));
  const [r, g, b] = [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff].map(darken);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** The dock's event when a swatch is picked. Board and FrameLayer listen. */
export const COLOR_EVENT = "canvas:color";

export interface ColorDetail {
  hex: string;
}
