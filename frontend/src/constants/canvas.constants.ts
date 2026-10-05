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

export const PORT_DIAMETER = 10;
export const PORT_FRACTION = 0.3; // vertical position from the node's top edge
export const SNAP_RADIUS   = 16;

export const PORT_STYLE: CSSProperties = {
  position:      "fixed",
  width:         PORT_DIAMETER,
  height:        PORT_DIAMETER,
  background:    COLORS.paper,
  border:        `1.5px solid ${COLORS.ink}`,
  borderRadius:  "50%",
  transform:     "translate(-50%, -50%)",
  cursor:        "crosshair",
  pointerEvents: "auto",
  zIndex:        Z_INDEX.ports,
};

export const SELECTION = {
  padding:            4,
  borderWidth:        1.5,
  anchorSize:         8,
  anchorCornerRadius: 2,
} as const;
