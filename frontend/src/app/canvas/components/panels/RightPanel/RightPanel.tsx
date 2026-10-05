"use client";

import { useState } from "react";
import ChatPanel from "../ChatPanel";
import AssetsPanel from "../AssetsPanel";
import SkillsPanel from "../SkillsPanel";
import "./RightPanel.scss";

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
      <div className="right-panel-collapsed">
        <button
          onClick={() => setCollapsed(false)}
          className="right-panel-expand-button"
          title="Expand panel"
        >
          ‹
        </button>
      </div>
    );
  }

  return (
    <div className="right-panel">
      {/* Tab bar */}
      <div className="right-panel-tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`right-panel-tab ${
              activeTab === tab.id ? "right-panel-tab-active" : ""
            }`}
          >
            {tab.label}
          </button>
        ))}

        <button
          onClick={() => setCollapsed(true)}
          className="right-panel-collapse-button"
          title="Collapse panel"
        >
          ›
        </button>
      </div>

      {/* Panel content */}
      <div className="right-panel-content">
        {activeTab === "chat" && <ChatPanel />}
        {activeTab === "assets" && <AssetsPanel />}
        {activeTab === "skills" && <SkillsPanel />}
      </div>
    </div>
  );
}