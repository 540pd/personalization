import { create } from "zustand";

/**
 * Which of the two paint layers is currently on top.
 *
 * Konva shapes all share ONE <canvas> and the node placeholders are DOM
 * siblings of it, so a DOM element can never interleave with canvas pixels.
 * The whole canvas is either above the placeholders or below them. Without
 * this, every Create Image node sat permanently above every uploaded image
 * and dragging an image onto one made it vanish.
 *
 * So: whichever kind of node you last picked up wins. That gets "the thing I
 * am dragging comes to the front" right in both directions, which is the case
 * people actually hit.
 *
 * It is a two-level flip, not real depth. Two images straddling a panel still
 * cannot be separated from each other by it — all images move as one group.
 * Fixing that properly needs two canvas layers, or everything in one
 * technology; this is the cheap 90% and it is deliberately not pretending
 * otherwise.
 */
export type TopLayer = "canvas" | "dom";

interface LayerOrderState {
  topLayer: TopLayer;
  /** An uploaded image was picked up, created or raised. */
  raiseCanvas: () => void;
  /** A Create Image / Instruction / Video node was picked up or created. */
  raiseDom: () => void;
}

export const useLayerOrder = create<LayerOrderState>((set) => ({
  // Panels start on top, matching the behaviour before the flip existed.
  topLayer: "dom",
  raiseCanvas: () => set((s) => (s.topLayer === "canvas" ? s : { topLayer: "canvas" })),
  raiseDom: () => set((s) => (s.topLayer === "dom" ? s : { topLayer: "dom" })),
}));
