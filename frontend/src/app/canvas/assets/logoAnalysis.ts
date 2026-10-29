// What the Assets page reads from a logo, in the browser (#417): whether it
// has any transparency (a logo without may show as a box on coloured
// creatives), and up to four colours to suggest for the brand. The pixel
// work is pure, on RGBA data, so it is tested apart from a canvas.

export interface LogoReading {
  /** Whether any pixel is see-through. */
  transparent: boolean;
  /** The logo's main colours, most used first, as "#RRGGBB". */
  colours: string[];
}

/** Below this alpha a pixel is see-through; above OPAQUE it counts toward the colours. */
const SEE_THROUGH = 250;
const OPAQUE = 200;
/** Colours closer than this (in RGB distance) count as one. */
const SAME_COLOUR = 48;
export const MAX_SUGGESTIONS = 4;

const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`.toUpperCase();

/** Reads RGBA pixels: transparency, and the main colours by how much of the logo they cover. */
export function readPixels(data: Uint8ClampedArray | Uint8Array): LogoReading {
  let transparent = false;
  // Pixels grouped by colour at 4 bits a channel, each group's sum kept for its average.
  const groups = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < data.length; i += 4) {
    const a = data[i + 3];
    if (a < SEE_THROUGH) transparent = true;
    if (a < OPAQUE) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const group = groups.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    group.n += 1;
    group.r += r;
    group.g += g;
    group.b += b;
    groups.set(key, group);
  }
  const picked: [number, number, number][] = [];
  for (const g of [...groups.values()].sort((x, y) => y.n - x.n)) {
    const rgb: [number, number, number] = [g.r / g.n, g.g / g.n, g.b / g.n];
    const near = picked.some((p) => Math.hypot(p[0] - rgb[0], p[1] - rgb[1], p[2] - rgb[2]) < SAME_COLOUR);
    if (!near) picked.push(rgb);
    if (picked.length === MAX_SUGGESTIONS) break;
  }
  return { transparent, colours: picked.map((p) => hex(...p)) };
}

/** Reads a loaded logo, drawn small: a few thousand pixels say enough. */
export function readLogo(img: HTMLImageElement): LogoReading | null {
  const scale = Math.min(1, 96 / Math.max(img.naturalWidth, img.naturalHeight, 1));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  try {
    return readPixels(ctx.getImageData(0, 0, w, h).data);
  } catch {
    // A canvas the image tainted can't be read; say nothing rather than guess.
    return null;
  }
}
