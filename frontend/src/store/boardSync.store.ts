import { create } from "zustand";

// Where saving the board to the account stands (#324), for the rail and
// the conflict banner. The sync engine (board/boardSync.ts) is the writer.

export type BoardSyncState =
  /** Anonymous: the board is this browser's only. */
  | "off"
  | "loading"
  | "saved"
  | "saving"
  /** Offline or the server failing: kept locally, and tried again. */
  | "retrying"
  /** Saved elsewhere since this copy was: the user chooses. */
  | "conflict"
  | "tooLarge";

interface BoardSyncStore {
  state: BoardSyncState;
  message: string | null;
  /** What the banner's buttons call; set while a sync runs. */
  actions: { loadLatest: () => void } | null;
}

export const useBoardSync = create<BoardSyncStore>(() => ({ state: "off", message: null, actions: null }));
