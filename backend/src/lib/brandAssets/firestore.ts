import type { Firestore } from "@google-cloud/firestore";
import { currentIsoDate } from "../../utils/date.js";
import { getFirestoreClient } from "../firestore.js";
import type { BrandAssetsStore, SavedBrandAssets } from "./types.js";

/**
 * brandAssets/{userId}. The revision check runs in a transaction, so two
 * instances cannot both accept a write.
 */
export function firestoreBrandAssetsStore(db: Firestore = getFirestoreClient()): BrandAssetsStore {
  const doc = (userId: string) => db.collection("brandAssets").doc(userId);
  return {
    async read(userId) {
      return ((await doc(userId).get()).data() as SavedBrandAssets | undefined) ?? null;
    },
    write(userId, record, baseRevision) {
      return db.runTransaction(async (tx) => {
        const ref = doc(userId);
        const revision = ((await tx.get(ref)).data() as SavedBrandAssets | undefined)?.revision ?? 0;
        if (revision !== baseRevision) return { ok: false as const, revision };
        const saved: SavedBrandAssets = { revision: revision + 1, updatedAt: currentIsoDate(), record };
        tx.set(ref, saved);
        return { ok: true as const, revision: saved.revision, updatedAt: saved.updatedAt };
      });
    },
  };
}
