import type { DocumentSnapshot, Firestore } from "@google-cloud/firestore";
import { currentIsoDate } from "../../utils/date.js";
import { createId } from "../../utils/id.js";
import { byNewest, type Board, type BoardContentStore, type BoardStore, type SavedContent } from "./types.js";
import { getFirestoreClient } from "../firestore.js";

const BOARDS = "boards";

/** The fields stored; the id is the document's. */
type BoardDoc = Omit<Board, "id">;

function toBoard(snap: DocumentSnapshot): Board | null {
  const data = snap.data() as BoardDoc | undefined;
  return data ? { id: snap.id, ...data } : null;
}

/**
 * boards/{boardId}, owned by `userId`. Listed by an equality filter only and
 * sorted here, so Firestore needs no composite index for it.
 */
export function firestoreBoardStore(db: Firestore = getFirestoreClient()): BoardStore {
  const boards = db.collection(BOARDS);

  /** The board, if `userId` owns it. */
  async function owned(id: string, userId: string): Promise<Board | null> {
    const board = toBoard(await boards.doc(id).get());
    return board?.userId === userId ? board : null;
  }

  return {
    async list(userId) {
      const snap = await boards.where("userId", "==", userId).get();
      return snap.docs.map((d) => toBoard(d)!).sort(byNewest);
    },
    get: owned,
    async create(userId, name) {
      const now = currentIsoDate();
      const id = createId();
      const doc: BoardDoc = { userId, name, createdAt: now, updatedAt: now };
      await boards.doc(id).create(doc);
      return { id, ...doc };
    },
    async ensure(id, userId, name) {
      const now = currentIsoDate();
      const doc: BoardDoc = { userId, name, createdAt: now, updatedAt: now };
      try {
        await boards.doc(id).create(doc);
        return { id, ...doc };
      } catch (err) {
        // ALREADY_EXISTS: another request made it first. Use that one.
        if ((err as { code?: number }).code !== 6) throw err;
        return toBoard(await boards.doc(id).get())!;
      }
    },
    async remove(id, userId) {
      if (await owned(id, userId)) await boards.doc(id).delete();
    },
  };
}

/**
 * boards/{id}/content/current: the board file as a JSON string (Firestore
 * forbids directly nested arrays, which board attrs can hold), under the
 * 1 MiB document limit the route enforces. The revision check runs in a
 * transaction, so two instances cannot both accept a write.
 */
export function firestoreBoardContentStore(db: Firestore = getFirestoreClient()): BoardContentStore {
  const doc = (boardId: string) => db.collection(BOARDS).doc(boardId).collection("content").doc("current");
  return {
    async read(boardId) {
      return ((await doc(boardId).get()).data() as SavedContent | undefined) ?? null;
    },
    write(boardId, json, baseRevision) {
      return db.runTransaction(async (tx) => {
        const ref = doc(boardId);
        const revision = ((await tx.get(ref)).data() as SavedContent | undefined)?.revision ?? 0;
        if (revision !== baseRevision) return { ok: false as const, revision };
        const saved: SavedContent = { revision: revision + 1, updatedAt: currentIsoDate(), json };
        tx.set(ref, saved);
        return { ok: true as const, revision: saved.revision, updatedAt: saved.updatedAt };
      });
    },
    async remove(boardId) {
      await doc(boardId).delete();
    },
  };
}
