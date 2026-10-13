"use client";

// File name shown above an uploaded image. The label UI itself lives in
// NodeLabel, shared with Create Image panels.
//
// Names are always on, not selection chrome: the label is what a downstream
// generation refers to a node by, so it is the most useful thing on the canvas
// to be able to read without clicking. That is also why a covered name hides,
// unlike before -- a name drawn over the node that covers it reads as
// belonging to that node, the same reasoning ports already follow. A selected
// node is the exception: selecting a buried node and getting no name back
// would defeat the point.

import { useKonvaNodes, type KonvaNodeRecord } from "@/store/konvaNodes.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { useLayerOrder } from "@/store/layerOrder.store";
import { useViewport } from "@/store/viewport.store";
import { isCovered, labelProbe, type Blocker } from "@/lib/canvas/occlusion";
import NodeLabel from "./NodeLabel";
import { LABEL_GAP, LABEL_MIN_NODE_W } from "@/constants/canvas.constants";

// Same shape as KonvaNodePorts': who can block whom. The stacking rules
// themselves live in lib/canvas/occlusion.
function toBlockers(nodes: KonvaNodeRecord[], panels: PanelInstance[]): Blocker[] {
  return [
    ...nodes.map((n): Blocker => ({ id: n.id, box: n, layer: "canvas", z: n.z })),
    ...panels.map((p): Blocker => ({ id: p.id, box: p, layer: "dom" })),
  ];
}

export default function KonvaNodeLabels() {
  const nodes = useKonvaNodes((s) => s.nodes);
  const panels = useNodePanel((s) => s.panels);
  const selectedIds = useKonvaSelection((s) => s.nodeIds);
  const topLayer = useLayerOrder((s) => s.topLayer);
  const { x: stageX, y: stageY, scale } = useViewport();

  const all = Object.values(nodes);
  const blockers = toBlockers(all, panels);

  return (
    <>
      {all.map((n) => {
        if (!n.label) return null;
        const screenW = n.canvasW * scale;
        if (screenW < LABEL_MIN_NODE_W) return null;

        const self: Blocker = { id: n.id, box: n, layer: "canvas", z: n.z };
        const selected = selectedIds.includes(n.id);
        if (!selected && isCovered(labelProbe(n, scale), self, blockers, topLayer)) return null;

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
