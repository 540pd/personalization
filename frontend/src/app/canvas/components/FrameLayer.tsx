"use client";

// The frames surface: a second Konva stage that always paints behind
// everything else.
//
// A stage of its own rather than a layer on Board's, because a Konva Layer is
// a <canvas> INSIDE the stage container, and that container is what moves
// between Z_INDEX.canvasBelow and canvasAbove. A child cannot escape its
// parent's stacking context, so nothing drawn on the main stage can be
// reliably below the placeholders that sit between those two positions.
//
// This container sits at Z_INDEX.frames and never flips.

import { useEffect, useRef } from "react";
import Konva from "konva";
import { useFrames } from "@/store/frame.store";
import { selectOnly } from "@/lib/canvas/selection";
import { useViewport } from "@/store/viewport.store";
import { frameStage } from "@/lib/canvas/frameStage";
import { canvasHistory } from "@/lib/canvas/history";
import { membersOf, moveMembers, type FrameMembers } from "../board/frameMembers";
import NodeLabel from "./NodeLabel";
import {
  COLORS,
  FRAME_CORNER_RADIUS,
  LABEL_GAP,
  LABEL_MIN_NODE_W,
  Z_INDEX,
} from "@/constants/canvas.constants";

export default function FrameLayer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const layerRef = useRef<Konva.Layer | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const previewRef = useRef<Konva.Rect | null>(null);
  // Membership is fixed when the drag starts, so a node is not picked up or
  // dropped halfway through just because the frame swept over it.
  const membersRef = useRef<FrameMembers>({ images: [], panels: [] });
  const dragFromRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const frames = useFrames((s) => s.frames);
  const draft = useFrames((s) => s.draft);
  const selectedIds = useFrames((s) => s.selectedIds);
  const drag = useFrames((s) => s.drag);
  const { x: stageX, y: stageY, scale } = useViewport();

  // --- Create the stage lazily, on the first frame ---
  //
  // Not on mount: Konva.stages is append-ordered and a second stage existing
  // from page load would shift every index. Board's stage stays stages[0] for
  // anything that reaches for it, and a board with no frames pays nothing.
  const observerRef = useRef<ResizeObserver | null>(null);

  const ensureStage = () => {
    if (stageRef.current) return stageRef.current;
    const container = containerRef.current;
    if (!container) return null;

    const stage = new Konva.Stage({
      container,
      width: container.offsetWidth,
      height: container.offsetHeight,
      x: useViewport.getState().x,
      y: useViewport.getState().y,
      scaleX: useViewport.getState().scale,
      scaleY: useViewport.getState().scale,
    });
    const layer = new Konva.Layer();
    stage.add(layer);

    const transformer = new Konva.Transformer({
      rotateEnabled: false,
      borderStroke: COLORS.selected,
      anchorStroke: COLORS.selected,
      anchorSize: 8,
      ignoreStroke: true,
    });
    layer.add(transformer);

    // A click that misses every frame clears the frame selection. Clicks that
    // land on a node never reach this stage at all -- Board keeps its own
    // container interactive except over bare frame.
    stage.on("click tap", (e) => {
      if (e.target === stage) selectOnly(null);
    });

    const observer = new ResizeObserver(() => {
      stage.width(container.offsetWidth);
      stage.height(container.offsetHeight);
    });
    observer.observe(container);

    stageRef.current = stage;
    layerRef.current = layer;
    transformerRef.current = transformer;
    observerRef.current = observer;
    frameStage.current = stage;
    return stage;
  };

  useEffect(() => () => {
    observerRef.current?.disconnect();
    frameStage.current = null;
    stageRef.current?.destroy();
    stageRef.current = null;
    layerRef.current = null;
    transformerRef.current = null;
    previewRef.current = null;
  }, []);

  // --- Join the shared undo timeline ---
  //
  // An adapter rather than a private stack: history.ts exists because two
  // competing stacks made Ctrl+Z non-chronological across node kinds.
  useEffect(() =>
    canvasHistory.register("frames", {
      capture: () => ({ ...useFrames.getState().frames }),
      restore: (snap) =>
        useFrames.getState().replaceAll({ ...(snap as Record<string, never>) }),
    }),
  []);

  // --- Follow the shared viewport, so frames pan and zoom with the board ---
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.position({ x: stageX, y: stageY });
    stage.scale({ x: scale, y: scale });
    stage.batchDraw();
  }, [stageX, stageY, scale]);

  // --- Rebuild the frame rects whenever the store changes ---
  //
  // Rebuild rather than reconcile: a board holds a handful of frames, and
  // writes only happen on dragend/transformend, so this never runs mid-gesture.
  useEffect(() => {
    if (!Object.keys(frames).length && !stageRef.current) return;
    ensureStage();
    const layer = layerRef.current;
    if (!layer) return;

    layer.find(".frame").forEach((n) => n.destroy());

    Object.values(frames).forEach((f) => {
      const rect = new Konva.Rect({
        id: f.id,
        name: "frame",
        x: f.canvasX, y: f.canvasY, width: f.canvasW, height: f.canvasH,
        fill: COLORS.frameFill,
        stroke: COLORS.frameStroke,
        strokeWidth: 1,
        strokeScaleEnabled: false,
        cornerRadius: FRAME_CORNER_RADIUS,
        draggable: true,
      });

      rect.on("mousedown touchstart", () => {
        // Takes the selection off nodes, panels and wires, so Delete can only
        // mean one thing.
        selectOnly("frame");
        useFrames.getState().select(f.id);
      });

      rect.on("dragstart", () => {
        membersRef.current = membersOf(f);
        dragFromRef.current = { x: rect.x(), y: rect.y() };
      });

      rect.on("dragmove", () => {
        const dx = rect.x() - dragFromRef.current.x;
        const dy = rect.y() - dragFromRef.current.y;
        // Everything resting on the frame travels with it.
        moveMembers(membersRef.current, dx, dy);
        // And the name keeps up, instead of arriving when the drag ends.
        useFrames.getState().setDrag(f.id, { dx, dy });
      });

      rect.on("dragend", () => {
        const dx = rect.x() - dragFromRef.current.x;
        const dy = rect.y() - dragFromRef.current.y;
        moveMembers(membersRef.current, dx, dy);
        membersRef.current = { images: [], panels: [] };
        useFrames.getState().clearDrag();
        useFrames.getState().upsert({ ...f, canvasX: rect.x(), canvasY: rect.y() });
        // One step for the frame and everything it carried.
        canvasHistory.commit();
      });

      // Konva scales rather than resizes, so bake the scale back into width
      // and height -- otherwise the 1px border would be scaled too and the
      // stored size would not match what is drawn.
      rect.on("transformend", () => {
        const w = Math.max(1, rect.width() * rect.scaleX());
        const h = Math.max(1, rect.height() * rect.scaleY());
        rect.scale({ x: 1, y: 1 });
        rect.size({ width: w, height: h });
        useFrames.getState().upsert({
          ...f, canvasX: rect.x(), canvasY: rect.y(), canvasW: w, canvasH: h,
        });
      });

      layer.add(rect);
      rect.moveToBottom();
    });

    layer.batchDraw();
  }, [frames]);

  // --- Attach the transformer to whatever is selected ---
  //
  // Deliberately NOT part of the rebuild above. Selecting a frame happens on
  // mousedown, which is the first half of a drag -- so folding this into the
  // rebuild destroys the very rect the gesture is holding, and the frame
  // stops moving. It survived single-id selection only because setting the
  // same id twice returned the identical string and React bailed out; a
  // selectedIds array is a fresh reference every time and does not.
  //
  // Keeps `frames` in its deps so it re-attaches to the new rects after a
  // rebuild, rather than pointing at destroyed ones.
  useEffect(() => {
    const layer = layerRef.current;
    const transformer = transformerRef.current;
    if (!layer || !transformer) return;

    const selected = selectedIds
      .map((id) => layer.findOne<Konva.Rect>(`#${id}`))
      .filter((r): r is Konva.Rect => !!r);
    transformer.nodes(selected);
    transformer.moveToTop();
    layer.batchDraw();
  }, [frames, selectedIds]);

  // --- The rectangle being dragged out right now ---
  useEffect(() => {
    if (draft) ensureStage();
    const layer = layerRef.current;
    if (!layer) return;

    if (!draft) {
      previewRef.current?.destroy();
      previewRef.current = null;
      layer.batchDraw();
      return;
    }

    if (!previewRef.current) {
      previewRef.current = new Konva.Rect({
        fill: COLORS.frameFill,
        stroke: COLORS.selected,
        strokeWidth: 1,
        strokeScaleEnabled: false,
        dash: [4, 4],
        cornerRadius: FRAME_CORNER_RADIUS,
        listening: false,
      });
      layer.add(previewRef.current);
    }
    previewRef.current.setAttrs(draft);
    previewRef.current.moveToBottom();
    layer.batchDraw();
  }, [draft]);

  return (
    <>
      <div
        ref={containerRef}
        style={{
          position: "fixed",
          inset: 0,
          // Behind every node, whichever way the canvas/placeholder flip sits.
          zIndex: Z_INDEX.frames,
        }}
      />
      {/* Names render as siblings, not children: this container has a z-index
          and so forms a stacking context, which a label inside could never
          escape to reach Z_INDEX.labels. */}
      {Object.values(frames).map((f) => {
        // While this frame is being dragged its rect has moved but its record
        // has not, so the name reads the live offset to stay with it.
        const dx = drag[f.id]?.dx ?? 0;
        const dy = drag[f.id]?.dy ?? 0;
        const screenW = f.canvasW * scale;
        if (screenW < LABEL_MIN_NODE_W) return null;
        return (
          <NodeLabel
            key={f.id}
            value={f.label}
            left={stageX + (f.canvasX + dx) * scale}
            bottom={stageY + (f.canvasY + dy) * scale - LABEL_GAP}
            maxWidth={screenW}
            onCommit={(next) => useFrames.getState().upsert({ ...f, label: next })}
          />
        );
      })}
    </>
  );
}
