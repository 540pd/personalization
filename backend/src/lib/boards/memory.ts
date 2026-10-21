import { currentIsoDate } from "../../utils/date.js";
import { createId } from "../../utils/id.js";
import { byNewest, type Board, type BoardContentStore, type BoardStore, type SavedContent } from "./types.js";

/** Boards in this process only: local dev and tests, gone on restart. */
export function memoryBoardStore(): BoardStore {
  const boards: Board[] = [];
  return {
    async list(userId) {
      return boards.filter((b) => b.userId === userId).sort(byNewest);
    },
    async get(id, userId) {
      return boards.find((b) => b.id === id && b.userId === userId) ?? null;
    },
    async create(userId, name) {
      const now = currentIsoDate();
      const board: Board = { id: createId(), userId, name, createdAt: now, updatedAt: now };
      boards.push(board);
      return board;
    },
    async ensure(id, userId, name) {
      const found = boards.find((b) => b.id === id);
      if (found) return found;
      const now = currentIsoDate();
      const board: Board = { id, userId, name, createdAt: now, updatedAt: now };
      boards.push(board);
      return board;
    },
    async remove(id, userId) {
      const i = boards.findIndex((b) => b.id === id && b.userId === userId);
      if (i !== -1) boards.splice(i, 1);
    },
  };
}

/** Board content in this process only. Synchronous inside, so no lock. */
export function memoryBoardContentStore(): BoardContentStore {
  const contents = new Map<string, SavedContent>();
  return {
    async read(boardId) {
      return contents.get(boardId) ?? null;
    },
    async write(boardId, json, baseRevision) {
      const revision = contents.get(boardId)?.revision ?? 0;
      if (revision !== baseRevision) return { ok: false, revision };
      const saved = { revision: revision + 1, updatedAt: currentIsoDate(), json };
      contents.set(boardId, saved);
      return { ok: true, revision: saved.revision, updatedAt: saved.updatedAt };
    },
    async remove(boardId) {
      contents.delete(boardId);
    },
  };
}
