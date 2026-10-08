"use client";

import dynamic from "next/dynamic";

// Konva and hotkeys-js both require browser APIs — skip SSR for all canvas components.
const Board = dynamic(() => import("@/app/canvas/components/Board"), { ssr: false });
const FloatingDock = dynamic(() => import("@/app/canvas/components/FloatingDock/FloatingDock"), { ssr: false });
const Minimap = dynamic(() => import("@/app/canvas/components/Minimap/Minimap"), { ssr: false });
const Sidebar = dynamic(() => import("@/app/canvas/components/Sidebar/Sidebar"), { ssr: false });
const NodePanel = dynamic(() => import("@/app/canvas/components/NodePanel/NodePanel"), { ssr: false });
const KonvaNodePorts = dynamic(() => import("@/app/canvas/components/KonvaNodePorts"), { ssr: false });
const KonvaNodeLabels = dynamic(() => import("@/app/canvas/components/KonvaNodeLabels"), { ssr: false });
const ConnectionOverlay = dynamic(() => import("@/app/canvas/components/ConnectionOverlay"), { ssr: false });

export default function CanvasPage() {
  return (
    <>
      <Sidebar />
      <Board />
      <ConnectionOverlay />
      <FloatingDock />
      <Minimap />
      <NodePanel />
      <KonvaNodePorts />
      <KonvaNodeLabels />
    </>
  );
}
