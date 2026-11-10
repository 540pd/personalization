import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Firestore } from "@google-cloud/firestore";
import { memoryBrandAssetsStore } from "../brandAssets/memory.js";
import { localBrandAssetsStore } from "../brandAssets/local.js";
import { firestoreBrandAssetsStore } from "../brandAssets/firestore.js";
import { emptyBrandAssets, type BrandAssetsStore } from "../brandAssets/types.js";

// One contract for the saved Assets page (#413): one record per user, saved
// by revision, a stale write refused. Memory and local disk on every
// `npm test`; Firestore whenever the emulator is up.

const EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;

const stores: Array<[string, () => BrandAssetsStore, boolean]> = [
  ["memory", memoryBrandAssetsStore, true],
  ["local disk", () => localBrandAssetsStore(mkdtempSync(path.join(tmpdir(), "gcos-brand-"))), true],
  ["firestore (emulator)", () => firestoreBrandAssetsStore(new Firestore({ projectId: process.env.FIRESTORE_PROJECT_ID ?? "demo-gcos" })), EMULATOR],
];

const user = () => `u-${Math.random().toString(36).slice(2)}@example.com`;
const record = (productName: string) => ({ ...emptyBrandAssets(), productName, assetIds: ["a1"], masterId: "a1" });

describe.each(stores)("%s brand assets store", (_name, make, enabled) => {
  const run = enabled ? it : it.skip;

  run("starts empty, and counts revisions from 1", async () => {
    const store = make();
    const ana = user();
    expect(await store.read(ana)).toBeNull();
    const first = await store.write(ana, record("Trail shoe"), 0);
    expect(first).toMatchObject({ ok: true, revision: 1 });
    expect(await store.read(ana)).toMatchObject({ revision: 1, record: record("Trail shoe") });
    expect(await store.write(ana, record("Road shoe"), 1)).toMatchObject({ ok: true, revision: 2 });
    expect((await store.read(ana))?.record.productName).toBe("Road shoe");
  });

  run("refuses a write based on a stale revision, and keeps the newer one", async () => {
    const store = make();
    const ana = user();
    await store.write(ana, record("First"), 0);
    await store.write(ana, record("Second"), 1);
    expect(await store.write(ana, record("Stale"), 1)).toEqual({ ok: false, revision: 2 });
    expect((await store.read(ana))?.record.productName).toBe("Second");
  });

  run("keeps each user's record apart", async () => {
    const store = make();
    const [ana, ben] = [user(), user()];
    await store.write(ana, record("Ana's"), 0);
    expect(await store.read(ben)).toBeNull();
    expect(await store.write(ben, record("Ben's"), 0)).toMatchObject({ ok: true, revision: 1 });
    expect((await store.read(ana))?.record.productName).toBe("Ana's");
  });
});
