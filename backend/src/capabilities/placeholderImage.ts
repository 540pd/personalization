// The placeholder for Vertex AI image generation (#335): a PNG the backend
// draws itself, at the requested shape, so a mock output behaves like a real
// one -- stored as an asset, sent on as a reference -- with no network.

import { deflateSync } from "node:zlib";
import type { AspectRatioV2 } from "./types.js";

/** The long edge, as the real models answer at 1K. */
const LONG_EDGE = 1024;

/** Width and height for `ratio`, long edge LONG_EDGE. */
export function placeholderSize(ratio: AspectRatioV2): { width: number; height: number } {
  const [w, h] = ratio.split(":").map(Number);
  return w >= h
    ? { width: LONG_EDGE, height: Math.round((LONG_EDGE * h) / w) }
    : { width: Math.round((LONG_EDGE * w) / h), height: LONG_EDGE };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** RGB for a hue in [0, 360), soft rather than saturated. */
function tint(hue: number, light: number): [number, number, number] {
  const c = (1 - Math.abs(2 * light - 1)) * 0.45;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const [r, g, b] =
    hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  const m = light - c / 2;
  return [r, g, b].map((v) => Math.round((v + m) * 255)) as [number, number, number];
}

/**
 * A diagonal gradient PNG at `ratio`, tinted by `hue`: plain enough to read
 * as a placeholder at a glance, and different per variant so a batch of
 * them can be told apart.
 */
export function placeholderPng(ratio: AspectRatioV2, hue: number): Buffer {
  const { width, height } = placeholderSize(ratio);
  const from = tint(hue, 0.86);
  const to = tint((hue + 40) % 360, 0.7);
  const row = width * 3 + 1;
  const raw = Buffer.alloc(row * height);
  for (let y = 0; y < height; y++) {
    raw[y * row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const t = (x / width + y / height) / 2;
      const o = y * row + 1 + x * 3;
      raw[o] = from[0] + (to[0] - from[0]) * t;
      raw[o + 1] = from[1] + (to[1] - from[1]) * t;
      raw[o + 2] = from[2] + (to[2] - from[2]) * t;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Each call a new hue, a golden-angle step on: variants side by side differ.
let nextHue = Math.floor(Math.random() * 360);

/** The placeholder as the real capability answers: a data: URL. */
export function placeholderImageUrl(ratio: AspectRatioV2): string {
  nextHue = (nextHue + 137.5) % 360;
  return `data:image/png;base64,${placeholderPng(ratio, nextHue).toString("base64")}`;
}
