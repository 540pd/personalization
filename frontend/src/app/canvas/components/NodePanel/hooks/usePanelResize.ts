import { useRef } from "react";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { MIN_NODE_SIZE } from "@/constants/canvas.constants";
import { canvasHistory } from "@/lib/canvas/history";

interface ResizeStart {
  w: number; h: number; cx: number; cy: number;
}

/**
 * The node's size and position after dragging corner `idx` (0=TL, 1=TR,
 * 2=BL, 3=BR) by `mdx` canvas
 * units across. Width is the driver; height follows to preserve aspect ratio.
 * Note `cy` is the node's vertical centre, as on a PanelInstance.
 */
export function resizeFromCorner(start: ResizeStart, idx: number, mdx: number) {
  const isLeft = idx === 0 || idx === 2;
  const isTop  = idx === 0 || idx === 1;
  const w = Math.round(Math.max(MIN_NODE_SIZE, isLeft ? start.w - mdx : start.w + mdx));
  const h = Math.round(w * (start.h / start.w));
  // Keep the opposite corner fixed — every term here is already canvas units.
  const cx = isLeft ? start.cx + (start.w - w) : start.cx;
  const cy = isTop
    ? start.cy + (start.h - h) / 2   // bottom edge fixed
    : start.cy + (h - start.h) / 2;  // top edge fixed
  return { w, h, cx, cy };
}

/** Pointer handlers for the four aspect-locked corner anchors. */
export function usePanelResize(
  instance: PanelInstance,
  scale: number,
  onSetCanvasPos: (x: number, y: number) => void,
) {
  const anchorDrag = useRef<{ idx: number; px: number; start: ResizeStart } | null>(null);

  const anchorHandlers = (idx: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      anchorDrag.current = {
        idx, px: e.clientX,
        start: { w: instance.w, h: instance.h, cx: instance.canvasX, cy: instance.canvasY },
      };
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (e.buttons === 0 || !anchorDrag.current || anchorDrag.current.idx !== idx) return;
      const { px, start } = anchorDrag.current;
      // screen px → canvas units
      const next = resizeFromCorner(start, idx, (e.clientX - px) / scale);
      useNodePanel.getState().setSize(instance.id, next.w, next.h);
      onSetCanvasPos(next.cx, next.cy);
    },
    onPointerUp: () => {
      // Commit only if a resize actually happened; a stray pointerup would
      // otherwise push a duplicate entry and cost an extra Ctrl+Z.
      const resized = anchorDrag.current !== null;
      anchorDrag.current = null;
      if (resized) canvasHistory.commit();
    },
  });

  return anchorHandlers;
}
