"use client";

import dynamic from "next/dynamic";

// Konva and hotkeys-js both require browser APIs — skip SSR for all canvas components.
const Board = dynamic(() => import("@/components/canvas/Board"), { ssr: false });
const FloatingDock = dynamic(() => import("@/components/canvas/FloatingDock"), { ssr: false });
const Minimap = dynamic(() => import("@/components/canvas/Minimap"), { ssr: false });
const NodePanel = dynamic(() => import("@/components/canvas/NodePanel"), { ssr: false });
const KonvaNodePorts = dynamic(() => import("@/components/canvas/KonvaNodePorts"), { ssr: false });
const ConnectionOverlay = dynamic(() => import("@/components/canvas/ConnectionOverlay"), { ssr: false });

export default function CanvasPage() {
  return (
    <>
      <Board />
      <ConnectionOverlay />
      <FloatingDock />
      <Minimap />
      <NodePanel />
      <KonvaNodePorts />
    </>
  );
}
