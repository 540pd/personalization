"use client";

import { useEffect, useRef } from "react";
import { LogOut, Palette } from "lucide-react";
import type { Identity } from "@/auth/useIdentity";

/**
 * The popover above the identity row: email, Brand, Sign out.
 *
 * Opens upward because the trigger is pinned to the bottom of the rail.
 */
export default function UserMenu({
  user,
  onClose,
  onBrand,
  onSignOut,
}: {
  user: Identity;
  onClose: () => void;
  onBrand: () => void;
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
      {/* Long addresses are the norm here, so the element truncates rather
          than widening the rail; the full value stays available on hover. */}
      <div className="sidebar-user-email" title={user.email}>
        {user.email}
      </div>

      <button type="button" role="menuitem" className="sidebar-item" onClick={onBrand}>
        <Palette className="sidebar-item-icon" aria-hidden />
        <span className="sidebar-item-label">Brand</span>
      </button>
      <button type="button" role="menuitem" className="sidebar-item" onClick={onSignOut}>
        <LogOut className="sidebar-item-icon" aria-hidden />
        <span className="sidebar-item-label">Sign out</span>
      </button>
    </div>
  );
}
