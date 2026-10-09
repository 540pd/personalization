"use client";

import { useEffect, useRef } from "react";
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
      // The trigger closes the menu itself; without the containment check a
      // click on it would close and immediately reopen.
      if (!ref.current?.contains(e.target as Node)) onClose();
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
      <div className="sidebar-user-menu-identity">
        <span className="sidebar-avatar" aria-hidden>
          {user.name.charAt(0).toUpperCase()}
        </span>
        {/* Long addresses are the norm here, so the element truncates rather
            than widening the rail; the full value stays available on hover. */}
        <span className="sidebar-user-email" title={user.email}>
          {user.email}
        </span>
      </div>

      <button type="button" role="menuitem" className="sidebar-user-menu-item" onClick={onBrand}>
        Brand
      </button>
      <button type="button" role="menuitem" className="sidebar-user-menu-item" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  );
}
