import type { DocumentSnapshot, Firestore } from "@google-cloud/firestore";
import { currentIsoDate } from "../../utils/date.js";
import { createId } from "../../utils/id.js";
import { byNewest, type Board, type BoardStore } from "./types.js";
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
    async remove(id, userId) {
      if (await owned(id, userId)) await boards.doc(id).delete();
    },
  };
}
