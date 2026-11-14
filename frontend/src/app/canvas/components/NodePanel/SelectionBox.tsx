"use client";

import { COLORS, SELECTION, Z_INDEX } from "@/constants/canvas.constants";
import type { NodeOutline } from "./nodeOutline";

// Corner anchor positions + resize cursor. idx: 0=TL, 1=TR, 2=BL, 3=BR.
const ANCHORS = [
  { left: 0,      top: 0,      cursor: "nw-resize" },
  { left: "100%", top: 0,      cursor: "ne-resize" },
  { left: 0,      top: "100%", cursor: "sw-resize" },
  { left: "100%", top: "100%", cursor: "se-resize" },
] as const;

interface AnchorHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp:   (e: React.PointerEvent) => void;
}

interface SelectionBoxProps {
  /** The node's box on screen; the border sits SELECTION.padding outside it. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Colour, line and gap for the node's state (nodeOutline, #559). */
  outline: NodeOutline;
  /** Corner anchors, or none (while the panel is open). */
  anchors?: (idx: number) => AnchorHandlers;
}

/** Transformer border + corner anchors for a selected node. */
export default function SelectionBox({ left, top, width, height, outline, anchors }: SelectionBoxProps) {
  const pad = SELECTION.padding + outline.gap;
  return (
    <div
      // What the e2e specs count as "a selected node": any other bordered
      // box on screen (the style bar, a hover outline) is not one.
      data-panel-selection=""
      data-linked={outline.linked || undefined}
      style={{
        position: "fixed",
        left: left - pad,
        top:  top  - pad,
        width:  width + pad * 2,
        height: height + pad * 2,
        border: `${SELECTION.borderWidth}px ${outline.line} ${outline.colour}`,
        // The gap is a ring of surface colour, so the outline reads against
        // whatever the node shows.
        boxShadow: outline.gap ? `inset 0 0 0 ${outline.gap}px ${COLORS.paper}` : undefined,
        borderRadius: 6 + outline.gap,
        zIndex: Z_INDEX.ports,
        pointerEvents: "none",
      }}
    >
      {anchors && ANCHORS.map((pos, i) => (
        <div
          key={i}
          {...anchors(i)}
          style={{
            position: "absolute",
            left: pos.left,
            top:  pos.top,
            width:  SELECTION.anchorSize,
            height: SELECTION.anchorSize,
            background: COLORS.paper,
            border: `1px solid ${outline.colour}`,
            borderRadius: SELECTION.anchorCornerRadius,
            transform: "translate(-50%, -50%)",
            cursor: pos.cursor,
            pointerEvents: "auto",
          }}
        />
      ))}
    </div>
  );
}
