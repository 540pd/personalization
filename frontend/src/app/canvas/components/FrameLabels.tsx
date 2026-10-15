"use client";

// Frame names, and whether each one is hidden behind a node (#108).
//
// Node names hide when something paints over them (#100): a name drawn on top
// of the node that covers it reads as that node's name. Frame names did not.
// A frame paints below everything, at Z_INDEX.frames, but its name is a DOM
// element at Z_INDEX.labels, above everything -- so a node resting over a
// frame's top-left had the frame's name drawn across it.
//
// Separate from FrameLayer so that following every node and panel, which this
// has to, re-renders only the names and not the layer's Konva bookkeeping.

import { useFrames, type FrameRecord } from "@/store/frame.store";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { useViewport } from "@/store/viewport.store";
import { boundsOf, contains, type NodeBox } from "@/lib/canvas/bounds";
import { labelProbe } from "@/lib/canvas/occlusion";
import { selectOnly } from "@/lib/canvas/selection";
import { dragFrameFrom } from "../board/frameDrag";
import NodeLabel from "./NodeLabel";
import { LABEL_GAP, LABEL_MIN_NODE_W } from "@/constants/canvas.constants";

/**
 * Is a frame's name, at `probe`, under any node?
 *
 * No paint-order rules, unlike isCovered: a frame is below every node on both
 * layers, so anything at all over its name covers it. Frame-to-frame is out of
 * scope -- a frame does not hide another frame's name.
 */
export function frameNameCovered(probe: { x: number; y: number }, nodes: NodeBox[]): boolean {
  return nodes.some((n) => contains(boundsOf(n), probe));
}

export default function FrameLabels() {
  const frames = useFrames((s) => s.frames);
  const selectedIds = useFrames((s) => s.selectedIds);
  const drag = useFrames((s) => s.drag);
  const resize = useFrames((s) => s.resize);
  const nodes = useKonvaNodes((s) => s.nodes);
  const panels = useNodePanel((s) => s.panels);
  const { x: stageX, y: stageY, scale } = useViewport();

  const covers: NodeBox[] = [...Object.values(nodes), ...panels];

  return (
    <>
      {Object.values(frames).map((f: FrameRecord) => {
        // While this frame is being dragged or resized its rect has changed
        // but its record has not, so the name reads the live box to stay with
        // it -- its position, its max width and what covers it.
        const box = resize[f.id];
        const dx = drag[f.id]?.dx ?? 0;
        const dy = drag[f.id]?.dy ?? 0;
        const live = box ? { ...f, ...box } : { ...f, canvasX: f.canvasX + dx, canvasY: f.canvasY + dy };
        const screenW = live.canvasW * scale;
        if (screenW < LABEL_MIN_NODE_W) return null;

        // A selected frame's name always shows, as a selected node's does: it
        // is the handle you are working with.
        const selected = selectedIds.includes(f.id);
        if (!selected && frameNameCovered(labelProbe(live, scale), covers)) return null;

        return (
          <NodeLabel
            key={f.id}
            value={f.label}
            left={stageX + live.canvasX * scale}
            bottom={stageY + live.canvasY * scale - LABEL_GAP}
            maxWidth={screenW}
            onCommit={(next) => useFrames.getState().upsert({ ...f, label: next })}
            // The name is a handle for the frame: drag it to move the frame
            // and its contents, click it to select the frame (#119).
            onDragFrom={(press) => dragFrameFrom(f, press)}
            onSelect={() => {
              selectOnly("frame");
              useFrames.getState().select(f.id);
            }}
          />
        );
      })}
    </>
  );
}
