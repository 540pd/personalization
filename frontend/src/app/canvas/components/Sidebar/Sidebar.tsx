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
import { useSection } from "@/store/section.store";
import { Z_INDEX } from "@/constants/canvas.constants";
import { useIdentity, useIdentityStore } from "@/auth/useIdentity";
import SidebarHeader from "./SidebarHeader";
import SidebarNav from "./SidebarNav";
import SidebarFooter from "./SidebarFooter";
import BrandDialog from "../Brand/BrandDialog";
import BrandSavedToast from "../Brand/BrandSavedToast";
import BoardConfirmDialog from "./BoardConfirmDialog";
import BoardToast from "./BoardToast";
import { requestClearBoard, useBoardItemCount } from "../../board/clearBoard";
import {
  parseBoardFile,
  requestLoadBoard,
  saveBoardToFile,
  zoomToFitBoard,
  type BoardFile,
} from "../../board/boardFile";
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

/** The confirm in front of a board action, if one is up. */
type BoardConfirm = { kind: "clear" } | { kind: "replace"; file: BoardFile; name: string };

const itemsPhrase = (n: number) => (n === 1 ? "1 item" : `${n} items`);

export default function Sidebar() {
  const collapsed = useSidebar((s) => s.collapsed);
  const toggle = useSidebar((s) => s.toggle);
  const user = useIdentity();
  const signOut = useIdentityStore((s) => s.signOut);
  const active = useSection((s) => s.section);
  const setActive = useSection((s) => s.setSection);
  const [brandOpen, setBrandOpen] = useState(false);
  // A timestamp rather than a flag, so saving again restarts the timer.
  const [brandSavedAt, setBrandSavedAt] = useState<number | null>(null);

  const itemCount = useBoardItemCount();
  const [confirm, setConfirm] = useState<BoardConfirm | null>(null);
  const [boardToast, setBoardToast] = useState<BoardToastState | null>(null);
  // The options trigger, so focus can go back to it once a confirm closes.
  const triggerRef = useRef<HTMLElement | null>(null);
  // Read when a file arrives, which can be long after the click that asked
  // for it: the board may have changed while the picker was open.
  const itemCountRef = useRef(itemCount);
  itemCountRef.current = itemCount;

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

  const closeConfirm = () => {
    setConfirm(null);
    triggerRef.current?.focus();
  };

  const loadBoard = (file: BoardFile) => {
    // Synchronous: Board has placed everything by the time this returns,
    // so the fit measures the loaded board.
    requestLoadBoard(file);
    zoomToFitBoard();
    setBoardToast({ message: "Board opened", undo: true, at: Date.now() });
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
      setBoardToast({
        message:
          parsed.error === "newer"
            ? "This board was saved by a newer version of PlaySpace."
            : "This file isn't a PlaySpace board.",
        error: true,
        at: Date.now(),
      });
      return;
    }
    // Nothing to lose, nothing to ask.
    if (itemCountRef.current === 0) loadBoard(parsed.file);
    else setConfirm({ kind: "replace", file: parsed.file, name: chosen.name });
  };

  // A fresh input per pick, never one kept in the page: a second
  // input[type=file] beside the dock's upload makes any lookup of "the file
  // input" ambiguous -- the e2e upload helper's among them -- and a new one
  // also fires change for the same file picked twice. Called within the
  // menu click, which the picker needs.
  const pickBoardFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", () => {
      const chosen = input.files?.[0];
      if (chosen) void openChosen(chosen);
    });
    input.click();
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
      {confirm?.kind === "clear" && (
        <BoardConfirmDialog
          title="Clear board?"
          confirmLabel="Clear"
          tone="danger"
          onCancel={closeConfirm}
          // Stays open: saving first is a step on the way to clearing.
          onSaveFirst={saveBoard}
          onConfirm={() => {
            closeConfirm();
            requestClearBoard();
            setBoardToast({ message: "Board cleared", undo: true, at: Date.now() });
          }}
        >
          This removes all {itemsPhrase(itemCount)} from PlaySpace.
        </BoardConfirmDialog>
      )}
      {confirm?.kind === "replace" && (
        <BoardConfirmDialog
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
        </BoardConfirmDialog>
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
