"use client";

import { useEffect, useRef } from "react";
import { LogOut, Palette, Settings } from "lucide-react";
import type { Identity } from "@/auth/useIdentity";

const SETTINGS_KEYS = "Meta+, Control+,";

/** How the Settings key reads on this machine: ⌘, on a Mac, Ctrl+, elsewhere. */
function settingsShortcut(): string {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘," : "Ctrl+,";
}

/**
 * The popover above the identity row: email, Brand, Settings, Sign out.
 *
 * Opens upward because the trigger is pinned to the bottom of the rail.
 * Signed out (local dev only), it holds just Settings (#214): settings are
 * kept in the browser, so they need no account.
 */
export default function UserMenu({
  user,
  onClose,
  onBrand,
  onSettings,
  onSignOut,
}: {
  /** null while nobody is signed in. */
  user: Identity | null;
  onClose: () => void;
  onBrand: () => void;
  onSettings: () => void;
  onSignOut: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      // The parent is the anchor that also holds the trigger, which toggles
      // the menu itself; closing here too would make its click reopen it.
      if (!ref.current?.parentElement?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="sidebar-user-menu" role="menu">
      {user ? (
        // Long addresses are the norm here, so the element truncates rather
        // than widening the rail; the full value stays available on hover.
        <div className="sidebar-user-email" title={user.email}>
          {user.email}
        </div>
      ) : (
        <div className="sidebar-user-email">Not signed in</div>
      )}

      {user && (
        <button type="button" role="menuitem" className="sidebar-item" onClick={onBrand}>
          <Palette className="sidebar-item-icon" aria-hidden />
          <span className="sidebar-item-label">Brand</span>
        </button>
      )}
      <button type="button" role="menuitem" className="sidebar-item" onClick={onSettings} aria-keyshortcuts={SETTINGS_KEYS}>
        <Settings className="sidebar-item-icon" aria-hidden />
        <span className="sidebar-item-label">Settings</span>
        <kbd className="sidebar-item-shortcut" aria-hidden>
          {settingsShortcut()}
        </kbd>
      </button>
      {user && (
        <button type="button" role="menuitem" className="sidebar-item" onClick={onSignOut}>
          <LogOut className="sidebar-item-icon" aria-hidden />
          <span className="sidebar-item-label">Sign out</span>
        </button>
      )}
    </div>
  );
}
