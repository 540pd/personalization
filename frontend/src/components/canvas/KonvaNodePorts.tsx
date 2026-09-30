"use client";

// Renders HTML port overlays for selected Konva nodes (uploaded images, etc.).
// Konva nodes only have an input port (right edge) — they are source nodes,
// not generated nodes that also accept inputs.

import { useKonvaSelection } from "@/lib/konvaSelectionStore";
import { useViewport } from "@/lib/viewport";

const PORT_D = 10; // port circle diameter in px

export default function KonvaNodePorts() {
  const { nodeId, canvasX, canvasY, canvasW, canvasH } = useKonvaSelection();
  const { x: stageX, y: stageY, scale } = useViewport();

  if (!nodeId) return null;

  // Convert canvas-space top-left + size to screen-space.
  const screenX = stageX + canvasX * scale;
  const screenY = stageY + canvasY * scale;
  const screenW = canvasW * scale;
  const screenH = canvasH * scale;

  return (
    // Input port — right edge, 30% from top
    <div
      title="Input"
      style={{
        position: "fixed",
        left:   screenX + screenW,
        top:    screenY + screenH * 0.3,
        width:  PORT_D,
        height: PORT_D,
        background:   "#fff",
        border:       "1.5px solid #000",
        borderRadius: "50%",
        transform:    "translate(-50%, -50%)",
        cursor:       "crosshair",
        pointerEvents: "auto",
        zIndex: 51,
      }}
    />
  );
}
