import type { Firestore } from "@google-cloud/firestore";
import { currentIsoDate } from "../../utils/date.js";
import { getFirestoreClient } from "../firestore.js";
import type { BrandStore, SavedBrand } from "./types.js";

/** brand/{userId}. The revision check runs in a transaction, so two instances cannot both accept a write. */
export function firestoreBrandStore(db: Firestore = getFirestoreClient()): BrandStore {
  const doc = (userId: string) => db.collection("brand").doc(userId);
  return {
    async read(userId) {
      return ((await doc(userId).get()).data() as SavedBrand | undefined) ?? null;
    },
    write(userId, brand, baseRevision) {
      return db.runTransaction(async (tx) => {
        const ref = doc(userId);
        const revision = ((await tx.get(ref)).data() as SavedBrand | undefined)?.revision ?? 0;
        if (revision !== baseRevision) return { ok: false as const, revision };
        const saved: SavedBrand = { revision: revision + 1, updatedAt: currentIsoDate(), brand };
        tx.set(ref, saved);
        return { ok: true as const, revision: saved.revision, updatedAt: saved.updatedAt };
      });
    },
  };
}
