"use client";

import type { SidebarItemSpec } from "./items";

export default function SidebarItem({
  spec,
  active,
  onSelect,
}: {
  spec: SidebarItemSpec;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = spec.icon;
  return (
    <button
      type="button"
      // A real `disabled`, not an aria-only one: "not clickable" should be
      // true for the keyboard and the pointer alike, so the button also
      // drops out of the tab order rather than focusing into a dead end.
      disabled={!spec.available}
      onClick={onSelect}
      aria-current={active ? "page" : undefined}
      className={[
        "sidebar-item",
        active ? "sidebar-item-active" : "",
        spec.available ? "" : "sidebar-item-unavailable",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Icon className="sidebar-item-icon" aria-hidden />
      <span className="sidebar-item-label">{spec.label}</span>
    </button>
  );
}
