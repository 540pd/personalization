"use client";

import { PanelLeft } from "lucide-react";

/** Product lockup plus the collapse toggle. */
export default function SidebarHeader({ onToggle }: { onToggle: () => void }) {
  return (
    <div className="sidebar-header">
      <span className="sidebar-brandmark" aria-hidden>
        &gt;
      </span>
      <span className="sidebar-product">
        Studio <span className="sidebar-product-sep">/</span>{" "}
        <span className="sidebar-product-app">PlaySpace</span>
      </span>
      <button
        type="button"
        onClick={onToggle}
        className="sidebar-collapse-button"
        title="Hide sidebar"
        aria-label="Hide sidebar"
      >
        <PanelLeft size={16} aria-hidden />
      </button>
    </div>
  );
}
