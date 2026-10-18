"use client";

import { useCallback, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import SidebarItem from "./SidebarItem";
import RailTip from "./RailTip";
import PlayspaceMenu from "./PlayspaceMenu";
import { SIDEBAR_ITEMS, type SectionId } from "./items";
import { useSidebar } from "@/store/sidebar.store";
import { useBoardItemCount } from "../../board/clearBoard";

/** The one destination with options: the board itself (#197). */
const OPTIONS_SECTION: SectionId = "playspace";

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
  onSaveBoard,
  onOpenBoard,
  onClearBoard,
}: {
  active: SectionId;
  onSelect: (id: SectionId) => void;
  onSaveBoard: () => void;
  /** `trigger` is where focus goes back to once a confirm closes. */
  onOpenBoard: (trigger: HTMLElement | null) => void;
  /** `trigger` is where focus goes back to once the confirm closes. */
  onClearBoard: (trigger: HTMLElement | null) => void;
}) {
  const minimized = useSidebar((s) => s.collapsed);
  const itemCount = useBoardItemCount();
  const [menuOpen, setMenuOpen] = useState(false);
  // State, not a ref: the menu measures it, so it must exist before the menu renders.
  const [anchor, setAnchor] = useState<HTMLLIElement | null>(null);

  const closeMenu = useCallback(
    (restoreFocus: boolean) => {
      setMenuOpen(false);
      if (restoreFocus) anchor?.querySelector<HTMLElement>('[aria-haspopup="menu"]')?.focus();
    },
    [anchor],
  );

  return (
    <nav className="sidebar-nav">
      <ul className="sidebar-nav-list">
        {SIDEBAR_ITEMS.map((spec) => {
          const hasOptions = spec.id === OPTIONS_SECTION && spec.id === active;
          // Minimized there is no room for a ⋯ button, so a click on the page
          // you are already on -- which would otherwise do nothing -- opens
          // the options instead.
          const iconOpensMenu = hasOptions && minimized;
          const tip = !spec.available
            ? `${spec.label} · Coming soon`
            : iconOpensMenu
              ? menuOpen ? "" : `${spec.label} · options`
              : spec.label;
          return (
            // Expanded, the label is on screen and only "Coming soon" needs
            // saying. Minimized, the tooltip carries both, so the native title
            // goes -- two hints on one icon would race each other.
            <li
              key={spec.id}
              ref={spec.id === OPTIONS_SECTION ? setAnchor : undefined}
              className={hasOptions && !minimized ? "sidebar-nav-entry sidebar-nav-entry-options" : "sidebar-nav-entry"}
              title={minimized || spec.available ? undefined : "Coming soon"}
            >
              <RailTip content={tip}>
                <SidebarItem
                  spec={spec}
                  active={spec.id === active}
                  menuOpen={iconOpensMenu ? menuOpen : undefined}
                  onSelect={iconOpensMenu ? () => setMenuOpen((v) => !v) : () => onSelect(spec.id)}
                />
              </RailTip>
              {hasOptions && !minimized && (
                <button
                  type="button"
                  className={menuOpen ? "sidebar-options-button sidebar-options-button-open" : "sidebar-options-button"}
                  aria-label={`${spec.label} options`}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((v) => !v)}
                >
                  <MoreHorizontal size={16} aria-hidden />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {menuOpen && anchor && (
        <PlayspaceMenu
          anchor={anchor}
          isEmpty={itemCount === 0}
          onSave={onSaveBoard}
          onOpen={() => onOpenBoard(anchor.querySelector<HTMLElement>('[aria-haspopup="menu"]'))}
          onClear={() => onClearBoard(anchor.querySelector<HTMLElement>('[aria-haspopup="menu"]'))}
          onClose={closeMenu}
        />
      )}
    </nav>
  );
}
