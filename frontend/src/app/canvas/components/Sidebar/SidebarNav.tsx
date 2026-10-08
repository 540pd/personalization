"use client";

import SidebarItem from "./SidebarItem";
import { SIDEBAR_ITEMS, type SectionId } from "./items";

/**
 * The brand label plus the destinations.
 *
 * `label` is static text, NOT a switcher. Luma's equivalent ("P Personal" with
 * an avatar badge and a chevron) is a dropdown, and the reference we are
 * following deliberately is not — it is a plain bold label showing the
 * current brand, which you change from the user menu's Brand entry. Worth
 * stating, because anyone comparing the two references will reach for a
 * chevron otherwise.
 */
export default function SidebarNav({
  label,
  active,
  onSelect,
}: {
  label: string;
  active: SectionId;
  onSelect: (id: SectionId) => void;
}) {
  return (
    <nav className="sidebar-nav">
      <p className="sidebar-brand-label">{label}</p>

      <ul className="sidebar-nav-list">
        {SIDEBAR_ITEMS.map((spec) => (
          <li key={spec.id}>
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
