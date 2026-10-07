// Shared canvas values used across Board, NodePanel, KonvaNodePorts and ConnectionOverlay.

import type { CSSProperties } from "react";

export const COLORS = {
  ink:          "#000000",
  paper:        "#ffffff",
  selected:     "#2563eb",
  snapFill:     "rgba(0,0,0,0.1)",
  panelBorder:  "rgba(0,0,0,0.08)",
  placeholder:  "#f5f5f5",
  mediaFill:    "#1e1e2e",
  mediaStroke:  "#6b6b8a",
} as const;

export const Z_INDEX = {
  wires: 49,
  nodes: 50,
  ports: 51,
} as const;

export const MIN_NODE_SIZE = 60; // canvas units

// The longest edge of a node's default footprint, in canvas units. Shared by
// both node types so an imported image and a generated one land at the same
// size — a generated node used to default to 200, rendering your own output at
// 42% the size of content you brought in. Capping only the width let a tall
// image through at any height: a 1000x3000 upload became 480x1440.
//
// Matched to PANEL_W so an open Create Image panel is exactly as wide as its
// node. That also keeps the panel on the node's preferred right-hand side on
// any window down to ~1008px: it needs edge <= viewportWidth - 688.
export const DEFAULT_NODE_MAX_EDGE = 320;

// Aspect ratios offered by the Create Image panel, and the default.
export const ASPECT_MAP: Record<string, [number, number]> = {
  "16:9": [16, 9], "1:1": [1, 1], "9:16": [9, 16], "4:3": [4, 3], "3:4": [3, 4],
};
export const DEFAULT_ASPECT_RATIO = "16:9";

// A Create Image node has no natural size, so its footprint comes from the
// chosen ratio with the long edge pinned to DEFAULT_NODE_MAX_EDGE. Lives here
// rather than in NodePanel so nodePanel.store can seed a new node with the
// same numbers instead of repeating them as literals.
export function placeholderSize(ratio: string): { w: number; h: number } {
  const [aw, ah] = ASPECT_MAP[ratio] ?? ASPECT_MAP[DEFAULT_ASPECT_RATIO];
  if (aw >= ah) {
    return { w: DEFAULT_NODE_MAX_EDGE, h: Math.round(DEFAULT_NODE_MAX_EDGE * ah / aw) };
  }
  return { w: Math.round(DEFAULT_NODE_MAX_EDGE * aw / ah), h: DEFAULT_NODE_MAX_EDGE };
}

// Corner radius for canvas nodes, in canvas units. The single source for both
// node types: Konva reads it as cornerRadius, and the Create Image placeholder
// sets it inline so its children can inherit. It used to be duplicated here
// and as Tailwind rounded-2xl in NodePanel.scss, which only agreed by hand.
// The placeholder is scaled by the viewport transform, so both shrink with
// zoom in step. 10 rather than 16 because the node itself shrank to 320 --
// holding the radius fixed had pushed it from 3.3% to 5% of the node's width.
export const NODE_CORNER_RADIUS = 10;

export const SELECTION = {
  // 0: the selection border sits flush on the node edge rather than floating
  // clear of it.
  padding:            0,
  borderWidth:        1.5,
  anchorSize:         8,
  anchorCornerRadius: 2,
} as const;

// Ports are half-discs carved into the node edge, mouth facing the wire.
export const PORT_HEIGHT   = 10;
export const PORT_WIDTH    = PORT_HEIGHT / 2;
export const PORT_HIT_PAD  = 5;   // transparent padding around the output port's grab target
export const PORT_FRACTION = 0.3; // vertical position from the node's top edge
export const SNAP_RADIUS   = 16;

const PORT_SHAPE: CSSProperties = {
  width:      PORT_WIDTH,
  height:     PORT_HEIGHT,
  background: COLORS.paper,
  border:     `1.5px solid ${COLORS.ink}`,
};

// Output port: transparent hit target (callers add left/top) wrapping OUTPUT_PORT_STYLE.
export const OUTPUT_PORT_HIT_STYLE: CSSProperties = {
  position:       "fixed",
  width:          PORT_WIDTH + PORT_HIT_PAD * 2,
  height:         PORT_HEIGHT + PORT_HIT_PAD * 2,
  transform:      "translateY(-50%)",
  display:        "flex",
  alignItems:     "center",
  justifyContent: "center",
  cursor:         "crosshair",
  pointerEvents:  "auto",
  zIndex:         Z_INDEX.ports,
};

export const OUTPUT_PORT_STYLE: CSSProperties = {
  ...PORT_SHAPE,
  borderRightColor: "transparent",
  borderRadius:     "999px 0 0 999px",
};

// Input port: callers add left/top.
export const INPUT_PORT_STYLE: CSSProperties = {
  position: "fixed",
  ...PORT_SHAPE,
  borderLeftColor: "transparent",
  borderRadius:    "0 999px 999px 0",
  transform:       "translateY(-50%)",
  cursor:          "crosshair",
  pointerEvents:   "auto",
  zIndex:          Z_INDEX.ports,
};
