"use client";

// Renders an output port (right edge) for every registered Konva node
// (uploaded images, demo node, etc.), except where another node covers it.

import { useKonvaNodes, type KonvaNodeRecord } from "@/store/konvaNodes.store";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { useViewport } from "@/store/viewport.store";
import { useConnectionStore } from "@/store/connection.store";
import { isCovered, konvaBlocker, portProbe, type Blocker } from "@/lib/canvas/occlusion";
import { useLayerOrder } from "@/store/layerOrder.store";
import { outputPoint } from "@/lib/canvas/ports";
import { toScreen } from "@/lib/canvas/coords";
import { Z_INDEX } from "@/constants/canvas.constants";
import "./Connections.scss";

// Ports are DOM siblings above the single <canvas>, so they cannot interleave
// with shapes drawn inside it — every port would otherwise float over every
// image. Occlusion lives in lib/canvas/occlusion, which states the three
// stacking rules once; this just describes who can block whom.
function toBlockers(nodes: KonvaNodeRecord[], panels: PanelInstance[]): Blocker[] {
  return [
    ...nodes.map(konvaBlocker),
    ...panels.map((p): Blocker => ({ id: p.id, box: p, layer: "dom" })),
  ];
}

export default function KonvaNodePorts() {
  const nodes = useKonvaNodes((s) => s.nodes);
  const panels = useNodePanel((s) => s.panels);
  const topLayer = useLayerOrder((s) => s.topLayer);
  const { x: stageX, y: stageY, scale } = useViewport();
  const all = Object.values(nodes);
  // A port with a wire on it is drawn filled (#456).
  const connections = useConnectionStore((s) => s.connections);
  const wired = new Set(connections.map((c) => c.fromNodeId));
  const blockers = toBlockers(all, panels);

  return (
    <>
      {all.map((n) => {
        // A drawn shape is not a source, but it still covers the ports of
        // whatever is under it, so it stays in `blockers`.
        if (n.shape || n.text) return null;
        const self = konvaBlocker(n);
        // Konva nodes are source-only: a right-edge output port, no input.
        if (isCovered(portProbe(n, "output", scale), self, blockers, topLayer)) return null;
        // Port position is shared geometry; the grab area is centred on it.
        const pt = toScreen(outputPoint(n), { x: stageX, y: stageY, scale });

        return (
          <div
            key={n.id}
            title="Output"
            onPointerDown={(e) => {
              e.stopPropagation();
              useConnectionStore.getState().startDrag(n.id, "konva", e.clientX, e.clientY);
            }}
            // No text selection from the press that starts a wire (#184).
            onMouseDown={(e) => e.preventDefault()}
            className={wired.has(n.id) ? "board-port is-connected" : "board-port"}
            style={{ left: pt.x, top: pt.y, zIndex: Z_INDEX.ports }}
          >
            <div className="board-port-dot" />
          </div>
        );
      })}
    </>
  );
}
