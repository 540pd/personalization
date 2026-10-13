// Whether a node's port is hidden behind something.
//
// A port drawn over the node that covers it reads as belonging to that node,
// so it has to disappear. Ports sit at Z_INDEX.ports, above every placeholder,
// so they do not occlude by themselves.
//
// This used to be two functions — isPortCovered in KonvaNodePorts and
// portsCovered in NodePanel — with the same containment predicate written
// twice and the stacking rules implied by whichever call site you were
// reading. Three rules exist because there are genuinely three cases; they
// belong stated once.

import {
  LABEL_GAP,
  LABEL_LINE_HEIGHT,
  PORT_FRACTION,
  PORT_WIDTH,
} from "@/constants/canvas.constants";
import { boundsOf, contains, type Bounds, type NodeBox } from "./bounds";
import type { Point } from "./coords";

/**
 * Something that can hide a port.
 *
 * `z` is only consulted for canvas-vs-canvas. A DOM blocker always wins:
 * Konva shapes are painted into a single <canvas> and the panels are DOM
 * siblings above it, so no z comparison between the two is meaningful.
 */
export interface Blocker {
  id: string;
  box: NodeBox;
  /** "canvas" for Konva shapes, "dom" for panel placeholders. */
  layer: "canvas" | "dom";
  /** Paint order within the canvas layer. Ignored for DOM blockers. */
  z?: number;
}

/** Where a port sits, nudged just inside its own node. */
export type PortSide = "input" | "output";

/**
 * The port's centre, in canvas units.
 *
 * Inset by half the port width because the arc bulges inward: the visible
 * centre lies just inside the node's own edge, and probing the edge exactly
 * would make a node occlude its own port the moment another node touched it.
 * Divided by scale because PORT_WIDTH is a fixed screen size.
 */
export function portProbe(box: NodeBox, side: PortSide, scale: number): Point {
  const b = boundsOf(box);
  const inset = PORT_WIDTH / (2 * scale);
  return {
    x: side === "input" ? b.x + inset : b.x + b.w - inset,
    y: b.y + b.h * PORT_FRACTION,
  };
}

/**
 * Where a node's name sits, in canvas units.
 *
 * The label band is LABEL_GAP above the node's top edge and LABEL_LINE_HEIGHT
 * tall; both are fixed screen sizes, so they divide by scale the same way
 * portProbe's inset does. Probing the band's vertical middle rather than an
 * edge keeps a node whose bottom just grazes the gap from counting as cover.
 *
 * x is inset from the left for the same reason portProbe insets: the name is
 * left-aligned to the node, and probing the exact edge would let a neighbour
 * merely touching that edge blank the whole name.
 */
export function labelProbe(box: NodeBox, scale: number): Point {
  const b = boundsOf(box);
  return {
    x: b.x + LABEL_PROBE_INSET / scale,
    y: b.y - (LABEL_GAP + LABEL_LINE_HEIGHT / 2) / scale,
  };
}

/** Screen px in from the node's left edge. Small: names start at the edge. */
const LABEL_PROBE_INSET = 4;

/** Which paint layer is currently in front. Mirrors layerOrder.store. */
export type TopLayer = "canvas" | "dom";

/**
 * Is `point` hidden by any blocker that paints above `self`?
 *
 * The rules, in one place:
 *   canvas over canvas — covered only when the blocker's z is strictly greater
 *   dom over dom       — the caller passes only the blockers painted later,
 *                        because panels share one z-index and array order IS
 *                        paint order
 *   across layers      — decided entirely by topLayer. Every Konva shape
 *                        shares one <canvas>, so the whole canvas is above
 *                        the placeholders or below them; there is no
 *                        per-node answer. This used to be hardcoded as
 *                        "dom always wins", which is why a dragged image
 *                        vanished behind a Create Image node.
 */
export function isCovered(
  point: Point,
  self: Blocker,
  blockers: Blocker[],
  topLayer: TopLayer = "dom"
): boolean {
  return blockers.some((b) => {
    if (b.id === self.id) return false;

    if (b.layer !== self.layer) {
      // Cross-layer: the blocker only covers if its layer is the front one.
      if (b.layer !== topLayer) return false;
    } else if (self.layer === "canvas" && (b.z ?? 0) <= (self.z ?? 0)) {
      return false;
    }

    return contains(boundsOf(b.box) as Bounds, point);
  });
}
