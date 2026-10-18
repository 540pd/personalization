"use client";

import { MoreHorizontal } from "lucide-react";
import type { SidebarItemSpec } from "./items";

export default function SidebarItem({
  spec,
  active,
  onSelect,
  menuOpen,
}: {
  spec: SidebarItemSpec;
  active: boolean;
  onSelect: () => void;
  /**
   * Set when a click on this item opens a menu rather than navigating -- the
   * active Playspace item while the rail is minimized (#197). Undefined for an
   * ordinary destination.
   */
  menuOpen?: boolean;
}) {
  const Icon = spec.icon;
  const opensMenu = menuOpen !== undefined;
  return (
    <button
      type="button"
      // A real `disabled`, not an aria-only one: "not clickable" should be
      // true for the keyboard and the pointer alike, so the button also
      // drops out of the tab order rather than focusing into a dead end.
      disabled={!spec.available}
      onClick={onSelect}
      aria-current={active ? "page" : undefined}
      aria-haspopup={opensMenu ? "menu" : undefined}
      aria-expanded={opensMenu ? menuOpen : undefined}
      className={[
        "sidebar-item",
        active ? "sidebar-item-active" : "",
        spec.available ? "" : "sidebar-item-unavailable",
        menuOpen ? "sidebar-item-menu-open" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Icon className="sidebar-item-icon" aria-hidden />
      <span className="sidebar-item-label">{spec.label}</span>
      {/* The only hint, minimized, that this icon has options. */}
      {opensMenu && (
        <span className="sidebar-options-dot" aria-hidden>
          <MoreHorizontal size={10} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}
