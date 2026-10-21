// Board records (#322): what every board store keeps, whichever backs it.

export interface Board {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/** Every call is scoped to `userId`: another user's board is never found. */
export interface BoardStore {
  list(userId: string): Promise<Board[]>;
  get(id: string, userId: string): Promise<Board | null>;
  create(userId: string, name: string): Promise<Board>;
  /** The board `id`, made for `userId` if it does not exist yet. Idempotent,
   * so two first loads at once still make one board (#324). */
  ensure(id: string, userId: string, name: string): Promise<Board>;
  remove(id: string, userId: string): Promise<void>;
}

/** Newest first: the order a board list is read in. */
export const byNewest = (a: Board, b: Board) => b.createdAt.localeCompare(a.createdAt);

// ── content (#324) ─────────────────────────────────────────────────────

/** A board's saved content: the board file (#198) as JSON, and its revision. */
export interface SavedContent {
  /** 1 for the first save, one more for each after; 0 means never saved. */
  revision: number;
  updatedAt: string;
  json: string;
}

export type WriteResult =
  | { ok: true; revision: number; updatedAt: string }
  /** Someone saved since `baseRevision`: here is the revision they made. */
  | { ok: false; revision: number };

/**
 * Board content, by board id; ownership is the board store's to check. A
 * write names the revision it was based on and is refused if another has
 * landed since -- a second tab, a second browser -- so one never silently
 * overwrites the other.
 */
export interface BoardContentStore {
  read(boardId: string): Promise<SavedContent | null>;
  write(boardId: string, json: string, baseRevision: number): Promise<WriteResult>;
  remove(boardId: string): Promise<void>;
}

/** Serialises calls per key, for stores with no transaction of their own. */
export function keyedLock() {
  const tails = new Map<string, Promise<unknown>>();
  return <T>(key: string, run: () => Promise<T>): Promise<T> => {
    const next = (tails.get(key) ?? Promise.resolve()).then(run, run);
    tails.set(key, next.catch(() => {}));
    return next;
  };
}
