"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Eraser, FolderOpen } from "lucide-react";
import { Z_INDEX } from "@/constants/canvas.constants";
import { useSidebar, sidebarInset } from "@/store/sidebar.store";

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
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(() => anchor.getBoundingClientRect().top);

  // Measured before paint, so the menu never flashes at a stale row position.
  useLayoutEffect(() => {
    setTop(anchor.getBoundingClientRect().top);
  }, [anchor, collapsed]);

  // Keyboard focus starts on the first enabled item; with none enabled, on
  // the menu itself, so arrow keys and Escape still land here.
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)');
    (first ?? ref.current)?.focus();
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || anchor.contains(target)) return;
      onClose(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [anchor, onClose]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Kept here: Board deletes the selection on Backspace and undoes on
    // Ctrl+Z from window listeners, and neither should fire from a menu.
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      onClose(true);
      return;
    }
    if (e.key === "Tab") {
      onClose(false);
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(
      ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [],
    );
    if (!items.length) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    const step = e.key === "ArrowDown" ? 1 : -1;
    items[(at + step + items.length) % items.length].focus();
  };

  return createPortal(
    <div
      ref={ref}
      className="playspace-menu"
      role="menu"
      aria-label="Playspace options"
      tabIndex={-1}
      onKeyDown={onKeyDown}
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
    </div>,
    document.body,
  );
}
