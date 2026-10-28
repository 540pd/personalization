import { boardContentStore, boardStore, type Board } from "../lib/boards/index.js";

export type { Board } from "../lib/boards/index.js";

export function listBoards(userId: string): Promise<Board[]> {
  return boardStore().list(userId);
}

export function getBoard(id: string, userId: string): Promise<Board | null> {
  return boardStore().get(id, userId);
}

export function createBoard(userId: string, name: string): Promise<Board> {
  return boardStore().create(userId, name);
}

export async function deleteBoard(id: string, userId: string): Promise<void> {
  // Its content goes with it, but only once the board is known to be theirs.
  if (!(await boardStore().get(id, userId))) return;
  await boardStore().remove(id, userId);
  await boardContentStore().remove(id);
}
