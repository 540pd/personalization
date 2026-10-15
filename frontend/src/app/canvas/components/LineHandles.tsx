"use client";

// The two end handles of a selected line or arrow.
//
// A line has no useful resize box: the transformer's corner anchors would
// stretch the box the line sits in, not move either of its ends. So a lone
// selected line hides the transformer (selectionChrome) and gets these
// instead, one round handle per end, the way Figma and Luma edit a line.
//
// DOM rather than Konva, like the ports: they keep a constant on-screen size
// at every zoom for free, and track the viewport store without the canvas
// having to redraw chrome on every zoom step.

import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useViewport } from "@/store/viewport.store";
import { useToolStore } from "@/store/tool.store";
import { boardStage } from "@/lib/canvas/boardStage";
import { toCanvas, toScreen, type Point } from "@/lib/canvas/coords";
import { canvasHistory } from "@/lib/canvas/history";
import { lineAttrs, snap45, type BoardShape } from "../board/shapes";
import { syncNodeGeometry } from "../board/geometry";
import { COLORS, SELECTION, Z_INDEX } from "@/constants/canvas.constants";

const HANDLE_SIZE = 10; // screen px

type End = "a" | "b";

/**
 * Follows one end from press to release. The other end is pinned where it
 * was when the press began; Shift swings the moving end to 45-degree steps
 * around it.
 */
function dragEnd(e: React.PointerEvent, id: string, end: End, ends: { a: Point; b: Point }) {
  e.stopPropagation();
  e.preventDefault();
  const node = boardStage.current?.findOne<BoardShape>(`#${id}`);
  if (!node) return;
  const fixed = end === "a" ? ends.b : ends.a;

  const move = (ev: PointerEvent) => {
    const vp = useViewport.getState();
    const raw = toCanvas({ x: ev.clientX, y: ev.clientY }, vp);
    const p = ev.shiftKey ? snap45(fixed, raw) : raw;
    node.setAttrs(end === "a" ? lineAttrs(p, fixed) : lineAttrs(fixed, p));
    syncNodeGeometry(node);
    node.getLayer()?.batchDraw();
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    canvasHistory.commit();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
}

export default function LineHandles() {
  const ids = useKonvaSelection((s) => s.nodeIds);
  const nodes = useKonvaNodes((s) => s.nodes);
  const pointer = useToolStore((s) => s.activeTool === "pointer");
  const { x, y, scale } = useViewport();

  if (!pointer || ids.length !== 1) return null;
  const id = ids[0];
  const ends = nodes[id]?.ends;
  if (!ends) return null;

  return (
    <>
      {(["a", "b"] as const).map((end) => {
        const pt = toScreen(ends[end], { x, y, scale });
        return (
          <div
            key={end}
            data-testid={`line-handle-${end}`}
            onPointerDown={(e) => dragEnd(e, id, end, ends)}
            style={{
              position: "fixed",
              left: pt.x - HANDLE_SIZE / 2,
              top: pt.y - HANDLE_SIZE / 2,
              width: HANDLE_SIZE,
              height: HANDLE_SIZE,
              borderRadius: "50%",
              background: COLORS.paper,
              border: `${SELECTION.borderWidth}px solid ${COLORS.ink}`,
              boxSizing: "border-box",
              cursor: "move",
              zIndex: Z_INDEX.ports,
              touchAction: "none",
            }}
          />
        );
      })}
    </>
  );
}
