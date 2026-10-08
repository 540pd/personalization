"use client";

// GCOS reference: docs/sidebar/gcos_main_sidepanel.png, gcos_user_click.png
//
// Three zones, which is the shape both references share:
//
//   header   product lockup + collapse toggle
//   nav      destinations                 <- takes the remaining height
//   footer   Support + identity           <- pinned
//
// Everything else is data: the destinations come from items.ts, the user is
// a prop.

import { useState } from "react";
import { PanelLeft } from "lucide-react";
import { useSidebar, SIDEBAR_WIDTH } from "@/store/sidebar.store";
import SidebarHeader from "./SidebarHeader";
import SidebarNav from "./SidebarNav";
import SidebarFooter from "./SidebarFooter";
import type { SidebarUser } from "./UserMenu";
import { DEFAULT_SECTION, type SectionId } from "./items";
import "./Sidebar.scss";

export default function Sidebar({ user = null }: { user?: SidebarUser | null }) {
  const collapsed = useSidebar((s) => s.collapsed);
  const toggle = useSidebar((s) => s.toggle);
  const [active, setActive] = useState<SectionId>(DEFAULT_SECTION);

  if (collapsed) {
    // A floating re-open affordance, since the rail itself is gone. Same
    // pattern RightPanel already uses for its collapsed state.
    return (
      <button
        type="button"
        onClick={toggle}
        className="sidebar-reopen"
        title="Show sidebar"
        aria-label="Show sidebar"
      >
        <PanelLeft size={16} aria-hidden />
      </button>
    );
  }

  return (
    <aside className="sidebar" aria-label="Main navigation" style={{ width: SIDEBAR_WIDTH }}>
      <SidebarHeader onToggle={toggle} />
      <SidebarNav active={active} onSelect={setActive} />
      <SidebarFooter
        user={user}
        // Both are destinations this slice deliberately does not build. The
        // Brand page is a whole settings surface whose interesting half is
        // backend; sign-out belongs to the IAP work.
        onBrand={() => {}}
        onSignOut={() => {}}
      />
    </aside>
  );
}
