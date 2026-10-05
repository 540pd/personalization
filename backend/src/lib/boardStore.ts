// Board state operations — Firestore-backed when FIRESTORE_PROJECT_ID is set,
// in-memory stub otherwise (local dev without GCP).
// TODO: wire Firestore in each function below.

import { currentIsoDate } from "../utils/date.js";
import { createId } from "../utils/id.js";

export interface Board {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

const _boards: Board[] = [];

export async function listBoards(userId: string): Promise<Board[]> {
  // TODO: query Firestore boards collection filtered by userId
  return _boards.filter((b) => b.userId === userId);
}

export async function getBoard(id: string, userId: string): Promise<Board | null> {
  // TODO: fetch single Firestore document, verify userId matches
  return _boards.find((b) => b.id === id && b.userId === userId) ?? null;
}

export async function createBoard(userId: string, name: string): Promise<Board> {
  // TODO: write new Firestore document
  const board: Board = {
    id: createId(),
    userId,
    name,
    createdAt: currentIsoDate(),
    updatedAt: currentIsoDate(),
  };
  _boards.push(board);
  return board;
}

export async function deleteBoard(id: string, userId: string): Promise<void> {
  // TODO: delete Firestore document, verify userId matches
  const idx = _boards.findIndex((b) => b.id === id && b.userId === userId);
  if (idx !== -1) _boards.splice(idx, 1);
}
