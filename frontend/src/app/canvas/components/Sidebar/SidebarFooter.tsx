"use client";

import { useRef, useState } from "react";
import { HelpCircle } from "lucide-react";
import UserMenu from "./UserMenu";
import RailTip from "./RailTip";
import type { Identity } from "@/auth/useIdentity";

/**
 * Pinned to the bottom: Support, then identity.
 *
 * Bottom rather than Luma's top placement, which was the deliberate choice
 * between the two references: the canvas is the subject and identity is the
 * least-used control in the rail, so it belongs at the far end. It also
 * means the nav above can simply take the remaining height.
 */
export default function SidebarFooter({
  user,
  onSupport,
  onBrand,
  onSettings,
  onSignOut,
}: {
  /** null while nobody is signed in. */
  user: Identity | null;
  /** Opens the support form (#428); the button is handed over so focus can come back to it. */
  onSupport: (trigger: HTMLButtonElement) => void;
  onBrand: () => void;
  onSettings: () => void;
  onSignOut: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="sidebar-footer">
      <RailTip content="Support">
        <button type="button" className="sidebar-support" onClick={(e) => onSupport(e.currentTarget)}>
          <HelpCircle className="sidebar-item-icon" aria-hidden />
          <span className="sidebar-item-label">Support</span>
        </button>
      </RailTip>

      <div className="sidebar-footer-divider" />

      <div className="sidebar-identity-anchor">
        {menuOpen && (
          <UserMenu
            user={user}
            onClose={() => setMenuOpen(false)}
            onBrand={() => {
              setMenuOpen(false);
              onBrand();
            }}
            onSettings={() => {
              setMenuOpen(false);
              onSettings();
            }}
            onSignOut={() => {
              setMenuOpen(false);
              onSignOut();
            }}
          />
        )}
        {/* No tooltip while the menu is open: it would sit on top of the
            menu it is describing. Signed out here is local dev's anonymous
            mode only -- where sign-in is required, the sign-in screen stands
            in for the board (#321) -- so there is nothing to sign in to; but
            Settings needs no account, so the row still opens the menu (#214). */}
        <RailTip content={menuOpen ? "" : (user?.name ?? "Not signed in")}>
          <button
            ref={triggerRef}
            type="button"
            className={user ? "sidebar-identity" : "sidebar-identity sidebar-identity-anonymous"}
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <span className="sidebar-avatar" aria-hidden>
              {user ? user.name.charAt(0).toUpperCase() : "?"}
            </span>
            <span className="sidebar-identity-name">{user?.name ?? "Not signed in"}</span>
          </button>
        </RailTip>
      </div>
    </div>
  );
}
