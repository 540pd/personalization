"use client";

import { PanelLeft } from "lucide-react";

/**
 * Product lockup plus the collapse toggle.
 *
 * "GenOS / PlaySpace" is the product, not the brand -- the brand name is the
 * section label below, which is why the two are separate zones rather than
 * one breadcrumb.
 */
export default function SidebarHeader({ onToggle }: { onToggle: () => void }) {
  return (
    <div className="sidebar-header">
      <span className="sidebar-brandmark" aria-hidden>
        &gt;
      </span>
      <span className="sidebar-product">
        GenOS <span className="sidebar-product-sep">/</span>{" "}
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
