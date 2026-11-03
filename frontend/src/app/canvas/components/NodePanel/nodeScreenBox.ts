// Where a node sits on screen (#468): its box in screen px, and the middle
// of its height, which its panel lines up with. pw/ph are canvas units and
// width/height their on-screen size at the current zoom: node geometry
// scales, chrome (ports, anchors, the panel) keeps a fixed pixel size.

import { boundsOf, type CentreAnchoredBox } from "@/lib/canvas/bounds";
import { toScreen, type Viewport } from "@/lib/canvas/coords";

export interface ScreenBox {
  left: number;
  top: number;
  width: number;
  height: number;
  /** The middle of the node's height on screen. */
  centreY: number;
}

export function nodeScreenBox(node: CentreAnchoredBox, vp: Viewport): ScreenBox {
  const b = boundsOf(node);
  const { x: left, y: top } = toScreen({ x: b.x, y: b.y }, vp);
  const width = b.w * vp.scale;
  const height = b.h * vp.scale;
  return { left, top, width, height, centreY: top + height / 2 };
}
