"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Konva from "konva";
import { useViewport } from "@/store/viewport.store";
import { useToolStore, panningTool, cursorFor, drawingTool } from "@/store/tool.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useLayerOrder } from "@/store/layerOrder.store";
import { useConnectionStore } from "@/store/connection.store";
import { boardIsShown } from "@/store/section.store";
import { canvasHistory } from "@/lib/canvas/history";
import { boardStage } from "@/lib/canvas/boardStage";
import { disposeAll } from "@/lib/dom/listen";
import { canvasArea } from "../canvasArea";
import { createUploadHandler, uploadEvent } from "../board/upload";
import { listenForDrops } from "../board/dragDrop";
import { listenForColorPicks } from "../board/recolor";
import { applyDraggability } from "../board/draggability";
import { createHoverOutline, type HoverOutline } from "../board/hoverOutline";
import { updateSelectionChrome as applySelectionChrome } from "../board/selectionChrome";
import { createSelectionTransformer, minResizeEdge } from "../board/transformer";
import { bindNodeChrome, createBoardContext } from "../board/boardContext";
import { registerKonvaHistory } from "../board/konvaHistory";
import { bindStageEvents } from "../board/stageEvents";
import { bindBoardShortcuts } from "../board/boardShortcuts";
import { createDrawTools } from "../board/drawTools";
import { bindBoardFile } from "../board/placeBoard";
import { restoreFrameImages } from "../board/frameImageStorage";
import { stackLayers, chromeTakesPointer, type BoardLayers } from "../board/boardLayers";
import DropOverlay from "./DropOverlay";
import { useCanvasPassThrough } from "./useCanvasPassThrough";

/** A canvas area no point is inside, for while another page covers the board. */
const NO_AREA = { left: 0, top: 0, width: -1, height: -1 };

