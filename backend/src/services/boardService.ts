import {
  createBoard as persistBoard,
  deleteBoard as removeBoard,
  getBoard as findBoard,
  listBoards as findBoards,
} from "../lib/boardStore.js";
import type { Board } from "../lib/boardStore.js";

export type { Board } from "../lib/boardStore.js";

export function listBoards(userId: string): Promise<Board[]> {
  return findBoards(userId);
}

export function getBoard(id: string, userId: string): Promise<Board | null> {
  return findBoard(id, userId);
}

export function createBoard(userId: string, name: string): Promise<Board> {
  return persistBoard(userId, name);
}

export function deleteBoard(id: string, userId: string): Promise<void> {
  return removeBoard(id, userId);
}
