// Where a node's connection ports sit.
//
// These already existed, correct, as panelOutputPt / panelInputPt /
// konvaOutputPt — private to ConnectionOverlay.tsx. KonvaNodePorts and
// NodePanel re-derived the same points inline, and the copies diverged for a
// specific reason: ConnectionOverlay wanted screen px while the occlusion
// tests wanted canvas units, and with no toScreen() the conversion got inlined
// *into* the port maths, so the port concept could not be shared.
//
// Hence these return canvas units only. Compose with toScreen when you need
// screen px. Two concerns fused in one function is why neither was reusable.

import { PORT_FRACTION } from "@/constants/canvas.constants";
import { boundsOf, type NodeBox } from "./bounds";
import type { Point } from "./coords";

/** Vertical offset of both ports, in canvas units from the node's top edge. */
function portY(box: NodeBox): number {
  const b = boundsOf(box);
  return b.y + b.h * PORT_FRACTION;
}

/** Right edge, PORT_FRACTION down. Where a wire leaves a node. */
export function outputPoint(box: NodeBox): Point {
  const b = boundsOf(box);
  return { x: b.x + b.w, y: portY(box) };
}

/**
 * Left edge, PORT_FRACTION down. Where a wire arrives.
 *
 * Geometry only: whether a node *has* an input is a property of its kind, not
 * its box. Uploaded images are source-only and simply never render one.
 */
export function inputPoint(box: NodeBox): Point {
  const b = boundsOf(box);
  return { x: b.x, y: portY(box) };
}
