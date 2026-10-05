"use client";

// Renders an output port (right edge) for every registered Konva node
// (uploaded images, demo node, etc.) — always visible, not just when selected.

import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useViewport } from "@/store/viewport.store";
import { useConnectionStore } from "@/store/connection.store";

const PORT_D = 10;
// Ports are a half-disc arc carved into the node, mouth facing the wire: an
// output opens right, an input opens left. The chord on the mouth side is
// hidden so nothing crosses the wire, which leaves from the mouth's centre.
const PORT_W = PORT_D / 2;
// Transparent padding so the clickable target stays larger than the visual.
const HIT_PAD = 5;

export default function KonvaNodePorts() {
  const nodes = useKonvaNodes((s) => s.nodes);
  const { x: stageX, y: stageY, scale } = useViewport();

  return (
    <>
      {Object.values(nodes).map((n) => {
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
              top:    screenY + screenH * 0.3,
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
