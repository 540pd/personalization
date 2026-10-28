"use client";

import { CloudAlert, CloudCheck, CloudOff, LoaderCircle, type LucideIcon } from "lucide-react";
import { useBoardSync, type BoardSyncState } from "@/store/boardSync.store";
import "./BoardSync.scss";

// Whether the board is saved to the account (#324), on the board's row in
// the rail. An icon, since the row has no room for words beside the name;
// the words are its tooltip and what a screen reader hears. Nothing in
// anonymous mode, where the board is this browser's only.
const SHOWN: Record<BoardSyncState, { label: string; Icon: LucideIcon } | null> = {
  off: null,
  loading: { label: "Loading…", Icon: LoaderCircle },
  saving: { label: "Saving…", Icon: LoaderCircle },
  saved: { label: "Saved", Icon: CloudCheck },
  retrying: { label: "Not saved · retrying", Icon: CloudOff },
  conflict: { label: "Not saved", Icon: CloudAlert },
  tooLarge: { label: "Too large to save", Icon: CloudAlert },
};

export default function BoardSyncStatus() {
  const state = useBoardSync((s) => s.state);
  const message = useBoardSync((s) => s.message);
  const shown = SHOWN[state];
  if (!shown) return null;
  const { label, Icon } = shown;
  return (
    <span className="board-sync-status" data-state={state} role="status" title={message ? `${label}: ${message}` : label}>
      <Icon size={14} aria-hidden className={state === "loading" || state === "saving" ? "board-sync-spin" : undefined} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
