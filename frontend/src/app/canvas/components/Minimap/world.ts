import type { Bounds } from "@/lib/canvas/bounds";

/**
 * The minimap's coordinate space.
 *
 * Previously a hardcoded 4000x3000 box centred on the origin, with its own
 * SCALE_X / SCALE_Y. That had two consequences, and they share this cause:
 *
 *  - anything dragged beyond +/-2000, +/-1500 fell off a map that did not know
 *    it existed;
 *  - zooming out made the viewport legitimately exceed the world, so the
 *    indicator exceeded the map. Measured at 200x130: 269x131 at 25% zoom and
 *    579x282 at 10%. `.minimap-canvas` clips, so rather than looking broken
 *    the map just turned solid blue and stopped carrying information.
 *
 * Deriving the world from what is actually on screen fixes both. The viewport
 * is always part of the union, so the indicator fits by construction and needs
 * no clamping special case.
 */

/** Breathing room around the content, as a fraction of its larger edge. */
export const WORLD_PAD = 0.08;

export function unionBounds(list: Bounds[]): Bounds | null {
  if (!list.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of list) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Grows a box on every side by `fraction` of its larger edge. */
export function padBounds(b: Bounds, fraction: number): Bounds {
  const pad = Math.max(b.w, b.h) * fraction;
  return { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
}

/**
 * The slice of canvas currently on screen, in canvas units.
 *
 * A canvas point maps to screen as `p * scale + offset`, so screen 0 is at
 * canvas `-offset / scale` -- the same relation toCanvas() uses, written for a
 * whole box rather than a point.
 */
export function viewportBounds(
  vp: { x: number; y: number; scale: number },
  size: { width: number; height: number }
): Bounds {
  return {
    x: -vp.x / vp.scale,
    y: -vp.y / vp.scale,
    w: size.width / vp.scale,
    h: size.height / vp.scale,
  };
}

/**
 * The box the minimap draws, in canvas units: every node plus the viewport,
 * padded.
 *
 * Including the viewport is what guarantees the indicator is inside the map at
 * every zoom. It also means the world shifts as you pan, so objects drift
 * rather than sitting still -- the same trade tldraw makes, and the price of
 * never showing a map that excludes where you are looking.
 */
export function minimapWorld(content: Bounds[], viewport: Bounds): Bounds {
  // Non-null: viewport is always present, so the list is never empty.
  return padBounds(unionBounds([...content, viewport])!, WORLD_PAD);
}