export default function Board() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const layerRef = useRef<Konva.Layer | null>(null);
  // All three of the stage's canvases (#430): shapes, main and chrome.
  const layersRef = useRef<BoardLayers | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const hoverRef = useRef<HoverOutline | null>(null);
  const isSpacePanning = useRef(false);
  // Drives the drop affordance. State rather than a ref: it has to paint.
  const [dropActive, setDropActive] = useState(false);

  // Bound to the refs here so the effects below can call it with no
  // arguments; the drawing itself lives in board/selectionChrome.
  const updateSelectionChrome = useCallback(() => {
    const chrome = layersRef.current?.chrome;
    const transformer = transformerRef.current;
    if (!chrome || !transformer) return;
    applySelectionChrome(chrome, transformer);
  }, []);

  const { x, y, scale } = useViewport();
  const { activeTool } = useToolStore();
  const topLayer = useLayerOrder((s) => s.topLayer);

  // Mount Konva stage once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const stage = new Konva.Stage({
      container,
      width: container.offsetWidth,
      height: container.offsetHeight,
      draggable: false,
    });

    boardStage.current = stage;
    // Back to front: drawn shapes, then images and text, then the selection
    // chrome. Konva hit-tests them in that order whichever way their canvases
    // are stacked against the Create nodes (boardLayers.ts).
    const shapes = new Konva.Layer();
    const layer = new Konva.Layer();
    const chrome = new Konva.Layer();
    stage.add(shapes, layer, chrome);
    const layers: BoardLayers = { shapes, main: layer, chrome };
    layersRef.current = layers;
    stackLayers(layers, useLayerOrder.getState().topLayer);
    chromeTakesPointer(chrome, false);

    const transformer = createSelectionTransformer({
      // Boxes arrive in absolute (post-zoom) coords, so divide by the stage
      // scale to keep the floor zoom-independent.
      minEdge: () => minResizeEdge(transformer.nodes()),
      zoom: () => stage.scaleX(),
    });
    chrome.add(transformer);
    const hover = createHoverOutline(layer, transformer);

    stageRef.current = stage;
    layerRef.current = layer;
    transformerRef.current = transformer;
    hoverRef.current = hover;
    window.dispatchEvent(new Event("canvas:board-ready"));

    const board = createBoardContext({ stage, layer, shapes, transformer, hover, updateSelectionChrome });
    // Every listener below, removed together on unmount.
    const off: Array<() => void> = [];

    off.push(registerKonvaHistory(board));
    // A wire drag starts on a node the pointer is already over: its outline
    // goes, as only the wire's ports highlight while it's dragged (#460).
    off.push(useConnectionStore.subscribe((s, prev) => { if (s.drag && !prev.drag) hover.hide(); }));
    off.push(bindNodeChrome(board));

    // Snapshot initial state (demo node). A plain commit: saveSnapshot would
    // also save the frames' image positions, and this empty stage must not
    // overwrite them before restoreFrameImages has read them.
    canvasHistory.clear();
    canvasHistory.commit();
    let disposed = false;
    void restoreFrameImages(layer).then(() => {
      if (disposed) return;
      board.applyDraggability();
      board.syncAllNodeGeometry();
      // Restoring bitmaps is hydration, not a user edit. The completed board
      // is the first undo state; Ctrl+Z must not remove restored images.
      canvasHistory.clear();
      canvasHistory.commit();
    });

    const draw = createDrawTools(board);
    off.push(draw.dispose);
    off.push(bindStageEvents(board, { spacePan: isSpacePanning, consumeEndedDraw: draw.consumeEndedDraw }));
    off.push(bindBoardShortcuts(board, { spacePan: isSpacePanning, cancelDraw: draw.cancel }));

    // Place uploaded files on the canvas, centered in the current viewport.
    off.push(uploadEvent.on(createUploadHandler(board)));
    off.push(listenForColorPicks(board));
    off.push(listenForDrops({
      // No canvas to drop on while another page covers it (#206): the drop is
      // still cancelled -- the browser must not navigate to the file -- but
      // nothing lands on the board and no affordance shows.
      area: () => (boardIsShown() ? canvasArea() : NO_AREA),
      setActive: setDropActive,
      onDrop: (files, at) => {
        uploadEvent.emit({ files, at });
      },
    }));

    // Clear, Open file, the restore after a reload and saving. Disposed
    // before the stage goes: a pending save reads it.
    off.push(bindBoardFile({ ...board, endGestures: draw.reset }));

    const observer = new ResizeObserver(() => {
      stage.width(container.offsetWidth);
      stage.height(container.offsetHeight);
    });
    observer.observe(container);
    off.push(() => observer.disconnect());

    return () => {
      disposed = true;
      disposeAll(off);
      boardStage.current = null;
      // Entries hold references into this layer, so they outlive their
      // meaning once the stage is gone.
      canvasHistory.clear();
      stage.destroy();
      stageRef.current = null;
      layerRef.current = null;
      layersRef.current = null;
      transformerRef.current = null;
      hoverRef.current = null;
    };
  }, [updateSelectionChrome]);

  // Sync viewport store → Konva stage.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.position({ x, y });
    stage.scale({ x: scale, y: scale });
    stage.batchDraw();
  }, [x, y, scale]);

  // When konvaSelection is cleared from outside (NodePanel/ConnectionOverlay click),
  // also clear the Konva transformer so the selection ring disappears.
  useEffect(() => {
    return useKonvaSelection.subscribe((s) => {
      if (!s.selectedIds.length && transformerRef.current && layersRef.current) {
        transformerRef.current.nodes([]);
        updateSelectionChrome();
        layersRef.current.chrome.batchDraw();
      }
    });
  }, [updateSelectionChrome]);

  // Which canvas is in front of the Create nodes. While a drawing tool is
  // armed the main canvas must be the top surface: a draw that crossed a
  // Create placeholder used to be lost, because the placeholder is a DOM
  // element above the canvas whenever the canvas is the lower layer, and the
  // browser retargets the rest of the gesture to it. Shapes stay behind
  // either way (#430).
  useEffect(() => {
    const layers = layersRef.current;
    if (layers) stackLayers(layers, drawingTool(activeTool) ? "canvas" : topLayer);
  }, [topLayer, activeTool]);

  useCanvasPassThrough(containerRef, stageRef, layersRef, topLayer, activeTool);

  // Switch between pointer (select) mode and pan mode.
  useEffect(() => {
    const stage = stageRef.current;
    const transformer = transformerRef.current;
    const layer = layerRef.current;
    if (!stage || !transformer || !layer) return;

    if (activeTool === "pointer") {
      stage.draggable(false);
      stage.container().style.cursor = "default";
      applyDraggability(stage);
    } else {
      // Frame draws on drag, so the stage must not pan underneath it. Every
      // other non-pointer tool still pans.
      stage.draggable(panningTool(activeTool));
      stage.container().style.cursor = cursorFor(activeTool);
      // A node's open form sits above the whole board (Z_INDEX.panelForm),
      // so a draw that crossed it would land on the form instead and nothing
      // would be drawn. Arming a drawing tool means the edit is over: fold the
      // form back to a selected node, the same as clicking its placeholder.
      if (drawingTool(activeTool)) {
        const { openId, closePanel } = useNodePanel.getState();
        if (openId) closePanel(openId);
      }
      transformer.nodes([]);
      updateSelectionChrome();
      hoverRef.current?.hide();
      applyDraggability(stage);
      layer.batchDraw();
    }
  }, [activeTool, updateSelectionChrome]);

  return (
    <>
      <div
        ref={containerRef}
        style={{
          // No z-index, and not fixed: either would make this a stacking
          // context, and the stage's three canvases could then only move
          // together. Each takes its own z-index instead (#430): shapes
          // behind the Create nodes, images and text flipping above or below
          // them, the selection chrome over them. See boardLayers.ts.
          position: "absolute",
          inset: 0,
          overflow: "hidden",
        }}
      />
      {dropActive && <DropOverlay />}
    </>
  );
}
