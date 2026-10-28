"use client";

import { useBoardSync } from "@/store/boardSync.store";
import { saveBoardToFile } from "@/app/canvas/board/boardFile";
import "./BoardSync.scss";

/**
 * The board was saved elsewhere since this copy -- another tab, another
 * browser (#324). Nothing is overwritten either way until the user picks:
 * keep a file of this copy, and/or load the account's.
 */
export default function BoardSyncBanner() {
  const state = useBoardSync((s) => s.state);
  const message = useBoardSync((s) => s.message);
  const actions = useBoardSync((s) => s.actions);
  if (state !== "conflict" || !actions) return null;
  return (
    <div className="board-sync-banner" role="alert">
      <span className="board-sync-banner-text">
        {message ?? "This board changed in another tab or browser. Your changes here aren't saved."}
      </span>
      <button type="button" className="board-sync-banner-button" onClick={() => saveBoardToFile()}>
        Download my copy
      </button>
      <button type="button" className="board-sync-banner-button board-sync-banner-primary" onClick={actions.loadLatest}>
        Load the latest
      </button>
    </div>
  );
}
