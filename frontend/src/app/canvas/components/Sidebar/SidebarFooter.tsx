"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import UserMenu, { type SidebarUser } from "./UserMenu";

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
  onBrand,
  onSignOut,
}: {
  /** null while nobody is signed in — the app runs anonymous today. */
  user: SidebarUser | null;
  onBrand: () => void;
  onSignOut: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="sidebar-footer">
      <button type="button" className="sidebar-support">
        <HelpCircle className="sidebar-item-icon" aria-hidden />
        <span>Support</span>
      </button>

      <div className="sidebar-footer-divider" />

      {menuOpen && user && (
        <UserMenu
          user={user}
          onClose={() => setMenuOpen(false)}
          onBrand={() => {
            setMenuOpen(false);
            onBrand();
          }}
          onSignOut={() => {
            setMenuOpen(false);
            onSignOut();
          }}
        />
      )}

      {user ? (
        <button
          type="button"
          className="sidebar-identity"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >
          <span className="sidebar-avatar" aria-hidden>
            {user.name.charAt(0).toUpperCase()}
          </span>
          <span className="sidebar-identity-name">{user.name}</span>
        </button>
      ) : (
        // Not a disabled sign-in button: with IAP the gate is upstream of the
        // app, so a signed-out state can only ever be local dev's anonymous
        // mode. Saying so beats offering an action that does nothing.
        <div className="sidebar-identity sidebar-identity-anonymous">
          <span className="sidebar-avatar" aria-hidden>
            ?
          </span>
          <span className="sidebar-identity-name">Not signed in</span>
        </div>
      )}
    </div>
  );
}
