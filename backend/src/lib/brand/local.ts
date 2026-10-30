import { createHash } from "node:crypto";
import path from "node:path";
import { currentIsoDate } from "../../utils/date.js";
import { inside, readJson, writeAtomic } from "../localDisk.js";
import { keyedLock } from "../boards/types.js";
import type { BrandStore, SavedBrand } from "./types.js";

/**
 * As files (`<dir>/brand/<hash of user>.json`), as the Assets record is
 * (#413): named by a hash, since a user id is an email address. One process
 * owns the folder, so a per-user lock is the whole of the revision check.
 */
export function localBrandStore(root: string): BrandStore {
  const dir = path.join(root, "brand");
  const file = (userId: string) => inside(dir, `${createHash("sha256").update(userId).digest("hex").slice(0, 32)}.json`);
  const locked = keyedLock();
  return {
    read: (userId) => readJson<SavedBrand>(file(userId)),
    write: (userId, brand, baseRevision) =>
      locked(userId, async () => {
        const revision = (await readJson<SavedBrand>(file(userId)))?.revision ?? 0;
        if (revision !== baseRevision) return { ok: false as const, revision };
        const saved: SavedBrand = { revision: revision + 1, updatedAt: currentIsoDate(), brand };
        await writeAtomic(file(userId), JSON.stringify(saved, null, 2));
        return { ok: true as const, revision: saved.revision, updatedAt: saved.updatedAt };
      }),
  };
}
