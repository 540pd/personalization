// The resize handles a selected node or Frame gets.
//
// One factory for both, so selecting a frame and selecting a node look like
// the same act, corner handles included (#160).

import Konva from "konva";
import { CORNERS } from "./selectionChrome";
import { isBoardShape } from "./shapes";
import { isBoardText } from "./text";
import { COLORS, MIN_NODE_SIZE, SELECTION, SHAPE_MIN_SIZE } from "@/constants/canvas.constants";

type Box = Parameters<NonNullable<Konva.TransformerConfig["boundBoxFunc"]>>[0];

export interface SelectionTransformerOptions extends Konva.TransformerConfig {
  /** The smallest a side may be resized to. */
  minEdge: () => number;
  /**
   * The zoom the box is divided by before it is compared with minEdge. Boxes
   * arrive in absolute (post-zoom) px, so a minimum in canvas units needs it;
   * leave it out for a minimum in screen px.
   */
  zoom?: () => number;
}

/**
 * A boundBoxFunc with a floor. Without one, an over-drag collapses the item
 * to ~0 and it becomes impossible to grab again.
 */
export function minEdgeBoundBox(minEdge: () => number, zoom: () => number = () => 1) {
  return (oldBox: Box, newBox: Box): Box => {
    const s = zoom() || 1;
    const min = minEdge();
    if (newBox.width / s < min || newBox.height / s < min) return oldBox;
    return newBox;
  };
}

/**
 * A shape may go far smaller than an image: it is often a small marker, and
 * it has no picture to keep recognisable.
 */
export function minResizeEdge(nodes: Konva.Node[]): number {
  // Text too: a line of it is far shorter than MIN_NODE_SIZE, and would
  // otherwise refuse every resize from the start.
  return nodes.every((n) => isBoardShape(n) || isBoardText(n)) ? SHAPE_MIN_SIZE : MIN_NODE_SIZE;
}

export function createSelectionTransformer({
  minEdge,
  zoom,
  ...overrides
}: SelectionTransformerOptions): Konva.Transformer {
  return new Konva.Transformer({
    rotateEnabled: false,
    // Konva implements a flip as rotation:-180, and every geometry helper
    // here computes x + width * scaleX with no notion of rotation — a
    // flipped node would report a box the shape no longer occupies, leaving
    // its port and wires stranded a full width away. A frame's stored box
    // has no notion of it either.
    flipEnabled: false,
    enabledAnchors: CORNERS,
    borderStroke: COLORS.ink,
    borderStrokeWidth: SELECTION.borderWidth,
    anchorStroke: COLORS.ink,
    anchorFill: COLORS.paper,
    anchorSize: SELECTION.anchorSize,
    anchorCornerRadius: SELECTION.anchorCornerRadius,
    padding: SELECTION.padding,
    boundBoxFunc: minEdgeBoundBox(minEdge, zoom),
    ...overrides,
  });
}
