import { createHash } from "node:crypto";
import path from "node:path";
import { currentIsoDate } from "../../utils/date.js";
import { inside, readJson, writeAtomic } from "../localDisk.js";
import { keyedLock } from "../boards/types.js";
import type { BrandAssetsStore, SavedBrandAssets } from "./types.js";

/**
 * As files (`<dir>/brand-assets/<hash of user>.json`): the local-disk
 * placeholder for Firestore (#333). Named by a hash, as a user id is an email
 * address and file names stay plain (localDisk's `inside`). One process owns
 * the folder, so a per-user lock is the whole of the revision check.
 */
export function localBrandAssetsStore(root: string): BrandAssetsStore {
  const dir = path.join(root, "brand-assets");
  const file = (userId: string) => inside(dir, `${createHash("sha256").update(userId).digest("hex").slice(0, 32)}.json`);
  const locked = keyedLock();
  return {
    read: (userId) => readJson<SavedBrandAssets>(file(userId)),
    write: (userId, record, baseRevision) =>
      locked(userId, async () => {
        const revision = (await readJson<SavedBrandAssets>(file(userId)))?.revision ?? 0;
        if (revision !== baseRevision) return { ok: false as const, revision };
        const saved: SavedBrandAssets = { revision: revision + 1, updatedAt: currentIsoDate(), record };
        await writeAtomic(file(userId), JSON.stringify(saved, null, 2));
        return { ok: true as const, revision: saved.revision, updatedAt: saved.updatedAt };
      }),
  };
}
