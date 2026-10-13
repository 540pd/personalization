// Normalises the two node record shapes into one box.
//
// KonvaNodeRecord.canvasY is the node's TOP edge; PanelInstance.canvasY is its
// vertical CENTRE, and the field names differ too (canvasW/canvasH vs w/h).
// That asymmetry used to be handled by a comment in nodePanel.store.ts telling
// every reader to remember it, and four call sites had to.
//
// Resolving it here means a new node kind supplies a box and gets ports,
// occlusion and hit-testing for free.

import type { Point } from "./coords";

/** A node whose canvasY is its TOP edge — uploaded images on the Konva layer. */
export interface TopAnchoredBox {
  canvasX: number;
  canvasY: number;
  canvasW: number;
  canvasH: number;
}

/** A node whose canvasY is its vertical CENTRE — Create Image / Instruction panels. */
export interface CentreAnchoredBox {
  canvasX: number;
  canvasY: number;
  w: number;
  h: number;
}

export type NodeBox = TopAnchoredBox | CentreAnchoredBox;

/** Axis-aligned box in canvas units, y always the top edge. */
export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function boundsOf(box: NodeBox): Bounds {
  // Narrowed on a field only the top-anchored shape has, rather than on a
  // discriminant the stores would both have to carry.
  return "canvasW" in box
    ? { x: box.canvasX, y: box.canvasY, w: box.canvasW, h: box.canvasH }
    : { x: box.canvasX, y: box.canvasY - box.h / 2, w: box.w, h: box.h };
}

/** Inclusive on every edge, matching the >= / <= the occlusion tests used. */
export function contains(b: Bounds, pt: Point): boolean {
  return pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h;
}

export function overlaps(a: Bounds, b: Bounds): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Is `inner` entirely within `outer`?
 *
 * Membership of a frame, decided at the moment the drag starts. Full
 * containment rather than overlap: a node straddling the edge belongs to
 * neither side, and moving it with the frame would drag away something the
 * user can see is half outside.
 */
export function containsBox(outer: Bounds, inner: Bounds): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}
