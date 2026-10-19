"use client";

import { PanelLeft } from "lucide-react";
import RailTip from "./RailTip";
import { SIDEBAR_ITEMS, type SectionId } from "./items";

/** The page after "Studio /": the board keeps its product spelling. */
function pageName(section: SectionId): string {
  if (section === "playspace") return "PlaySpace";
  // Not a rail item (#214), so the header is the one place that says where you are.
  if (section === "settings") return "Settings";
  return SIDEBAR_ITEMS.find((i) => i.id === section)?.label ?? "PlaySpace";
}

/**
 * Product lockup plus the collapse toggle.
 *
 * Minimized, the lockup shrinks to the brandmark and the name moves into its
 * tooltip. The toggle stays visible below the mark rather than appearing on
 * hover: the way back to the full rail should never have to be discovered.
 */
export default function SidebarHeader({
  minimized,
  section,
  onToggle,
}: {
  minimized: boolean;
  section: SectionId;
  onToggle: () => void;
}) {
  const page = pageName(section);
  const toggleLabel = minimized ? "Expand sidebar" : "Collapse sidebar";
  return (
    <div className="sidebar-header">
      <RailTip content={`Studio / ${page}`}>
        <span className="sidebar-brandmark" aria-hidden>
          &gt;
        </span>
      </RailTip>
      <span className="sidebar-product">
        Studio <span className="sidebar-product-sep">/</span>{" "}
        <span className="sidebar-product-app">{page}</span>
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
