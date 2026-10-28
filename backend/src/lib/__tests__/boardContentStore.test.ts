import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Firestore } from "@google-cloud/firestore";
import { memoryBoardContentStore } from "../boards/memory.js";
import { localBoardContentStore } from "../boards/local.js";
import { firestoreBoardContentStore } from "../boards/firestore.js";
import type { BoardContentStore } from "../boards/types.js";

// One contract for board content (#324): saved by revision, and a write
// based on a stale revision refused. Memory and local disk on every
// `npm test`; Firestore whenever the emulator is up (CI).

const EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;

const stores: Array<[string, () => BoardContentStore, boolean]> = [
  ["memory", memoryBoardContentStore, true],
  ["local disk", () => localBoardContentStore(mkdtempSync(path.join(tmpdir(), "gcos-content-"))), true],
  ["firestore (emulator)", () => firestoreBoardContentStore(new Firestore({ projectId: process.env.FIRESTORE_PROJECT_ID ?? "demo-gcos" })), EMULATOR],
];

const board = () => `b-${Math.random().toString(36).slice(2)}`;

describe.each(stores)("%s board content store", (_name, make, enabled) => {
  const run = enabled ? it : it.skip;

  run("starts empty, and counts revisions from 1", async () => {
    const store = make();
    const id = board();
    expect(await store.read(id)).toBeNull();
    const first = await store.write(id, '{"a":1}', 0);
    expect(first).toMatchObject({ ok: true, revision: 1 });
    const second = await store.write(id, '{"a":2}', 1);
    expect(second).toMatchObject({ ok: true, revision: 2 });
    expect(await store.read(id)).toMatchObject({ revision: 2, json: '{"a":2}' });
  });

  run("refuses a write based on a stale revision, and says the latest", async () => {
    const store = make();
    const id = board();
    await store.write(id, '{"tab":1}', 0);
    expect(await store.write(id, '{"tab":2}', 0)).toEqual({ ok: false, revision: 1 });
    expect((await store.read(id))?.json).toBe('{"tab":1}');
  });

  run("of two writes at once from the same revision, exactly one lands", async () => {
    const store = make();
    const id = board();
    const results = await Promise.all([store.write(id, '{"a":1}', 0), store.write(id, '{"b":1}', 0)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, revision: 1 });
  });

  run("remove empties it", async () => {
    const store = make();
    const id = board();
    await store.write(id, "{}", 0);
    await store.remove(id);
    expect(await store.read(id)).toBeNull();
  });
});
