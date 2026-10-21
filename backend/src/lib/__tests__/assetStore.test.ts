import { describe, expect, it } from "vitest";
import { Firestore } from "@google-cloud/firestore";
import { Storage } from "@google-cloud/storage";
import { memoryAssetStore } from "../assets/memory.js";
import { localAssetStore } from "../assets/local.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cloudAssetStore, objectName } from "../assets/cloud.js";
import { assetIdFromUrl, assetUrl, type AssetStore } from "../assets/index.js";

// One contract for every (memory, local disk #333, and) asset store (#323). Memory on every `npm test`;
// Cloud Storage + Firestore whenever both emulators are up (CI).

const EMULATED = !!process.env.FIRESTORE_EMULATOR_HOST && !!process.env.STORAGE_EMULATOR_HOST;
const bucket = () => new Storage().bucket(process.env.GCS_BUCKET_NAME ?? "demo-gcos.appspot.com");

const stores: Array<[string, () => AssetStore, boolean]> = [
  ["memory", memoryAssetStore, true],
  ["local disk", () => localAssetStore(mkdtempSync(path.join(tmpdir(), "gcos-assets-"))), true],
  ["cloud (emulators)", () => cloudAssetStore(new Firestore({ projectId: process.env.FIRESTORE_PROJECT_ID ?? "demo-gcos" }), bucket()), EMULATED],
];

const user = () => `u-${Math.random().toString(36).slice(2)}@accenture.com`;
const bytes = Buffer.from("not really a png");

async function readAll(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.from(c as Buffer));
  return Buffer.concat(chunks);
}

describe.each(stores)("%s asset store", (_name, make, enabled) => {
  const run = enabled ? it : it.skip;

  run("stores bytes and reads them back", async () => {
    const store = make();
    const ana = user();
    const asset = await store.put(ana, bytes, "image/png", "upload");
    expect(asset).toMatchObject({ userId: ana, mimeType: "image/png", bytes: bytes.length, source: "upload" });
    expect(await store.get(asset.id, ana)).toEqual(asset);
    const opened = await store.open(asset.id, ana);
    expect(opened?.asset).toEqual(asset);
    expect(Buffer.compare(await readAll(opened!.stream), bytes)).toBe(0);
  });

  run("never finds, opens or deletes another user's asset", async () => {
    const store = make();
    const ana = user();
    const asset = await store.put(ana, bytes, "image/png", "generated");
    const ben = user();
    expect(await store.get(asset.id, ben)).toBeNull();
    expect(await store.open(asset.id, ben)).toBeNull();
    await store.remove(asset.id, ben);
    expect(await store.get(asset.id, ana)).toEqual(asset);
  });

  run("lists the user's assets newest first; remove takes one away", async () => {
    const store = make();
    const ana = user();
    const a = await store.put(ana, bytes, "image/png", "upload");
    await new Promise((r) => setTimeout(r, 5));
    const b = await store.put(ana, bytes, "video/mp4", "generated");
    await store.put(user(), bytes, "image/png", "upload");
    expect((await store.list(ana)).map((x) => x.id)).toEqual([b.id, a.id]);
    await store.remove(a.id, ana);
    expect((await store.list(ana)).map((x) => x.id)).toEqual([b.id]);
    expect(await store.open(a.id, ana)).toBeNull();
    await expect(store.remove(a.id, ana)).resolves.toBeUndefined();
  });
});

describe.skipIf(!EMULATED)("cloud asset store layout", () => {
  it("keeps the bytes under the owner, and deletes them with the asset", async () => {
    const ana = user();
    const store = cloudAssetStore(new Firestore({ projectId: process.env.FIRESTORE_PROJECT_ID ?? "demo-gcos" }), bucket());
    const asset = await store.put(ana, bytes, "image/png", "upload");
    const file = bucket().file(objectName(ana, asset.id));
    expect(file.name).toBe(`users/${encodeURIComponent(ana)}/assets/${asset.id}`);
    expect((await file.exists())[0]).toBe(true);
    await store.remove(asset.id, ana);
    expect((await file.exists())[0]).toBe(false);
  });
});

describe("asset URLs", () => {
  it("round-trip an id, and name nothing else", () => {
    const id = "0b9f3c1e-2d4a-4b8e-9f6a-1c2d3e4f5a6b";
    expect(assetIdFromUrl(assetUrl(id))).toBe(id);
    for (const url of ["data:image/png;base64,AAAA", "https://example.com/a.png", `/api/proxy/assets/${id}/content?x=1`, "/api/proxy/assets/../content"]) {
      expect(assetIdFromUrl(url)).toBeNull();
    }
  });
});
