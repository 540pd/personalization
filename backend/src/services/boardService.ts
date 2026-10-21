import { boardStore, type Board } from "../lib/boards/index.js";

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

export function deleteBoard(id: string, userId: string): Promise<void> {
  return boardStore().remove(id, userId);
}
