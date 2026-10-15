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
  onBrand,
  onSignOut,
}: {
  /** null while nobody is signed in. */
  user: Identity | null;
  onBrand: () => void;
  onSignOut: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="sidebar-footer">
      <RailTip content="Support">
        <button type="button" className="sidebar-support">
          <HelpCircle className="sidebar-item-icon" aria-hidden />
          <span className="sidebar-item-label">Support</span>
        </button>
      </RailTip>

      <div className="sidebar-footer-divider" />

      {user ? (
        <div className="sidebar-identity-anchor">
          {menuOpen && (
            <UserMenu
              user={user}
              onClose={() => setMenuOpen(false)}
              onBrand={() => {
                setMenuOpen(false);
                // The menu item is about to unmount; parking focus on the
                // trigger is what lets the Brand popup hand it back here.
                triggerRef.current?.focus();
                onBrand();
              }}
              onSignOut={() => {
                setMenuOpen(false);
                onSignOut();
              }}
            />
          )}
          {/* No tooltip while the menu is open: it would sit on top of the
              menu it is describing. */}
          <RailTip content={menuOpen ? "" : user.name}>
            <button
              ref={triggerRef}
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
          </RailTip>
        </div>
      ) : (
        // Not a disabled sign-in button: with IAP the gate is upstream of the
        // app, so a signed-out state can only ever be local dev's anonymous
        // mode. Saying so beats offering an action that does nothing.
        <RailTip content="Not signed in">
          <div className="sidebar-identity sidebar-identity-anonymous">
            <span className="sidebar-avatar" aria-hidden>
              ?
            </span>
            <span className="sidebar-identity-name">Not signed in</span>
          </div>
        </RailTip>
      )}
    </div>
  );
}
