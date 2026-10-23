"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { Z_INDEX } from "@/constants/canvas.constants";
import PortalMenu from "@/components/Menu";

/** Gap between the ⋯ button and the menu, in px. */
const GAP = 4;

export interface RowMenuItem {
  label: string;
  icon: LucideIcon;
  /** Called after the menu closes, with the ⋯ button to return focus to. */
  onSelect: (trigger: HTMLButtonElement) => void;
  /** A divider above this item. */
  separated?: boolean;
}

/**
 * A table row's ⋯ menu (#210): Edit…, and in #211 Duplicate and Remove….
 *
 * The rail's menu surface (.playspace-menu, .sidebar-item rows), portaled
 * and fixed below the button, right-aligned to it: the table scrolls
 * sideways in its own box, which would clip a menu nested in the cell.
 */
export default function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={open ? "library-row-menu-button library-row-menu-button-open" : "library-row-menu-button"}
        aria-label={`${label} options`}
        aria-haspopup="menu"
        aria-expanded={open}
        // The row opens Edit on click; this button is not part of that.
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          // Enter on the row opens Edit; on this button it opens the menu.
          if (e.key === "Enter") e.stopPropagation();
        }}
      >
        <MoreHorizontal size={16} aria-hidden />
      </button>
      {open && buttonRef.current && (
        <Menu
          anchor={buttonRef.current}
          label={`${label} options`}
          items={items}
          onClose={(restoreFocus) => {
            setOpen(false);
            if (restoreFocus) buttonRef.current?.focus();
          }}
        />
      )}
    </>
  );
}

function Menu({
  anchor,
  label,
  items,
  onClose,
}: {
  anchor: HTMLButtonElement;
  label: string;
  items: RowMenuItem[];
  onClose: (restoreFocus: boolean) => void;
}) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  // Measured before paint, so the menu never flashes in the wrong place.
  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    setPos({ top: r.bottom + GAP, right: window.innerWidth - r.right });
  }, [anchor]);

  if (!pos) return null;
  return (
    <PortalMenu
      anchor={anchor}
      label={label}
      onClose={onClose}
      closeOnScroll
      // Portaled, but React still bubbles its clicks up to the row, which
      // would open Edit a second time and take the focus-return target.
      onClick={(e) => e.stopPropagation()}
      style={{ top: pos.top, right: pos.right, zIndex: Z_INDEX.rail }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className="contents">
            {item.separated && <div className="playspace-menu-divider" role="separator" />}
            <button
              type="button"
              role="menuitem"
              className="sidebar-item playspace-menu-item"
              onClick={() => {
                onClose(false);
                item.onSelect(anchor);
              }}
            >
              <Icon className="sidebar-item-icon" aria-hidden />
              {item.label}
            </button>
          </div>
        );
      })}
    </PortalMenu>
  );
}
