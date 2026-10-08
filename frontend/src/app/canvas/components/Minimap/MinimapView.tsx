"use client";

// Luma reference: UTIL-01 — the map itself. Objects as live shapes, plus the
// viewport indicator.

import { useCallback, useRef } from "react";
import { useViewport } from "@/store/viewport.store";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { boundsOf, type Bounds } from "@/lib/canvas/bounds";
import { stagePositionFor, type Point } from "@/lib/canvas/coords";
import { minimapWorld, viewportBounds } from "./world";

export const MAP_W = 200;
export const MAP_H = 130;

/**
 * Rendered as one <svg> with a viewBox rather than absolutely-positioned
 * divs. The viewBox does the world -> map scaling, so there is no SCALE_X /
 * SCALE_Y to keep in step across the renderer, the click handler and the drag
 * handler -- three places the old fixed mapping had to agree, by hand.
 *
 * preserveAspectRatio letterboxes a world whose shape does not match the map,
 * so a tall board is not squashed.
 */
export default function MinimapView({ size }: { size: { width: number; height: number } }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);

  const { x, y, scale } = useViewport();
  const konvaNodes = useKonvaNodes((s) => s.nodes);
  const panels = useNodePanel((s) => s.panels);

  // boundsOf normalises the two record shapes: a Konva node's canvasY is its
  // top edge, a panel's is its vertical centre.
  const content: Bounds[] = [
    ...Object.values(konvaNodes).map(boundsOf),
    ...panels.map(boundsOf),
  ];
  const view = viewportBounds({ x, y, scale }, size);
  const world = minimapWorld(content, view);

  /** Map-local px -> canvas units, via the browser's own inverse transform. */
  const toCanvasPoint = useCallback((clientX: number, clientY: number): Point | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const { x: cx, y: cy } = pt.matrixTransform(ctm.inverse());
    return { x: cx, y: cy };
  }, []);

  const centreOn = useCallback((pt: Point) => {
    const { scale: s } = useViewport.getState();
    const pos = stagePositionFor(pt, s, size);
    useViewport.getState().setPosition(pos.x, pos.y);
  }, [size]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // A click is also fired at the end of a drag; ignore that one or the
      // viewport jumps to wherever the pointer happened to stop.
      if (draggingRef.current) {
        draggingRef.current = false;
        return;
      }
      const pt = toCanvasPoint(e.clientX, e.clientY);
      if (pt) centreOn(pt);
    },
    [toCanvasPoint, centreOn]
  );

  const handleIndicatorPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Pointer events, not mouse: the rest of the canvas is pointer-driven,
      // and capture means a drag that leaves the map still tracks.
      (e.target as Element).setPointerCapture(e.pointerId);

      const onMove = (me: PointerEvent) => {
        draggingRef.current = true;
        const pt = toCanvasPoint(me.clientX, me.clientY);
        if (pt) centreOn(pt);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      // A cancelled gesture never fires pointerup; without this the listeners
      // leak and the next click is swallowed as a drag.
      window.addEventListener("pointercancel", onUp);
    },
    [toCanvasPoint, centreOn]
  );

  return (
    <svg
      ref={svgRef}
      className="minimap-canvas"
      width={MAP_W}
      height={MAP_H}
      viewBox={`${world.x} ${world.y} ${world.w} ${world.h}`}
      preserveAspectRatio="xMidYMid meet"
      onClick={handleClick}
    >
      {content.map((b, i) => (
        <rect
          key={i}
          className="minimap-object"
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
        />
      ))}
      <rect
        className="minimap-viewport-indicator"
        x={view.x}
        y={view.y}
        width={view.w}
        height={view.h}
        // Without this the border thins out as the world grows, since stroke
        // width is in user units like everything else in the viewBox.
        vectorEffect="non-scaling-stroke"
        onPointerDown={handleIndicatorPointerDown}
      />
    </svg>
  );
}
