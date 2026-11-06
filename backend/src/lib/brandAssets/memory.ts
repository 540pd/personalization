import { currentIsoDate } from "../../utils/date.js";
import type { BrandAssetsStore, SavedBrandAssets } from "./types.js";

/** In this process only: local dev and tests. Synchronous inside, so no lock. */
export function memoryBrandAssetsStore(): BrandAssetsStore {
  const records = new Map<string, SavedBrandAssets>();
  return {
    async read(userId) {
      return records.get(userId) ?? null;
    },
    async write(userId, record, baseRevision) {
      const revision = records.get(userId)?.revision ?? 0;
      if (revision !== baseRevision) return { ok: false, revision };
      const saved = { revision: revision + 1, updatedAt: currentIsoDate(), record };
      records.set(userId, saved);
      return { ok: true, revision: saved.revision, updatedAt: saved.updatedAt };
    },
  };
}
