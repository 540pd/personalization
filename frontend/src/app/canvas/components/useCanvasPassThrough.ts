"use client";

// When the canvas is the front layer it covers the whole viewport, so it
// would swallow every click meant for a node placeholder underneath --
// including placeholders nowhere near an image. Let events pass through
// except where a shape actually is.
//
// Only runs while the canvas is in front; in the normal case the container
// stays plainly interactive and this costs nothing.

import { useEffect, type RefObject } from "react";
import type Konva from "konva";
import { useViewport } from "@/store/viewport.store";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { drawingTool, type Tool } from "@/store/tool.store";
import type { TopLayer } from "@/store/layerOrder.store";
import { boundsOf } from "@/lib/canvas/bounds";
import { frameStage } from "@/lib/canvas/frameStage";
import { listen } from "@/lib/dom/listen";
import { chromeTakesPointer, type BoardLayers } from "../board/boardLayers";

// Placeholders are the only DOM under a raised canvas: wires, ports,
// labels and an open form all paint above it. A small margin takes in
// the corner anchors, which sit just outside the node's box.
const ANCHOR_MARGIN = 8;

/** Is the screen point over one of `panels`, anchors included? */
export function overPlaceholder(
  panels: PanelInstance[],
  vp: { x: number; y: number; scale: number },
  clientX: number,
  clientY: number,
): boolean {
  return panels.some((p) => {
    const b = boundsOf(p);
    const left = vp.x + b.x * vp.scale - ANCHOR_MARGIN;
    const top = vp.y + b.y * vp.scale - ANCHOR_MARGIN;
    return (
      clientX >= left && clientX <= left + b.w * vp.scale + 2 * ANCHOR_MARGIN &&
      clientY >= top && clientY <= top + b.h * vp.scale + 2 * ANCHOR_MARGIN
    );
  });
}

export function useCanvasPassThrough(
  containerRef: RefObject<HTMLDivElement | null>,
  stageRef: RefObject<Konva.Stage | null>,
  layersRef: RefObject<BoardLayers | null>,
  topLayer: TopLayer,
  activeTool: Tool,
): void {
  useEffect(() => {
    const stage = stageRef.current;
    const container = containerRef.current;
    const layers = layersRef.current;
    if (!stage || !container || !layers) return;

    // Frame and shape tools draw by dragging from empty space, which is exactly
    // what the pass-through below makes unreachable: it only turns the
    // container interactive where a shape already is. Without this exception
    // no frame could be drawn at all once an upload had raised the canvas.
    // While drawing, this container must receive the whole gesture: the
    // pass-through below only keeps it interactive where a shape already is,
    // which is exactly where a frame drag does NOT start.
    if (drawingTool(activeTool)) {
      container.style.pointerEvents = "auto";
      return;
    }

    const update = (e: PointerEvent) => {
      const r = container.getBoundingClientRect();
      const pt = { x: e.clientX - r.left, y: e.clientY - r.top };
      const hit = stage.getIntersection(pt);
      // The selection handles' canvas is over the Create nodes (#430): it
      // takes the pointer only on a handle, so a shape can be resized from a
      // corner a node covers, and everywhere else stays the node's.
      const handle = !!layers.chrome.getIntersection(pt);
      chromeTakesPointer(layers.chrome, handle);
      const overFrame = !!frameStage.current?.getIntersection(pt);
      // Two reasons to let a click through, and only where none of our own
      // shapes is under the cursor:
      //   over a placeholder, canvas in front — so it does not swallow
      //                     clicks meant for the Create node underneath
      //                     (the original reason)
      //   over bare frame — so the frames stage below can be clicked at all
      // Anywhere else stays interactive, or the background click that
      // deselects and disarms the tool would never arrive. It used to pass
      // through over ALL empty board while the canvas was in front -- which
      // it is after every upload -- so a click on empty board reached the page
      // instead, and an uploaded image stayed selected (#105). The wheel went
      // the same way, so zoom stopped working too.
      // Over a placeholder only an image, text or handle keeps the click: a
      // shape there is behind the node (#430), so the node gets it.
      const overPanel =
        topLayer === "canvas" &&
        overPlaceholder(useNodePanel.getState().panels, useViewport.getState(), e.clientX, e.clientY);
      const passThrough =
        (overPanel && !layers.main.getIntersection(pt) && !handle) || (overFrame && !hit);
      container.style.pointerEvents = passThrough ? "none" : "auto";
    };

    // Interactive until the pointer says otherwise, in either layer order:
    // empty board must always receive the click that deselects, and the
    // wheel. update() lifts it only over a placeholder or a bare frame.
    container.style.pointerEvents = "auto";
    const stop = listen(window, "pointermove", update);
    return () => {
      stop();
      container.style.pointerEvents = "auto";
      chromeTakesPointer(layers.chrome, false);
    };
  }, [containerRef, stageRef, layersRef, topLayer, activeTool]);
}
