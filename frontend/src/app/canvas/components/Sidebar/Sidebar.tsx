"use client";

// GCOS reference: docs/sidebar/gcos_main_sidepanel.png, gcos_user_click.png
//
// Three zones, which is the shape both references share:
//
//   header   product lockup + collapse toggle
//   nav      destinations                 <- takes the remaining height
//   footer   Support + identity           <- pinned
//
// Everything else is data: the destinations come from items.ts, the user
// from the identity seam in auth/useIdentity.

import { useEffect, useState } from "react";
import { useSidebar, sidebarInset } from "@/store/sidebar.store";
import { Z_INDEX } from "@/constants/canvas.constants";
import { useIdentity, useIdentityStore } from "@/auth/useIdentity";
import SidebarHeader from "./SidebarHeader";
import SidebarNav from "./SidebarNav";
import SidebarFooter from "./SidebarFooter";
import BrandDialog from "../Brand/BrandDialog";
import BrandSavedToast from "../Brand/BrandSavedToast";
import { DEFAULT_SECTION, type SectionId } from "./items";
import "./Sidebar.scss";

const TOAST_MS = 2500;

export default function Sidebar() {
  const collapsed = useSidebar((s) => s.collapsed);
  const toggle = useSidebar((s) => s.toggle);
  const user = useIdentity();
  const signOut = useIdentityStore((s) => s.signOut);
  const [active, setActive] = useState<SectionId>(DEFAULT_SECTION);
  const [brandOpen, setBrandOpen] = useState(false);
  // A timestamp rather than a flag, so saving again restarts the timer.
  const [brandSavedAt, setBrandSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (brandSavedAt === null) return;
    const t = setTimeout(() => setBrandSavedAt(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [brandSavedAt]);

  return (
    <aside
      // Minimized, not hidden: the rail stays mounted at its icon width, so
      // every destination is still one click away.
      className={collapsed ? "sidebar sidebar-minimized" : "sidebar"}
      aria-label="Main navigation"
      // Both from TypeScript, not CSS: the width because the canvas has to
      // subtract it, the tier because it has to out-rank the canvas chrome.
      style={{ width: sidebarInset(collapsed), zIndex: Z_INDEX.rail }}
    >
      <SidebarHeader minimized={collapsed} onToggle={toggle} />
      <SidebarNav active={active} onSelect={setActive} />
      <SidebarFooter
        user={user}
        // A popup, not a page: a client's brand is set once and rarely
        // changes, so it should not take the canvas away (#72).
        onBrand={() => setBrandOpen(true)}
        // Locally this just clears the dev identity, so the signed-out state
        // is reachable without a restart. Deployed, IAP owns sign-out at
        // /_gcp_iap/clear_login_cookie.
        onSignOut={signOut}
      />
      {brandOpen && (
        <BrandDialog
          onClose={() => setBrandOpen(false)}
          onSaved={() => {
            setBrandOpen(false);
            setBrandSavedAt(Date.now());
          }}
        />
      )}
      {brandSavedAt !== null && <BrandSavedToast />}
    </aside>
  );
}
