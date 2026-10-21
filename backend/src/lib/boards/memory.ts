import { currentIsoDate } from "../../utils/date.js";
import { createId } from "../../utils/id.js";
import { byNewest, type Board, type BoardStore } from "./types.js";

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
    async remove(id, userId) {
      const i = boards.findIndex((b) => b.id === id && b.userId === userId);
      if (i !== -1) boards.splice(i, 1);
    },
  };
}
