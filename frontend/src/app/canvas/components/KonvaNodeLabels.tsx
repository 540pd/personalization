"use client";

// File name shown above an uploaded image while it is selected. The label UI
// itself lives in NodeLabel, shared with Create Image panels.

import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useViewport } from "@/store/viewport.store";
import NodeLabel, { LABEL_GAP, LABEL_MIN_NODE_W } from "./NodeLabel";

export default function KonvaNodeLabels() {
  const nodes = useKonvaNodes((s) => s.nodes);
  const selectedIds = useKonvaSelection((s) => s.nodeIds);
  const { x: stageX, y: stageY, scale } = useViewport();

  return (
    <>
      {Object.values(nodes).map((n) => {
        if (!n.label || !selectedIds.includes(n.id)) return null;
        const screenW = n.canvasW * scale;
        if (screenW < LABEL_MIN_NODE_W) return null;
        return (
          <NodeLabel
            key={n.id}
            value={n.label}
            left={stageX + n.canvasX * scale}
            bottom={stageY + n.canvasY * scale - LABEL_GAP}
            maxWidth={screenW}
            onCommit={(next) => useKonvaNodes.getState().upsert({ ...n, label: next })}
          />
        );
      })}
    </>
  );
}
