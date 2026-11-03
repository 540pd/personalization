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

import { useRef, useState } from "react";
import { useSidebar, sidebarInset } from "@/store/sidebar.store";
import { useSection } from "@/store/section.store";
import { Z_INDEX } from "@/constants/canvas.constants";
import { useIdentity } from "@/auth/useIdentity";
import { signOut } from "@/auth/session";
import SidebarHeader from "./SidebarHeader";
import SidebarNav from "./SidebarNav";
import SidebarFooter from "./SidebarFooter";
import { requestClearBoard, useBoardItemCount } from "../../board/clearBoard";
import {
  boardFileProblem,
  parseBoardFile,
  requestLoadBoard,
  saveBoardToFile,
  zoomToFitBoard,
  type BoardFile,
} from "../../board/boardFile";
import { canvasHistory } from "@/lib/canvas/history";
import { pickFile } from "@/lib/dom/pickFile";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast/useToast";
import SupportDialog from "@/support/components/SupportDialog";
import { useSupport } from "@/support/useSupport";
import { supportContext } from "@/support/supportContext";
import type { SupportContext } from "@/support/support.api";
import { SIDEBAR_ITEMS } from "./items";
import "./Sidebar.scss";

/** The confirm in front of a board action, if one is up. */
type BoardConfirm = { kind: "clear" } | { kind: "replace"; file: BoardFile; name: string };

const itemsPhrase = (n: number) => (n === 1 ? "1 item" : `${n} items`);

export default function Sidebar() {
  const collapsed = useSidebar((s) => s.collapsed);
  const toggle = useSidebar((s) => s.toggle);
  const user = useIdentity();
  const active = useSection((s) => s.section);
  const setActive = useSection((s) => s.setSection);

  const itemCount = useBoardItemCount();
  const [confirm, setConfirm] = useState<BoardConfirm | null>(null);
  // One toast at a time for the board actions; a new one replaces the last.
  // Their Undo is the shared timeline's.
  const [toast, showToast] = useToast();
  // The options trigger, so focus can go back to it once a confirm closes.
  const triggerRef = useRef<HTMLElement | null>(null);
  // Read when a file arrives, which can be long after the click that asked
  // for it: the board may have changed while the picker was open.
  const itemCountRef = useRef(itemCount);
  itemCountRef.current = itemCount;

  // Support (#428): a dialog over whatever is on screen. A send carries on
  // if it is closed, and then says how it went in a toast.
  const [supportOpen, setSupportOpen] = useState(false);
  const supportOpenRef = useRef(false);
  supportOpenRef.current = supportOpen;
  const supportTriggerRef = useRef<HTMLButtonElement | null>(null);

  const openSupport = () => {
    setSupportOpen(true);
  };
  const closeSupport = () => {
    setSupportOpen(false);
    useSupport.getState().startOver();
    supportTriggerRef.current?.focus();
  };
  const sendSupport = async (context: SupportContext, website: string) => {
    const reply = await useSupport.getState().submit(context, website);
    if (reply && !supportOpenRef.current) {
      if (reply.ok) {
        useSupport.getState().startOver();
        showToast("Message sent. We'll reply by email.");
      } else {
        showToast("Your support message wasn't sent.", true, openSupport, "Open it");
      }
    }
    return reply;
  };

  const saveBoard = () => {
    if (saveBoardToFile()) showToast("Board saved to file");
    else showToast("Couldn't save the board.", true);
  };

  const closeConfirm = () => {
    setConfirm(null);
    triggerRef.current?.focus();
  };

  const loadBoard = (file: BoardFile) => {
    // Synchronous: Board has placed everything by the time this returns,
    // so the fit measures the loaded board.
    requestLoadBoard(file);
    zoomToFitBoard();
    showToast("Board opened", false, () => canvasHistory.undo());
  };

  const openChosen = async (chosen: File) => {
    let text: string;
    try {
      text = await chosen.text();
    } catch (err) {
      console.error("[board] Could not read the board file:", err);
      text = "";
    }
    const parsed = parseBoardFile(text);
    if (!parsed.ok) {
      showToast(boardFileProblem(parsed.error, "file"), true);
      return;
    }
    // Nothing to lose, nothing to ask.
    if (itemCountRef.current === 0) loadBoard(parsed.file);
    else setConfirm({ kind: "replace", file: parsed.file, name: chosen.name });
  };

  // Called within the menu click, which the picker needs.
  const pickBoardFile = () => pickFile(".json,application/json", (chosen) => void openChosen(chosen));

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
      <SidebarHeader minimized={collapsed} section={active} onToggle={toggle} />
      <SidebarNav
        active={active}
        onSelect={setActive}
        onSaveBoard={saveBoard}
        onOpenBoard={(trigger) => {
          triggerRef.current = trigger;
          pickBoardFile();
        }}
        onClearBoard={(trigger) => {
          triggerRef.current = trigger;
          setConfirm({ kind: "clear" });
        }}
      />
      <SidebarFooter
        user={user}
        onSupport={(trigger) => {
          supportTriggerRef.current = trigger;
          openSupport();
        }}
        // A page over the board, like Settings (#219). It was a popup (#72),
        // but one that had grown to nearly the whole window.
        onBrand={() => setActive("brand")}
        // A page, not a popup (#214): settings will grow, and they are not
        // a client's one-off setup.
        onSettings={() => setActive("settings")}
        // Locally this just clears the dev identity, so the signed-out state
        // is reachable without a restart. Deployed, IAP owns sign-out at
        // /_gcp_iap/clear_login_cookie.
        onSignOut={() => void signOut()}
      />
      {confirm?.kind === "clear" && (
        <ConfirmDialog
          title="Clear board?"
          confirmLabel="Clear"
          tone="danger"
          onCancel={closeConfirm}
          // Stays open: saving first is a step on the way to clearing.
          onSaveFirst={saveBoard}
          onConfirm={() => {
            closeConfirm();
            requestClearBoard();
            showToast("Board cleared", false, () => canvasHistory.undo());
          }}
        >
          This removes all {itemsPhrase(itemCount)} from PlaySpace.
        </ConfirmDialog>
      )}
      {confirm?.kind === "replace" && (
        <ConfirmDialog
          title="Replace current board?"
          confirmLabel="Replace"
          tone="primary"
          onCancel={closeConfirm}
          onConfirm={() => {
            const { file } = confirm;
            closeConfirm();
            loadBoard(file);
          }}
        >
          Opening {confirm.name} will replace the {itemsPhrase(itemCount)} on the board.
        </ConfirmDialog>
      )}
      {supportOpen && (
        <SupportDialog
          onClose={closeSupport}
          context={() => supportContext(SIDEBAR_ITEMS.find((i) => i.id === active)?.label ?? active)}
          send={sendSupport}
        />
      )}
      {toast}
    </aside>
  );
}
