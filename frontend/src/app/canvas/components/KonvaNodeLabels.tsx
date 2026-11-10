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
import { useSettings } from "@/store/settings.store";
import { useHoveredNode } from "@/store/hover.store";
import { isCovered, konvaBlocker, labelProbe, type Blocker } from "@/lib/canvas/occlusion";
import { toScreen } from "@/lib/canvas/coords";
import NodeLabel from "./NodeLabel";
import { LABEL_GAP, LABEL_MIN_NODE_W } from "@/constants/canvas.constants";

// Same shape as KonvaNodePorts': who can block whom. The stacking rules
// themselves live in lib/canvas/occlusion.
function toBlockers(nodes: KonvaNodeRecord[], panels: PanelInstance[]): Blocker[] {
  return [
    ...nodes.map(konvaBlocker),
    ...panels.map((p): Blocker => ({ id: p.id, box: p, layer: "dom" })),
  ];
}

export default function KonvaNodeLabels() {
  const nodes = useKonvaNodes((s) => s.nodes);
  const panels = useNodePanel((s) => s.panels);
  const selectedIds = useKonvaSelection((s) => s.selectedIds);
  const topLayer = useLayerOrder((s) => s.topLayer);
  const vp = useViewport();
  const { scale } = vp;
  // Names off (#215): shown only on the hovered or a selected node.
  const alwaysNames = useSettings((s) => s.settings.showNodeNames);
  const hoveredId = useHoveredNode(!alwaysNames);

  const all = Object.values(nodes);
  const blockers = toBlockers(all, panels);

  return (
    <>
      {all.map((n) => {
        if (!n.label) return null;
        const screenW = n.canvasW * scale;
        if (screenW < LABEL_MIN_NODE_W) return null;

        const self = konvaBlocker(n);
        const selected = selectedIds.includes(n.id);
        if (!selected && isCovered(labelProbe(n, scale), self, blockers, topLayer)) return null;
        const topLeft = toScreen({ x: n.canvasX, y: n.canvasY }, vp);

        return (
          <NodeLabel
            key={n.id}
            value={n.label}
            left={topLeft.x}
            bottom={topLeft.y - LABEL_GAP}
            maxWidth={screenW}
            onCommit={(next) => useKonvaNodes.getState().upsert({ ...n, label: next })}
            hidden={!alwaysNames && !selected && hoveredId !== n.id}
          />
        );
      })}
    </>
  );
}
