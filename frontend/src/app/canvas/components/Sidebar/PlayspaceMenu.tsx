"use client";

import { useLayoutEffect, useState } from "react";
import { Download, Eraser, FolderOpen } from "lucide-react";
import { Z_INDEX } from "@/constants/canvas.constants";
import { useSidebar, sidebarInset } from "@/store/sidebar.store";
import PortalMenu from "@/components/Menu";

/** Gap between the rail's edge and the menu, in px. */
const GAP = 8;

/**
 * Playspace options (#197): board-wide actions, opened from the rail.
 *
 * Portaled and fixed rather than nested in the row: expanded, the nav
 * scrolls (overflow-y: auto), which would clip a menu opening beside it.
 * It opens at the rail's outer edge, top-aligned with the Playspace row --
 * the same side the user menu opens on when the rail is minimized.
 */
export default function PlayspaceMenu({
  anchor,
  isEmpty,
  onSave,
  onOpen,
  onClear,
  onClose,
}: {
  /** The Playspace row. Its trigger toggles the menu, so clicks on it are not "outside". */
  anchor: HTMLElement;
  /** Nothing to save or clear: both are disabled. */
  isEmpty: boolean;
  onSave: () => void;
  /** Opens the file picker; called within the click, which a picker needs. */
  onOpen: () => void;
  onClear: () => void;
  /** `restoreFocus` is false when focus is about to go somewhere else on purpose. */
  onClose: (restoreFocus: boolean) => void;
}) {
  const collapsed = useSidebar((s) => s.collapsed);
  const [top, setTop] = useState(() => anchor.getBoundingClientRect().top);

  // Measured before paint, so the menu never flashes at a stale row position.
  useLayoutEffect(() => {
    setTop(anchor.getBoundingClientRect().top);
  }, [anchor, collapsed]);

  return (
    <PortalMenu
      anchor={anchor}
      label="Playspace options"
      onClose={onClose}
      style={{ top, left: sidebarInset(collapsed) + GAP, zIndex: Z_INDEX.rail }}
    >
      <button
        type="button"
        role="menuitem"
        className="sidebar-item playspace-menu-item"
        disabled={isEmpty}
        onClick={() => {
          onClose(true);
          onSave();
        }}
      >
        <Download className="sidebar-item-icon" aria-hidden />
        Save to file
      </button>
      {/* Never disabled: opening a file is how an empty board gets content. */}
      <button
        type="button"
        role="menuitem"
        className="sidebar-item playspace-menu-item"
        onClick={() => {
          onClose(true);
          onOpen();
        }}
      >
        <FolderOpen className="sidebar-item-icon" aria-hidden />
        Open file…
      </button>
      <div className="playspace-menu-divider" role="separator" />
      <button
        type="button"
        role="menuitem"
        className="sidebar-item playspace-menu-item"
        disabled={isEmpty}
        onClick={() => {
          onClose(false);
          onClear();
        }}
      >
        <Eraser className="sidebar-item-icon" aria-hidden />
        Clear board…
      </button>
    </PortalMenu>
  );
}
