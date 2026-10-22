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

import { useEffect, useRef, useState } from "react";
import { useSidebar, sidebarInset } from "@/store/sidebar.store";
import { Z_INDEX } from "@/constants/canvas.constants";
import { useIdentity, useIdentityStore } from "@/auth/useIdentity";
import SidebarHeader from "./SidebarHeader";
import SidebarNav from "./SidebarNav";
import SidebarFooter from "./SidebarFooter";
import BrandDialog from "../Brand/BrandDialog";
import BrandSavedToast from "../Brand/BrandSavedToast";
import ClearBoardDialog from "./ClearBoardDialog";
import BoardToast from "./BoardToast";
import { DEFAULT_SECTION, type SectionId } from "./items";
import { requestClearBoard, useBoardItemCount } from "../../board/clearBoard";
import { saveBoardToFile } from "../../board/boardFile";
import { canvasHistory } from "@/lib/canvas/history";
import "./Sidebar.scss";

const TOAST_MS = 2500;
// Longer than Brand's for a toast with an Undo, which needs time to be read
// and reached, and for a failure, which needs reading.
const LONG_TOAST_MS = 5000;

/** One toast at a time for the board actions; a new one replaces the last. */
interface BoardToastState {
  message: string;
  error?: boolean;
  undo?: boolean;
  /** So repeating the same action restarts the timer. */
  at: number;
}

export default function Sidebar() {
  const collapsed = useSidebar((s) => s.collapsed);
  const toggle = useSidebar((s) => s.toggle);
  const user = useIdentity();
  const signOut = useIdentityStore((s) => s.signOut);
  const [active, setActive] = useState<SectionId>(DEFAULT_SECTION);
  const [brandOpen, setBrandOpen] = useState(false);
  // A timestamp rather than a flag, so saving again restarts the timer.
  const [brandSavedAt, setBrandSavedAt] = useState<number | null>(null);

  const itemCount = useBoardItemCount();
  const [clearOpen, setClearOpen] = useState(false);
  const [boardToast, setBoardToast] = useState<BoardToastState | null>(null);
  // The options trigger, so focus can go back to it once the confirm closes.
  const clearTriggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (brandSavedAt === null) return;
    const t = setTimeout(() => setBrandSavedAt(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [brandSavedAt]);

  useEffect(() => {
    if (boardToast === null) return;
    const ms = boardToast.undo || boardToast.error ? LONG_TOAST_MS : TOAST_MS;
    const t = setTimeout(() => setBoardToast(null), ms);
    return () => clearTimeout(t);
  }, [boardToast]);

  const saveBoard = () => {
    setBoardToast(
      saveBoardToFile()
        ? { message: "Board saved to file", at: Date.now() }
        : { message: "Couldn't save the board.", error: true, at: Date.now() },
    );
  };

  const closeClear = () => {
    setClearOpen(false);
    clearTriggerRef.current?.focus();
  };

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
      <SidebarNav
        active={active}
        onSelect={setActive}
        onSaveBoard={saveBoard}
        onClearBoard={(trigger) => {
          clearTriggerRef.current = trigger;
          setClearOpen(true);
        }}
      />
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
      {clearOpen && (
        <ClearBoardDialog
          count={itemCount}
          onCancel={closeClear}
          // Stays open: saving first is a step on the way to clearing.
          onSaveFirst={saveBoard}
          onConfirm={() => {
            closeClear();
            requestClearBoard();
            setBoardToast({ message: "Board cleared", undo: true, at: Date.now() });
          }}
        />
      )}
      {boardToast !== null && (
        <BoardToast
          message={boardToast.message}
          error={boardToast.error}
          onUndo={
            boardToast.undo
              ? () => {
                  canvasHistory.undo();
                  setBoardToast(null);
                }
              : undefined
          }
        />
      )}
    </aside>
  );
}
