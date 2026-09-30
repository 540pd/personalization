"use client";

// Luma reference: BOARD-01 §5 — Right panel with Chat, Assets, Skills tabs.
// Fixed to the right edge of the viewport. Collapsible.

import { useState } from "react";
import ChatPanel from "./ChatPanel";
import AssetsPanel from "./AssetsPanel";
import SkillsPanel from "./SkillsPanel";

type TabId = "chat" | "assets" | "skills";

const TABS: { id: TabId; label: string }[] = [
  { id: "chat", label: "Chat" },
  { id: "assets", label: "Assets" },
  { id: "skills", label: "Skills" },
];

export default function RightPanel() {
  const [activeTab, setActiveTab] = useState<TabId>("chat");
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div className="fixed right-0 top-0 h-full flex items-start pt-4 z-40">
        <button
          onClick={() => setCollapsed(false)}
          className="bg-neutral-900 border border-neutral-700 text-neutral-300 rounded-l-lg px-2 py-3 text-xs hover:bg-neutral-800"
          title="Expand panel"
        >
          ‹
        </button>
      </div>
    );
  }

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-neutral-950 border-l border-neutral-800 z-40 flex flex-col">
      {/* Tab bar */}
      <div className="flex items-center border-b border-neutral-800">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              "flex-1 py-3 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "text-white border-b-2 border-white"
                : "text-neutral-400 hover:text-neutral-200",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
        <button
          onClick={() => setCollapsed(true)}
          className="px-3 py-3 text-neutral-400 hover:text-white text-xs"
          title="Collapse panel"
        >
          ›
        </button>
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "chat" && <ChatPanel />}
        {activeTab === "assets" && <AssetsPanel />}
        {activeTab === "skills" && <SkillsPanel />}
      </div>
    </div>
  );
}
