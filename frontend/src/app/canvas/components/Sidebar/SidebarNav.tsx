"use client";

import SidebarItem from "./SidebarItem";
import { SIDEBAR_ITEMS, type SectionId } from "./items";

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
  return (
    <nav className="sidebar-nav">
      <ul className="sidebar-nav-list">
        {SIDEBAR_ITEMS.map((spec) => (
          <li key={spec.id} title={spec.available ? undefined : "Coming soon"}>
            <SidebarItem
              spec={spec}
              active={spec.id === active}
              onSelect={() => onSelect(spec.id)}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}
