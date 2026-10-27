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
  remove(id: string, userId: string): Promise<void>;
}

/** Newest first: the order a board list is read in. */
export const byNewest = (a: Board, b: Board) => b.createdAt.localeCompare(a.createdAt);
