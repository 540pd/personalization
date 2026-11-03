// The board in the user's account (#324): signed in, the board loads from
// and saves to the account; anonymous, it stays this browser's alone, as
// before. The local copy is kept either way (canvasPersistence).

import { fetchCurrentBoard, saveCurrentBoard } from "@/api/board.api";
import { useIdentityStore } from "@/auth/useIdentity";
import { useNodePanel } from "@/store/nodePanel.store";
import { canvasHistory } from "@/lib/canvas/history";
import { parseBoardFile, serializeBoard, type BoardFile } from "./boardFile";
import { CANVAS_STORAGE_KEY, onBoardChange } from "./canvasPersistence";
import { createBoardSync } from "./boardSync";
import { readSyncMeta, SYNC_META_KEY } from "./syncMeta";
import { backupBoard, moveImagesToAssets } from "./importBoard";
import type { BoardScene } from "./placeBoard";
import { listen } from "@/lib/dom/listen";

/** The signed-in account, or null in anonymous mode. */
export function accountOwner(): string | null {
  const { status, identity } = useIdentityStore.getState();
  return status === "signedIn" ? (identity?.email ?? null) : null;
}

/**
 * Before the local copy is shown: if it is another account's -- someone
 * else signed in on this browser before -- it is dropped, never shown or
 * sent. Their board is safe in their account.
 */
export function forgetOtherAccountsBoard(owner: string, storage: Storage = window.localStorage): void {
  const meta = readSyncMeta(storage);
  if (!meta || meta.owner === owner) return;
  try {
    storage.removeItem(CANVAS_STORAGE_KEY);
    storage.removeItem(SYNC_META_KEY);
  } catch {
    // Nothing to recover: the server's copy replaces it on load.
  }
  useNodePanel.getState().clearAll();
}

/** Loads the account's board and saves to it from now on; returns the stop. */
export function bindAccountBoard(board: BoardScene, owner: string, place: (file: BoardFile) => void): () => void {
  const sync = createBoardSync({
    owner,
    fetchCurrent: fetchCurrentBoard,
    save: saveCurrentBoard,
    serialize: () => serializeBoard(board.root),
    parse: (content) => {
      const parsed = parseBoardFile(JSON.stringify(content));
      return parsed.ok ? parsed.file : null;
    },
    // The account's copy replaces the board, as the first undo entry: there
    // is nothing before it to go back to.
    adopt: (file) => {
      place(file);
      canvasHistory.clear();
      board.saveSnapshot();
    },
    // The browser's board becoming the account's first: kept as it was,
    // then its pictures moved into stored assets.
    beforeFirstSave: async () => {
      const local = serializeBoard(board.root);
      if (!local.nodes.length && !local.panels.length) return;
      backupBoard(local);
      await moveImagesToAssets();
    },
  });
  const off = [
    onBoardChange(sync.markDirty, { panels: true }),
    // Closing the tab right after a change: send it on the way out.
    listen(window, "pagehide", sync.flush),
    listen(document, "visibilitychange", () => {
      if (document.visibilityState === "hidden") sync.flush();
    }),
  ];
  void sync.start();
  return () => {
    off.forEach((o) => o());
    sync.dispose();
  };
}
