// What this browser knows about its copy of the account's board (#324):
// whose it is, the revision it was last in step with, and whether it holds
// changes not yet saved. Beside the board's own localStorage copy, so a
// reload offline still knows to send them.

export const SYNC_META_KEY = "gcos-board-sync";

export interface SyncMeta {
  /** The account the local copy belongs to. */
  owner: string;
  revision: number;
  /** Changed since `revision`, and not saved yet. */
  pending: boolean;
}

export function readSyncMeta(storage: Storage = window.localStorage): SyncMeta | null {
  try {
    const m = JSON.parse(storage.getItem(SYNC_META_KEY) ?? "null") as Partial<SyncMeta> | null;
    return m && typeof m.owner === "string" && typeof m.revision === "number" && typeof m.pending === "boolean"
      ? (m as SyncMeta)
      : null;
  } catch {
    return null;
  }
}

export function writeSyncMeta(meta: SyncMeta, storage: Storage = window.localStorage): void {
  try {
    storage.setItem(SYNC_META_KEY, JSON.stringify(meta));
  } catch {
    // Over quota: the next load asks the server and finds out.
  }
}
