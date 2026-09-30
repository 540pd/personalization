"use client";

// Renders an output port (right edge) for every registered Konva node
// (uploaded images, demo node, etc.) — always visible, not just when selected.

import { useKonvaNodes } from "@/lib/konvaNodesStore";
import { useViewport } from "@/lib/viewport";
import { useConnectionStore } from "@/lib/connectionStore";

const PORT_D = 10;

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
              left:   screenX + screenW,
              top:    screenY + screenH * 0.3,
              width:  PORT_D,
              height: PORT_D,
              background:    "#fff",
              border:        "1.5px solid #000",
              borderRadius:  "50%",
              transform:     "translate(-50%, -50%)",
              cursor:        "crosshair",
              pointerEvents: "auto",
              zIndex:        51,
            }}
          />
        );
      })}
    </>
  );
}
