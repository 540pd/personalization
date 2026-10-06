"use client";

// Renders an output port (right edge) for every registered Konva node
// (uploaded images, demo node, etc.), except where another node covers it.

import { useKonvaNodes, type KonvaNodeRecord } from "@/store/konvaNodes.store";
import { useViewport } from "@/store/viewport.store";
import { useConnectionStore } from "@/store/connection.store";
import {
  OUTPUT_PORT_HIT_STYLE,
  OUTPUT_PORT_STYLE,
  PORT_FRACTION,
  PORT_HIT_PAD,
  PORT_WIDTH,
} from "@/constants/canvas.constants";

// Ports are DOM siblings above the single <canvas>, so they cannot interleave
// with shapes drawn inside it — every port would otherwise float over every
// image. Hide one when a higher-stacked node covers it, so a port never
// appears detached from its own node. Rectangle containment rather than pixel
// hit-testing: predictable, and no per-frame canvas reads. A transparent PNG
// on top therefore still counts as covering.
function isPortCovered(n: KonvaNodeRecord, all: KonvaNodeRecord[], scale: number): boolean {
  // The arc bulges inward, so the port's centre lies just inside its own node.
  const px = n.canvasX + n.canvasW - PORT_WIDTH / (2 * scale);
  const py = n.canvasY + n.canvasH * PORT_FRACTION;
  const nz = n.z ?? 0;
  return all.some(
    (m) =>
      m.id !== n.id &&
      (m.z ?? 0) > nz &&
      px >= m.canvasX &&
      px <= m.canvasX + m.canvasW &&
      py >= m.canvasY &&
      py <= m.canvasY + m.canvasH
  );
}

export default function KonvaNodePorts() {
  const nodes = useKonvaNodes((s) => s.nodes);
  const { x: stageX, y: stageY, scale } = useViewport();
  const all = Object.values(nodes);

  return (
    <>
      {all.map((n) => {
        if (isPortCovered(n, all, scale)) return null;
        const screenX = stageX + n.canvasX * scale;
        const screenY = stageY + n.canvasY * scale;
        const screenW = n.canvasW * scale;
        const screenH = n.canvasH * scale;

        return (
          <div
            key={n.id}
            title="Output"
            onPointerDown={(e) => {
              e.stopPropagation();
              useConnectionStore.getState().startDrag(n.id, "konva", e.clientX, e.clientY);
            }}
            style={{
              ...OUTPUT_PORT_HIT_STYLE,
              left: screenX + screenW - PORT_WIDTH - PORT_HIT_PAD,
              top:  screenY + screenH * PORT_FRACTION,
            }}
          >
            <div style={OUTPUT_PORT_STYLE} />
          </div>
        );
      })}
    </>
  );
}
