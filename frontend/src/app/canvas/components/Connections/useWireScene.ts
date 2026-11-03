"use client";

// What the wire rules (lib/canvas/wireTargets) know about the board, read
// from the stores (#466): every port on screen, the node under a point, a
// node's box, and whether it takes input.

import { useMemo } from "react";
import { useConnectionStore } from "@/store/connection.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { useKonvaNodes, type KonvaNodeRecord } from "@/store/konvaNodes.store";
import { useViewport } from "@/store/viewport.store";
import { boardCandidates } from "@/store/hover.store";
import { useLayerOrder } from "@/store/layerOrder.store";
import { hoverTargetAt } from "@/lib/canvas/hoverTarget";
import { boundsOf } from "@/lib/canvas/bounds";
import { toCanvas, toScreen } from "@/lib/canvas/coords";
import { inputPoint, outputPoint } from "@/lib/canvas/ports";
import type { WireScene } from "@/lib/canvas/wireTargets";
import { isSource, takesInput } from "../NodePanel/kinds";

/** An image on the board: wires start from it (#460). A drawn shape or text isn't wired. */
const isBoardImage = (n: KonvaNodeRecord) => !n.shape && !n.text;

export function useWireScene() {
  const connections = useConnectionStore((s) => s.connections);
  const panels = useNodePanel((s) => s.panels);
  const konvaNodes = useKonvaNodes((s) => s.nodes);
  const vp = useViewport();
  const panelById = useMemo(() => new Map(panels.map((p) => [p.id, p])), [panels]);

  const scene: WireScene = {
    vp,
    connections,
    // Only panels have input ports (images are output-only sources), and
    // not every kind: a Compose box takes no input (#181).
    inputPorts: panels.filter((p) => takesInput(p.kind)).map((p) => ({ nodeId: p.id, ...toScreen(inputPoint(p), vp) })),
    // Every output port: a source kind's, and an image's on the board (#460).
    outputPorts: [
      ...panels.filter((p) => isSource(p.kind)).map((p) => ({ nodeId: p.id, ...toScreen(outputPoint(p), vp) })),
      ...Object.values(konvaNodes).filter(isBoardImage).map((n) => ({ nodeId: n.id, ...toScreen(outputPoint(n), vp) })),
    ],
    // Found as for hover, topmost first (#458).
    nodeUnder: (at) => {
      const id = hoverTargetAt(toCanvas(at, vp), boardCandidates(), vp.scale, useLayerOrder.getState().topLayer);
      if (!id) return null;
      if (panelById.has(id)) return id;
      const k = konvaNodes[id];
      return k && isBoardImage(k) ? id : null;
    },
    boxOf: (id) => {
      const node = panelById.get(id) ?? konvaNodes[id];
      return node ? boundsOf(node) : null;
    },
    takesInput: (id) => {
      const p = panelById.get(id);
      return !!p && takesInput(p.kind);
    },
  };

  return { scene, panelById, konvaNodes };
}
