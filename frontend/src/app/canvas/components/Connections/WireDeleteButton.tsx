"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useConnectionStore } from "@/store/connection.store";
import { canvasHistory } from "@/lib/canvas/history";
import type { Point } from "@/lib/canvas/coords";

/**
 * A round x at the middle of a wire, deleting it in one undo step (#458).
 * The middle is measured off the drawn path, so it sits on the line
 * whatever its style or route.
 */
export default function WireDeleteButton({ d, id }: { d: string; id: string }) {
  const measure = useRef<SVGPathElement>(null);
  const [mid, setMid] = useState<Point | null>(null);
  useLayoutEffect(() => {
    const path = measure.current;
    if (!path) return;
    const pt = path.getPointAtLength(path.getTotalLength() / 2);
    setMid({ x: pt.x, y: pt.y });
  }, [d]);
  return (
    <>
      <path ref={measure} d={d} fill="none" stroke="none" />
      {mid && (
        <g
          className="board-wire-delete"
          transform={`translate(${mid.x} ${mid.y})`}
          role="button"
          aria-label="Delete link"
          // Not a press on the board: no pan, no marquee, no deselect.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            useConnectionStore.getState().removeConnection(id);
            canvasHistory.commit();
          }}
        >
          <title>Delete link</title>
          <circle r={10} className="board-wire-delete-bg" />
          <path d="M -3.5 -3.5 L 3.5 3.5 M 3.5 -3.5 L -3.5 3.5" className="board-wire-delete-x" />
        </g>
      )}
    </>
  );
}
