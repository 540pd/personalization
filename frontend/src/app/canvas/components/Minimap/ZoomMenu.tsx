"use client";

// Luma reference: UTIL-01 — the shortcut menu above the zoom bar.

export interface ZoomMenuItem {
  label: string;
  shortcut: string;
  disabled: boolean;
  action: () => void;
}

export default function ZoomMenu({ items }: { items: ZoomMenuItem[] }) {
  return (
    <div className="minimap-zoom-menu">
      {items.map((item) => (
        <button
          key={item.label}
          onClick={item.action}
          disabled={item.disabled}
          className={[
            "minimap-zoom-menu-item",
            item.disabled ? "minimap-zoom-menu-item-disabled" : "minimap-zoom-menu-item-enabled",
          ].join(" ")}
        >
          <span className="minimap-zoom-menu-label">{item.label}</span>
          <span className="minimap-zoom-menu-shortcut">{item.shortcut}</span>
        </button>
      ))}
    </div>
  );
}
