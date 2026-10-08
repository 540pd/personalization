// Canvas <-> screen conversion.
//
// Lives here rather than in a component because every overlay needs it and
// there was previously nowhere shared to put a *function* — frontend/src has
// api, app, auth, components, constants, store and types, so the only
// importable shared module was canvas.constants.ts, which is why a sizing
// function ended up in a constants file.

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Stage offset and zoom, as held by viewport.store. */
export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

/** Canvas units -> screen px. */
export function toScreen(pt: Point, vp: Viewport): Point {
  return { x: vp.x + pt.x * vp.scale, y: vp.y + pt.y * vp.scale };
}

/** Screen px -> canvas units. Exact inverse of toScreen. */
export function toCanvas(pt: Point, vp: Viewport): Point {
  return { x: (pt.x - vp.x) / vp.scale, y: (pt.y - vp.y) / vp.scale };
}

/**
 * The canvas point currently at the centre of the viewport — where a newly
 * created node goes.
 *
 * Was written two different ways for the same value:
 *   Board.tsx         -sx / s + W / (2 * s)
 *   FloatingDock.tsx  (-sx + W / 2) / sc
 * Algebraically identical, so no text search would ever have matched them to
 * each other. That is the argument for a named function over a lint rule.
 */
export function viewportCentre(vp: Viewport, size: Size): Point {
  return toCanvas({ x: size.width / 2, y: size.height / 2 }, vp);
}

/**
 * The stage offset that puts a given canvas point at the viewport centre —
 * the inverse of viewportCentre, used when the minimap jumps somewhere.
 */
export function stagePositionFor(centre: Point, scale: number, size: Size): Point {
  return {
    x: -centre.x * scale + size.width / 2,
    y: -centre.y * scale + size.height / 2,
  };
}
