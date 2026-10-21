"use client";

import { COLORS, SELECTION, Z_INDEX } from "@/constants/canvas.constants";

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
  /** Corner anchors, or none (while the panel is open). */
  anchors?: (idx: number) => AnchorHandlers;
}

/** Transformer border + corner anchors for a selected node. */
export default function SelectionBox({ left, top, width, height, anchors }: SelectionBoxProps) {
  return (
    <div
      // What the e2e specs count as "a selected node": any other bordered
      // box on screen (the style bar, a hover outline) is not one.
      data-panel-selection=""
      style={{
        position: "fixed",
        left: left - SELECTION.padding,
        top:  top  - SELECTION.padding,
        width:  width + SELECTION.padding * 2,
        height: height + SELECTION.padding * 2,
        border: `${SELECTION.borderWidth}px solid ${COLORS.ink}`,
        borderRadius: 6,
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
            border: `1px solid ${COLORS.ink}`,
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
