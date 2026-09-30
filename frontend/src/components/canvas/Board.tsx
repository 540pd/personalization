"use client";

import { useEffect, useRef } from "react";
import Konva from "konva";
import { useViewport } from "@/lib/viewport";

// TODO: import canvas node factories (createImageNode etc.) and add them to
// the layer as features are implemented per issue specs.

export default function Board() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);

  // Sync viewport changes from the zustand store into the Konva stage.
  const { x, y, scale, setPosition, zoomToPoint } = useViewport();

  // Mount Konva stage once on first render.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const stage = new Konva.Stage({
      container,
      width: container.offsetWidth,
      height: container.offsetHeight,
      draggable: true,
    });

    const layer = new Konva.Layer();
    stage.add(layer);
    stageRef.current = stage;

    // Wheel → zoom toward cursor position.
    stage.on("wheel", (e) => {
      e.evt.preventDefault();
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      useViewport.getState().zoomToPoint(e.evt.deltaY, pointer.x, pointer.y);
    });

    // Drag end → persist position in viewport store.
    stage.on("dragend", () => {
      useViewport.getState().setPosition(stage.x(), stage.y());
    });

    // Keep stage dimensions in sync with the container.
    const observer = new ResizeObserver(() => {
      stage.width(container.offsetWidth);
      stage.height(container.offsetHeight);
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      stage.destroy();
      stageRef.current = null;
    };
  }, []);

  // Sync viewport store → Konva stage on every change.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.position({ x, y });
    stage.scale({ x: scale, y: scale });
    stage.batchDraw();
  }, [x, y, scale]);

  return (
    <div
      ref={containerRef}
      style={{ position: "fixed", inset: 0, overflow: "hidden" }}
    />
  );
}
