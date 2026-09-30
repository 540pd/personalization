"use client";

import dynamic from "next/dynamic";

// Konva uses browser-only APIs (canvas, window). Skip SSR entirely so Next.js
// never tries to render it on the server.
const Board = dynamic(() => import("@/components/canvas/Board"), { ssr: false });

export default function CanvasPage() {
  return <Board />;
}
