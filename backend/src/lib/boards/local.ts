import path from "node:path";
import { currentIsoDate } from "../../utils/date.js";
import { createId } from "../../utils/id.js";
import { inside, readAllJson, readJson, removeFile, writeAtomic } from "../localDisk.js";
import { byNewest, keyedLock, type Board, type BoardContentStore, type BoardStore, type SavedContent } from "./types.js";

/**
 * Boards as JSON files, one per board (`<dir>/boards/<id>.json`): the
 * local-disk placeholder for Firestore (#333). A list reads every file,
 * which is fine for one developer's boards.
 */
export function localBoardStore(root: string): BoardStore {
  const dir = path.join(root, "boards");
  const file = (id: string) => inside(dir, `${id}.json`);

  async function owned(id: string, userId: string): Promise<Board | null> {
    let board: Board | null;
    try {
      board = await readJson<Board>(file(id));
    } catch {
      return null;
    }
    return board?.userId === userId ? board : null;
  }

  return {
    async list(userId) {
      return (await readAllJson<Board>(dir)).filter((b) => b.userId === userId).sort(byNewest);
    },
    get: owned,
    async create(userId, name) {
      const now = currentIsoDate();
      const board: Board = { id: createId(), userId, name, createdAt: now, updatedAt: now };
      await writeAtomic(file(board.id), JSON.stringify(board, null, 2));
      return board;
    },
    async ensure(id, userId, name) {
      const found = await readJson<Board>(file(id));
      if (found) return found;
      const now = currentIsoDate();
      const board: Board = { id, userId, name, createdAt: now, updatedAt: now };
      await writeAtomic(file(id), JSON.stringify(board, null, 2));
      return board;
    },
    async remove(id, userId) {
      if (await owned(id, userId)) await removeFile(file(id));
    },
  };
}

/**
 * Board content as files (`<dir>/board-content/<id>.json`). One process
 * owns the folder, so a per-board lock is the whole of the revision check.
 */
export function localBoardContentStore(root: string): BoardContentStore {
  const dir = path.join(root, "board-content");
  const file = (id: string) => inside(dir, `${id}.json`);
  const locked = keyedLock();
  return {
    read: (boardId) => readJson<SavedContent>(file(boardId)),
    write: (boardId, json, baseRevision) =>
      locked(boardId, async () => {
        const revision = (await readJson<SavedContent>(file(boardId)))?.revision ?? 0;
        if (revision !== baseRevision) return { ok: false as const, revision };
        const saved: SavedContent = { revision: revision + 1, updatedAt: currentIsoDate(), json };
        await writeAtomic(file(boardId), JSON.stringify(saved));
        return { ok: true as const, revision: saved.revision, updatedAt: saved.updatedAt };
      }),
    remove: (boardId) => locked(boardId, () => removeFile(file(boardId))),
  };
}
