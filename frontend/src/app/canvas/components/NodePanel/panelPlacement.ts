export const PANEL_W = 320;
const GAP        = 12;
// Keep the panel this far clear of the window edge when it has to flip or clamp.
const VIEWPORT_MARGIN = 12;

export interface PanelPlacementInput {
  /** The node's left edge and on-screen width, in screen px. */
  nodeLeft: number;
  nodeWidth: number;
  /** The visible canvas's left edge and right edge, in screen px. */
  viewLeft: number;
  viewRight: number;
}

/**
 * Where the generate form's left edge goes, in screen px.
 *
 * Prefer the node's right, but fall back to its left when the panel would
 * run off the viewport -- creating a node near the right edge used to push
 * the panel hundreds of px out of view. If neither side fits (very narrow
 * window) keep it on the right and clamp, so it stays reachable.
 */
export function panelPlacement({ nodeLeft, nodeWidth, viewLeft, viewRight }: PanelPlacementInput): number {
  const rightLeft = nodeLeft + nodeWidth + GAP;
  const leftLeft  = nodeLeft - GAP - PANEL_W;
  // The left bound is the sidebar's inner edge, not 0 -- flipping a panel to
  // x=16 would tuck it under the rail.
  const minLeft = viewLeft + VIEWPORT_MARGIN;
  return rightLeft + PANEL_W <= viewRight - VIEWPORT_MARGIN
    ? rightLeft
    : leftLeft >= minLeft
      ? leftLeft
      : Math.max(minLeft, viewRight - PANEL_W - VIEWPORT_MARGIN);
}
