import { describe, expect, it } from "vitest";
import { Firestore } from "@google-cloud/firestore";
import { memoryBoardStore } from "../boards/memory.js";
import { localBoardStore } from "../boards/local.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { firestoreBoardStore } from "../boards/firestore.js";
import type { BoardStore } from "../boards/types.js";

// One contract for every (memory, local disk #333, and) board store (#322). The memory store runs it on
// every `npm test`; the Firestore store whenever the emulator is up
// (`npm run test:emulators`, and CI).

const EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;

const stores: Array<[string, () => BoardStore, boolean]> = [
  ["memory", memoryBoardStore, true],
  ["local disk", () => localBoardStore(mkdtempSync(path.join(tmpdir(), "gcos-boards-"))), true],
  ["firestore (emulator)", () => firestoreBoardStore(new Firestore({ projectId: process.env.FIRESTORE_PROJECT_ID ?? "demo-gcos" })), EMULATOR],
];

/** A user no other test touches, so runs never see each other's boards. */
const user = () => `u-${Math.random().toString(36).slice(2)}@accenture.com`;

describe.each(stores)("%s board store", (_name, make, enabled) => {
  const run = enabled ? it : it.skip;

  run("creates a board and reads it back", async () => {
    const store = make();
    const ana = user();
    const board = await store.create(ana, "Spring launch");
    expect(board).toMatchObject({ userId: ana, name: "Spring launch" });
    expect(board.createdAt).toBe(board.updatedAt);
    expect(await store.get(board.id, ana)).toEqual(board);
  });

  run("lists only the user's boards, newest first", async () => {
    const store = make();
    const ana = user();
    const first = await store.create(ana, "First");
    await new Promise((r) => setTimeout(r, 5));
    const second = await store.create(ana, "Second");
    await store.create(user(), "Someone else's");
    expect((await store.list(ana)).map((b) => b.id)).toEqual([second.id, first.id]);
  });

  run("never finds or deletes another user's board", async () => {
    const store = make();
    const ana = user();
    const ben = user();
    const board = await store.create(ana, "Ana's");
    expect(await store.get(board.id, ben)).toBeNull();
    await store.remove(board.id, ben);
    expect(await store.get(board.id, ana)).toEqual(board);
  });

  run("ensure makes a board once, under the id given", async () => {
    const store = make();
    const ana = user();
    const id = `board-${Math.random().toString(36).slice(2)}`;
    const [a, b] = await Promise.all([store.ensure(id, ana, "PlaySpace"), store.ensure(id, ana, "PlaySpace")]);
    expect(a.id).toBe(id);
    expect((await store.ensure(id, ana, "Other")).name).toBe("PlaySpace");
    expect((await store.list(ana)).filter((x) => x.id === id)).toHaveLength(1);
    expect(b.id).toBe(id);
  });

  run("removes a board; removing again or a missing one is a no-op", async () => {
    const store = make();
    const ana = user();
    const board = await store.create(ana, "Gone");
    await store.remove(board.id, ana);
    expect(await store.get(board.id, ana)).toBeNull();
    await expect(store.remove(board.id, ana)).resolves.toBeUndefined();
    await expect(store.remove("no-such-board", ana)).resolves.toBeUndefined();
  });
});
