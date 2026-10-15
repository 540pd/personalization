"use client";

import { PanelLeft } from "lucide-react";
import RailTip from "./RailTip";

const PRODUCT = "Studio / PlaySpace";

/**
 * Product lockup plus the collapse toggle.
 *
 * Minimized, the lockup shrinks to the brandmark and the name moves into its
 * tooltip. The toggle stays visible below the mark rather than appearing on
 * hover: the way back to the full rail should never have to be discovered.
 */
export default function SidebarHeader({
  minimized,
  onToggle,
}: {
  minimized: boolean;
  onToggle: () => void;
}) {
  const toggleLabel = minimized ? "Expand sidebar" : "Collapse sidebar";
  return (
    <div className="sidebar-header">
      <RailTip content={PRODUCT}>
        <span className="sidebar-brandmark" aria-hidden>
          &gt;
        </span>
      </RailTip>
      <span className="sidebar-product">
        Studio <span className="sidebar-product-sep">/</span>{" "}
        <span className="sidebar-product-app">PlaySpace</span>
      </span>
      <RailTip content={toggleLabel}>
        <button
          type="button"
          onClick={onToggle}
          className="sidebar-collapse-button"
          // A tooltip replaces `title` while minimized; expanded, the native
          // hint is still the only one.
          title={minimized ? undefined : toggleLabel}
          aria-label={toggleLabel}
          aria-expanded={!minimized}
        >
          <PanelLeft size={16} aria-hidden />
        </button>
      </RailTip>
    </div>
  );
}
