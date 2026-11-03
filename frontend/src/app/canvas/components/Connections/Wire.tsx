"use client";

// One committed wire (#466): its halo when selected, a wide invisible hit
// path, the visible line, and its delete button (#458).

import { useConnectionStore } from "@/store/connection.store";
import { selectOnly } from "@/lib/canvas/selection";
import { COLORS } from "@/constants/canvas.constants";
import WireDeleteButton from "./WireDeleteButton";

export default function Wire({
  id,
  d,
  selected,
  flowing,
  showDelete,
  onHover,
}: {
  id: string;
  /** The drawn path, in screen px. */
  d: string;
  selected: boolean;
  /** Its target is generating (#456). */
  flowing: boolean;
  showDelete: boolean;
  /** The pointer came onto the wire (true) or left it (false). */
  onHover: (over: boolean) => void;
}) {
  const className = ["board-wire", selected && "is-selected", flowing && "is-flowing"].filter(Boolean).join(" ");
  return (
    <g className={className} onPointerEnter={() => onHover(true)} onPointerLeave={() => onHover(false)}>
      {selected && <path d={d} className="board-wire-halo" />}
      {/* Wide invisible hit area so thin lines are easy to click */}
      <path
        d={d}
        fill="none"
        stroke={COLORS.ink}
        strokeWidth={12}
        strokeLinecap="round"
        opacity={0}
        style={{ pointerEvents: "stroke", cursor: "pointer" }}
        onClick={(e) => {
          e.stopPropagation();
          if (e.shiftKey || e.ctrlKey || e.metaKey) {
            useConnectionStore.getState().addToSelection(id);
          } else {
            // Through selectOnly like every other click path. This one
            // cleared nodes and panels by hand and so missed frames
            // (#127) -- and the node transformer's chrome with them.
            selectOnly("wire");
            useConnectionStore.getState().select(id);
          }
        }}
      />
      {/* Visible wire: colour and width follow hover and selection in Connections.scss */}
      <path d={d} className="board-wire-line" />
      {showDelete && <WireDeleteButton d={d} id={id} />}
    </g>
  );
}
