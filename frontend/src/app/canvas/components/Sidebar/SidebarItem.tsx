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
      onClick={onSelect}
      aria-current={active ? "page" : undefined}
      className={`sidebar-item ${active ? "sidebar-item-active" : ""}`}
    >
      <Icon className="sidebar-item-icon" aria-hidden />
      <span className="sidebar-item-label">{spec.label}</span>
    </button>
  );
}
