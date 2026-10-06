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

// Uploaded images are fitted inside a square box of this size, in canvas
// units. Capping only the width let a tall image through at any height — a
// 1000x3000 upload became 480x1440, taller than the viewport.
export const MAX_UPLOAD_SIZE = 480;

// Corner radius for canvas nodes, in canvas units. Matches the Create Image
// placeholder's Tailwind rounded-2xl (1rem = 16px); that element is scaled by
// the viewport transform, so both shrink with zoom in step.
export const NODE_CORNER_RADIUS = 16;

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
