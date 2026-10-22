// Which node's name the pointer is over, for "Always show node names" off
// (#215): a name then shows only on its hovered or selected node.
//
// Geometry from the stores rather than DOM or Konva events. The three kinds
// with names sit on three surfaces -- panels in the DOM, images and shapes on
// Board's stage, frames on their own stage below both -- and an enter/leave
// pair never spans them (FrameLayer's hover outline gives the same reason for
// walking the point instead).

import { LABEL_GAP, LABEL_LINE_HEIGHT } from "@/constants/canvas.constants";
import { boundsOf, contains, type Bounds, type NodeBox } from "./bounds";
import type { Point } from "./coords";
import type { TopLayer } from "./occlusion";

export interface HoverCandidate {
  id: string;
  box: NodeBox;
  /** "dom" for panels, "canvas" for Board's stage, "frame" for frames. */
  layer: "dom" | "canvas" | "frame";
  /** Paint order within its layer: array index for panels and frames, z for canvas nodes. */
  order: number;
}

/**
 * The node and the band its name is drawn in, in canvas units. Over the name
 * counts as over the node, so the pointer can travel up onto a name to
 * double-click it without the name vanishing on the way.
 */
export function hoverBounds(box: NodeBox, scale: number): Bounds {
  const b = boundsOf(box);
  const band = (LABEL_GAP + LABEL_LINE_HEIGHT) / scale;
  return { x: b.x, y: b.y - band, w: b.w, h: b.h + band };
}

function paintRank(c: HoverCandidate, topLayer: TopLayer): number {
  // Frames paint below everything; the front one of dom and canvas is topLayer.
  if (c.layer === "frame") return 0;
  return c.layer === topLayer ? 2 : 1;
}

/** The topmost candidate whose node or name is under `point`, or null. */
export function hoverTargetAt(
  point: Point,
  candidates: readonly HoverCandidate[],
  scale: number,
  topLayer: TopLayer
): string | null {
  let best: HoverCandidate | null = null;
  for (const c of candidates) {
    if (!contains(hoverBounds(c.box, scale), point)) continue;
    if (
      !best ||
      paintRank(c, topLayer) > paintRank(best, topLayer) ||
      (paintRank(c, topLayer) === paintRank(best, topLayer) && c.order >= best.order)
    ) {
      best = c;
    }
  }
  return best?.id ?? null;
}
