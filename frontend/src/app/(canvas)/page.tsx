"use client";

import dynamic from "next/dynamic";
import AuthGate from "@/auth/components/AuthGate";

// Konva and hotkeys-js both require browser APIs — skip SSR for all canvas components.
const Board = dynamic(() => import("@/app/canvas/components/Board"), { ssr: false });
const FrameLayer = dynamic(() => import("@/app/canvas/components/FrameLayer"), { ssr: false });
const FloatingDock = dynamic(() => import("@/app/canvas/components/FloatingDock/FloatingDock"), { ssr: false });
const Minimap = dynamic(() => import("@/app/canvas/components/Minimap/Minimap"), { ssr: false });
const Sidebar = dynamic(() => import("@/app/canvas/components/Sidebar/Sidebar"), { ssr: false });
const NodePanel = dynamic(() => import("@/app/canvas/components/NodePanel/NodePanel"), { ssr: false });
const KonvaNodePorts = dynamic(() => import("@/app/canvas/components/KonvaNodePorts"), { ssr: false });
const LineHandles = dynamic(() => import("@/app/canvas/components/LineHandles"), { ssr: false });
const ShapeStyleBar = dynamic(() => import("@/app/canvas/components/ShapeStyleBar/ShapeStyleBar"), { ssr: false });
const KonvaNodeLabels = dynamic(() => import("@/app/canvas/components/KonvaNodeLabels"), { ssr: false });
const BoardSyncBanner = dynamic(() => import("@/app/canvas/components/BoardSync/BoardSyncBanner"), { ssr: false });
const UploadBadges = dynamic(() => import("@/app/canvas/components/UploadBadges"), { ssr: false });
const ConnectionOverlay = dynamic(() => import("@/app/canvas/components/Connections/ConnectionOverlay"), { ssr: false });
const AssetsPage = dynamic(() => import("@/app/canvas/components/Assets/AssetsPage"), { ssr: false });
const SkillsPage = dynamic(() => import("@/app/canvas/components/Skills/SkillsPage"), { ssr: false });
const AgentsPage = dynamic(() => import("@/app/canvas/components/Agents/AgentsPage"), { ssr: false });
const SettingsPage = dynamic(() => import("@/app/canvas/components/Settings/SettingsPage"), { ssr: false });
const BrandPage = dynamic(() => import("@/app/canvas/components/Brand/BrandPage"), { ssr: false });

export default function CanvasPage() {
  return (
    <AuthGate>
      <Sidebar />
      {/* Before Board only for readability -- the stacking is by z-index, and
          frames sit below every other canvas surface. */}
      <FrameLayer />
      <Board />
      <ConnectionOverlay />
      <FloatingDock />
      <Minimap />
      <NodePanel />
      <KonvaNodePorts />
      <LineHandles />
      <ShapeStyleBar />
      <KonvaNodeLabels />
      <UploadBadges />
      <BoardSyncBanner />
      {/* Over the board, not instead of it: the board stays mounted (#206, #208, #214, #219). */}
      <AssetsPage />
      <SkillsPage />
      <AgentsPage />
      <SettingsPage />
      <BrandPage />
    </AuthGate>
  );
}
