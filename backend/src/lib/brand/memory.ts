import { currentIsoDate } from "../../utils/date.js";
import type { BrandStore, SavedBrand } from "./types.js";

/** In this process only: local dev and tests. Synchronous inside, so no lock. */
export function memoryBrandStore(): BrandStore {
  const records = new Map<string, SavedBrand>();
  return {
    async read(userId) {
      return records.get(userId) ?? null;
    },
    async write(userId, brand, baseRevision) {
      const revision = records.get(userId)?.revision ?? 0;
      if (revision !== baseRevision) return { ok: false, revision };
      const saved = { revision: revision + 1, updatedAt: currentIsoDate(), brand };
      records.set(userId, saved);
      return { ok: true, revision: saved.revision, updatedAt: saved.updatedAt };
    },
  };
}
