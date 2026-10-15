"use client";

import SidebarItem from "./SidebarItem";
import RailTip from "./RailTip";
import { SIDEBAR_ITEMS, type SectionId } from "./items";
import { useSidebar } from "@/store/sidebar.store";

/**
 * The destinations.
 *
 * The GCOS reference shows a bold "Default" label above this list. Dropped:
 * it is the brand name, it reads as a heading for a list it does not
 * describe, and until a brand can actually be chosen it is a constant. It
 * earns a place here only once the Brand page can change it.
 */
export default function SidebarNav({
  active,
  onSelect,
}: {
  active: SectionId;
  onSelect: (id: SectionId) => void;
}) {
  const minimized = useSidebar((s) => s.collapsed);
  return (
    <nav className="sidebar-nav">
      <ul className="sidebar-nav-list">
        {SIDEBAR_ITEMS.map((spec) => (
          // Expanded, the label is on screen and only "Coming soon" needs
          // saying. Minimized, the tooltip carries both, so the native title
          // goes -- two hints on one icon would race each other.
          <li key={spec.id} title={minimized || spec.available ? undefined : "Coming soon"}>
            <RailTip content={spec.available ? spec.label : `${spec.label} · Coming soon`}>
              <SidebarItem
                spec={spec}
                active={spec.id === active}
                onSelect={() => onSelect(spec.id)}
              />
            </RailTip>
          </li>
        ))}
      </ul>
    </nav>
  );
}
