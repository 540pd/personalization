"use client";

import dynamic from "next/dynamic";

// Konva and hotkeys-js both require browser APIs — skip SSR for both.
const Board = dynamic(() => import("@/components/canvas/Board"), { ssr: false });
const FloatingDock = dynamic(() => import("@/components/canvas/FloatingDock"), { ssr: false });

export default function CanvasPage() {
  return (
    <>
      <Board />
      <FloatingDock />
    </>
  );
}
