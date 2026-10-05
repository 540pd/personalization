"use client";

// Renders an output port (right edge) for every registered Konva node
// (uploaded images, demo node, etc.) — always visible, not just when selected.

import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useViewport } from "@/store/viewport.store";
import { useConnectionStore } from "@/store/connection.store";
import { PORT_FRACTION, PORT_STYLE } from "@/constants/canvas.constants";

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
              ...PORT_STYLE,
              left: screenX + screenW,
              top:  screenY + screenH * PORT_FRACTION,
            }}
          />
        );
      })}
    </>
  );
}
