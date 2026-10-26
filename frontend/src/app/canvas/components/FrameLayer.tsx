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

import { useEffect, useRef, useState } from "react";
import { useFrames } from "@/store/frame.store";
import { useViewport } from "@/store/viewport.store";
import { disposeAll } from "@/lib/dom/listen";
import { boardStage } from "@/lib/canvas/boardStage";
import { createFrameStage, type FrameStage } from "../board/createFrameStage";
import { selectFrameRects } from "../board/frameRects";
import { bindFrameHover } from "../board/frameHover";
import { bindFrames } from "../board/frameBindings";
import FrameLabels from "./FrameLabels";
import AutoLayoutDropLine from "./AutoLayoutDropLine";
import { Z_INDEX } from "@/constants/canvas.constants";

export default function FrameLayer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const partsRef = useRef<FrameStage | null>(null);

  const frames = useFrames((s) => s.frames);
  const draft = useFrames((s) => s.draft);
  const selectedIds = useFrames((s) => s.selectedIds);
  const { x: stageX, y: stageY, scale } = useViewport();
  const [boardReady, setBoardReady] = useState(false);

  // Restored frames are present on the first render. Do not construct their
  // stage before Board's: other canvas code assumes Board is Konva.stages[0].
  useEffect(() => {
    if (boardStage.current) { setBoardReady(true); return; }
    const ready = () => setBoardReady(true);
    window.addEventListener("canvas:board-ready", ready);
    return () => window.removeEventListener("canvas:board-ready", ready);
  }, []);

  // --- Create the stage lazily, on the first frame ---
  //
  // Not on mount: Konva.stages is append-ordered and a second stage existing
  // from page load would shift every index. Board's stage stays stages[0] for
  // anything that reaches for it, and a board with no frames pays nothing.
  const ensureStage = () => {
    if (!partsRef.current && containerRef.current) partsRef.current = createFrameStage(containerRef.current);
    return partsRef.current;
  };

  useEffect(() => {
    const off = [bindFrames(), bindFrameHover(() => partsRef.current)];
    return () => {
      disposeAll(off);
      partsRef.current?.dispose();
      partsRef.current = null;
    };
  }, []);

  // --- Follow the shared viewport, so frames pan and zoom with the board ---
  useEffect(() => {
    const stage = partsRef.current?.stage;
    if (!stage) return;
    stage.position({ x: stageX, y: stageY });
    stage.scale({ x: scale, y: scale });
    stage.batchDraw();
  }, [stageX, stageY, scale]);

  // --- Rebuild the frame rects whenever the store changes ---
  useEffect(() => {
    if (!boardReady) return;
    if (!Object.keys(frames).length && !partsRef.current) return;
    ensureStage()?.rects.render(frames);
  }, [frames, boardReady]);

  // --- Attach the transformer to whatever is selected ---
  //
  // Keeps `frames` in its deps so it re-attaches to the new rects after a
  // rebuild, rather than pointing at destroyed ones.
  useEffect(() => {
    const parts = partsRef.current;
    if (parts) selectFrameRects(parts.layer, parts.transformer, selectedIds);
  }, [frames, selectedIds]);

  // --- The rectangle being dragged out right now ---
  useEffect(() => {
    (draft ? ensureStage() : partsRef.current)?.showDraft(draft);
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
      <FrameLabels />
      <AutoLayoutDropLine />
    </>
  );
}
