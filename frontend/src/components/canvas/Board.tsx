"use client";

import { useEffect, useRef } from "react";
import Konva from "konva";
import { useViewport } from "@/lib/viewport";
import { useToolStore } from "@/lib/toolStore";

export default function Board() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const layerRef = useRef<Konva.Layer | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const isSpacePanning = useRef(false);

  const { x, y, scale } = useViewport();
  const { activeTool } = useToolStore();

  // Mount Konva stage once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const stage = new Konva.Stage({
      container,
      width: container.offsetWidth,
      height: container.offsetHeight,
      draggable: false, // pointer is the default tool; panning is disabled
    });

    const layer = new Konva.Layer();
    stage.add(layer);

    // Demo node — placeholder so pointer/transformer ACs are testable before
    // real image nodes are added via the Generate Image panel.
    const demoNode = new Konva.Rect({
      id: "demo-node",
      x: 200,
      y: 150,
      width: 240,
      height: 160,
      fill: "#1e1e2e",
      stroke: "#6b6b8a",
      strokeWidth: 1.5,
      cornerRadius: 8,
      name: "selectable",
      draggable: true,
    });
    layer.add(demoNode);

    // Transformer — attached to selected node, drawn on top of all shapes.
    const transformer = new Konva.Transformer({
      rotateEnabled: true,
      borderStroke: "#6366f1",
      borderStrokeWidth: 1.5,
      anchorStroke: "#6366f1",
      anchorFill: "#ffffff",
      anchorSize: 8,
      anchorCornerRadius: 2,
      padding: 4,
    });
    layer.add(transformer);

    stageRef.current = stage;
    layerRef.current = layer;
    transformerRef.current = transformer;

    // Click to select / deselect.
    stage.on("click tap", (e) => {
      if (useToolStore.getState().activeTool !== "pointer") return;

      if (e.target === stage) {
        transformer.nodes([]);
        layer.batchDraw();
        return;
      }

      if (e.target.hasName("selectable")) {
        transformer.nodes([e.target as Konva.Shape]);
        layer.batchDraw();
      }
    });

    // Wheel → zoom toward cursor.
    stage.on("wheel", (e) => {
      e.evt.preventDefault();
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      useViewport.getState().zoomToPoint(e.evt.deltaY, pointer.x, pointer.y);
    });

    // Drag end → persist pan position. Filter out node drag events that bubble up.
    stage.on("dragend", (e) => {
      if (e.target !== stage) return;
      useViewport.getState().setPosition(stage.x(), stage.y());
    });

    // Cursor: move over selectable nodes in pointer mode.
    stage.on("mouseover", (e) => {
      if (useToolStore.getState().activeTool !== "pointer") return;
      if (e.target !== stage && e.target.hasName("selectable")) {
        stage.container().style.cursor = "move";
      }
    });
    stage.on("mouseout", (e) => {
      if (e.target !== stage && e.target.hasName("selectable")) {
        const tool = useToolStore.getState().activeTool;
        stage.container().style.cursor = tool === "pointer" ? "default" : "grab";
      }
    });

    // Cursor: grabbing while panning (regular pan mode or space-pan).
    stage.on("mousedown", () => {
      if (isSpacePanning.current || useToolStore.getState().activeTool !== "pointer") {
        stage.container().style.cursor = "grabbing";
      }
    });
    stage.on("mouseup", () => {
      if (isSpacePanning.current) {
        stage.container().style.cursor = "grab";
      } else if (useToolStore.getState().activeTool !== "pointer") {
        stage.container().style.cursor = "grab";
      }
    });

    // Space-to-pan: temporarily enable dragging regardless of active tool.
    const handleSpaceDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code !== "Space" || isSpacePanning.current) return;
      e.preventDefault();
      isSpacePanning.current = true;
      stage.draggable(true);
      stage.container().style.cursor = "grab";
    };
    const handleSpaceUp = (e: KeyboardEvent) => {
      if (e.code !== "Space" || !isSpacePanning.current) return;
      isSpacePanning.current = false;
      const tool = useToolStore.getState().activeTool;
      if (tool === "pointer") {
        stage.draggable(false);
        stage.container().style.cursor = "default";
      } else {
        stage.container().style.cursor = "grab";
      }
    };
    window.addEventListener("keydown", handleSpaceDown);
    window.addEventListener("keyup", handleSpaceUp);

    const observer = new ResizeObserver(() => {
      stage.width(container.offsetWidth);
      stage.height(container.offsetHeight);
    });
    observer.observe(container);

    return () => {
      window.removeEventListener("keydown", handleSpaceDown);
      window.removeEventListener("keyup", handleSpaceUp);
      observer.disconnect();
      stage.destroy();
      stageRef.current = null;
      layerRef.current = null;
      transformerRef.current = null;
    };
  }, []);

  // Sync viewport store → Konva stage.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.position({ x, y });
    stage.scale({ x: scale, y: scale });
    stage.batchDraw();
  }, [x, y, scale]);

  // Switch between pointer (select) mode and pan mode.
  useEffect(() => {
    const stage = stageRef.current;
    const transformer = transformerRef.current;
    const layer = layerRef.current;
    if (!stage || !transformer || !layer) return;

    if (activeTool === "pointer") {
      stage.draggable(false);
      stage.container().style.cursor = "default";
      (stage.find(".selectable") as Konva.Shape[]).forEach((n) => n.draggable(true));
    } else {
      stage.draggable(true);
      stage.container().style.cursor = "grab";
      transformer.nodes([]);
      (stage.find(".selectable") as Konva.Shape[]).forEach((n) => n.draggable(false));
      layer.batchDraw();
    }
  }, [activeTool]);

  return (
    <div
      ref={containerRef}
      style={{ position: "fixed", inset: 0, overflow: "hidden" }}
    />
  );
}
