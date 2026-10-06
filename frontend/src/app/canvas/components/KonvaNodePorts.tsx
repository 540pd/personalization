"use client";

// Renders an output port (right edge) for every registered Konva node
// (uploaded images, demo node, etc.), except where another node covers it.

import { useKonvaNodes, type KonvaNodeRecord } from "@/store/konvaNodes.store";
import { useViewport } from "@/store/viewport.store";
import { useConnectionStore } from "@/store/connection.store";

const PORT_D = 10;
// Ports are a half-disc arc carved into the node, mouth facing the wire: an
// output opens right, an input opens left. The chord on the mouth side is
// hidden so nothing crosses the wire, which leaves from the mouth's centre.
const PORT_W = PORT_D / 2;
// Transparent padding so the clickable target stays larger than the visual.
const HIT_PAD = 5;
const PORT_FRACTION = 0.3; // must match NodePanel.tsx and ConnectionOverlay.tsx

// Ports are DOM siblings above the single <canvas>, so they cannot interleave
// with shapes drawn inside it — every port would otherwise float over every
// image. Hide one when a higher-stacked node covers it, so a port never
// appears detached from its own node. Rectangle containment rather than pixel
// hit-testing: predictable, and no per-frame canvas reads. A transparent PNG
// on top therefore still counts as covering.
function isPortCovered(n: KonvaNodeRecord, all: KonvaNodeRecord[], scale: number): boolean {
  // The arc bulges inward, so the port's centre lies just inside its own node.
  const px = n.canvasX + n.canvasW - PORT_W / (2 * scale);
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
              position: "fixed",
              left:   screenX + screenW - PORT_W - HIT_PAD,
              top:    screenY + screenH * PORT_FRACTION,
              width:  PORT_W + HIT_PAD * 2,
              height: PORT_D + HIT_PAD * 2,
              transform:      "translateY(-50%)",
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              cursor:        "crosshair",
              pointerEvents: "auto",
              zIndex:        51,
            }}
          >
            <div
              style={{
                width:  PORT_W,
                height: PORT_D,
                background:   "#fff",
                border:       "1.5px solid #000",
                borderRightColor: "transparent", // mouth faces the wire
                borderRadius: "999px 0 0 999px",
              }}
            />
          </div>
        );
      })}
    </>
  );
}
