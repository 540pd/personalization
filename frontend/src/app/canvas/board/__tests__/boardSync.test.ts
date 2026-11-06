import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBoardSync, type BoardSyncDeps } from "../boardSync";
import type { BoardFile } from "../boardFileFormat";
import type { SyncMeta } from "../syncMeta";
import type { SaveReply } from "@/api/board.api";
import { useBoardSync } from "@/store/boardSync.store";

// The board saved to the account (#324): load, reconcile, save, conflict.

// The tag is both the board's savedAt, for reading in assertions, and its
// content: sameBoard ignores savedAt, so two tags must be two boards.
const file = (tag: string): BoardFile =>
  ({
    format: "gcos-playspace", version: 1, savedAt: tag, panels: [],
    nodes: [{ className: "Rect", attrs: { id: tag } }], frames: [], connections: [], topLayer: "canvas",
  }) as BoardFile;

function harness(opts: { meta?: SyncMeta | null; server?: { revision: number; content: unknown } } = {}) {
  let meta = opts.meta ?? null;
  const server = { revision: opts.server?.revision ?? 0, content: opts.server?.content ?? null, offline: false };
  let board = file("local");
  const saves: Array<{ revision: number; content: BoardFile; keepalive?: boolean }> = [];
  let nextSave: ((r: number, c: BoardFile) => SaveReply | Promise<SaveReply>) | null = null;

  const deps: BoardSyncDeps = {
    owner: "ana@accenture.com",
    fetchCurrent: async () => {
      if (server.offline) throw new Error("offline");
      return { revision: server.revision, updatedAt: null, content: server.content };
    },
    save: async (revision, content, opts) => {
      saves.push({ revision, content, ...(opts?.keepalive ? { keepalive: true } : {}) });
      if (nextSave) return nextSave(revision, content);
      if (server.offline) return { ok: false, kind: "retry" };
      if (revision !== server.revision) return { ok: false, kind: "conflict", revision: server.revision };
      server.revision += 1;
      server.content = content;
      return { ok: true, revision: server.revision };
    },
    serialize: () => board,
    parse: (c) => (c && typeof c === "object" ? (c as BoardFile) : null),
    adopt: (f) => {
      board = f;
      sync.markDirty(); // what the stores' subscriptions do on a replace
    },
    readMeta: () => meta,
    writeMeta: (m) => {
      meta = m;
    },
    delay: 1_000,
    backoff: [2_000, 4_000],
  };
  const sync = createBoardSync(deps);
  return {
    sync,
    server,
    saves,
    meta: () => meta,
    board: () => board,
    edit: (tag: string) => {
      board = file(tag);
      sync.markDirty();
    },
    replyNext: (fn: typeof nextSave) => {
      nextSave = fn;
    },
  };
}

const state = () => useBoardSync.getState().state;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  useBoardSync.setState({ state: "off", message: null, actions: null });
});

describe("on load", () => {
  it("adopts the account's newer copy, without sending it straight back", async () => {
    const h = harness({ meta: { owner: "ana@accenture.com", revision: 2, pending: false }, server: { revision: 5, content: file("server") } });
    await h.sync.start();
    expect(h.board().savedAt).toBe("server");
    expect(h.meta()).toEqual({ owner: "ana@accenture.com", revision: 5, pending: false });
    await vi.runAllTimersAsync();
    expect(h.saves).toEqual([]);
    expect(state()).toBe("saved");
  });

  it("keeps the local copy when it is already the latest", async () => {
    const h = harness({ meta: { owner: "ana@accenture.com", revision: 5, pending: false }, server: { revision: 5, content: file("server") } });
    await h.sync.start();
    expect(h.board().savedAt).toBe("local");
    expect(state()).toBe("saved");
  });

  it("sends changes made offline on top of the latest", async () => {
    const h = harness({ meta: { owner: "ana@accenture.com", revision: 5, pending: true }, server: { revision: 5, content: file("server") } });
    await h.sync.start();
    expect(h.saves).toEqual([{ revision: 5, content: file("local") }]);
    expect(h.meta()).toEqual({ owner: "ana@accenture.com", revision: 6, pending: false });
  });

  it("a new browser loads the account's board, though the board said it changed while starting (#432)", async () => {
    const h = harness({ server: { revision: 2, content: file("server") } });
    // The board's own start-up commit: nothing on it changed.
    h.sync.markDirty();
    expect(h.meta()).toBeNull();
    await h.sync.start();
    expect(h.board().savedAt).toBe("server");
    expect(state()).toBe("saved");
    await vi.runAllTimersAsync();
    expect(h.saves).toEqual([]);
  });

  it("a real edit made while the account's copy loads is still a conflict (#432)", async () => {
    const h = harness({ server: { revision: 2, content: file("server") } });
    h.edit("typed while loading");
    await h.sync.start();
    expect(state()).toBe("conflict");
    expect(h.board().savedAt).toBe("typed while loading");
    expect(h.saves).toEqual([]);
  });

  it("calls changes made on top of an older copy a conflict, and overwrites nothing", async () => {
    const h = harness({ meta: { owner: "ana@accenture.com", revision: 4, pending: true }, server: { revision: 5, content: file("server") } });
    await h.sync.start();
    expect(state()).toBe("conflict");
    expect(h.saves).toEqual([]);
    expect(h.board().savedAt).toBe("local");
  });

  it("a save that landed as the page closed is not a conflict with itself", async () => {
    // Its tab sent the board and closed before it could record the revision.
    const h = harness({ meta: { owner: "ana@accenture.com", revision: 2, pending: true }, server: { revision: 3, content: { ...file("local"), savedAt: "as it closed" } } });
    await h.sync.start();
    expect(state()).toBe("saved");
    expect(h.meta()).toEqual({ owner: "ana@accenture.com", revision: 3, pending: false });
    expect(h.saves).toEqual([]);
  });

  it("prepares the account's first board before sending it, and only then", async () => {
    const order: string[] = [];
    const h = harness({ server: { revision: 0, content: null } });
    const prepared = createBoardSync({
      owner: "ana@accenture.com",
      fetchCurrent: async () => ({ revision: h.server.revision, updatedAt: null, content: h.server.content }),
      save: async (revision) => {
        order.push(`save ${revision}`);
        h.server.revision += 1;
        return { ok: true, revision: h.server.revision };
      },
      serialize: () => file("local"),
      parse: () => null,
      adopt: () => {},
      beforeFirstSave: async () => {
        order.push("import");
        prepared.markDirty(); // what moving pictures does to the stores
      },
      readMeta: () => null,
      writeMeta: () => {},
    });
    await prepared.start();
    await vi.runAllTimersAsync();
    expect(order).toEqual(["import", "save 0"]);
  });

  it("saves a first board when the account has none", async () => {
    const h = harness({ server: { revision: 0, content: null } });
    await h.sync.start();
    expect(h.saves).toEqual([{ revision: 0, content: file("local") }]);
    expect(h.meta()?.revision).toBe(1);
  });

  it("never treats another account's local copy as its own", async () => {
    const h = harness({ meta: { owner: "ben@accenture.com", revision: 5, pending: true }, server: { revision: 3, content: file("ana") } });
    await h.sync.start();
    expect(h.board().savedAt).toBe("ana");
    expect(h.saves).toEqual([]);
    expect(h.meta()?.owner).toBe("ana@accenture.com");
  });

  it("offline, tries again with backoff", async () => {
    const h = harness({ server: { revision: 2, content: file("server") } });
    h.server.offline = true;
    await h.sync.start();
    expect(state()).toBe("retrying");
    h.server.offline = false;
    await vi.advanceTimersByTimeAsync(2_000);
    expect(h.board().savedAt).toBe("server");
    expect(state()).toBe("saved");
  });

  it("will not overwrite a saved board it cannot read", async () => {
    const h = harness({ server: { revision: 2, content: "garbage" } });
    await h.sync.start();
    expect(state()).toBe("conflict");
    expect(h.saves).toEqual([]);
  });
});

describe("saving", () => {
  async function loaded() {
    const h = harness({ meta: { owner: "ana@accenture.com", revision: 1, pending: false }, server: { revision: 1, content: file("local") } });
    await h.sync.start();
    return h;
  }

  it("saves once changes settle, and remembers they are pending meanwhile", async () => {
    const h = await loaded();
    h.edit("a");
    h.edit("b");
    expect(h.meta()?.pending).toBe(true);
    await vi.advanceTimersByTimeAsync(999);
    expect(h.saves).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.saves.map((s) => s.content.savedAt)).toEqual(["b"]);
    expect(h.meta()).toEqual({ owner: "ana@accenture.com", revision: 2, pending: false });
  });

  it("one request at a time; a change made meanwhile is sent after", async () => {
    const h = await loaded();
    let release!: (r: SaveReply) => void;
    h.replyNext(() => new Promise<SaveReply>((r) => (release = r)));
    h.edit("a");
    await vi.advanceTimersByTimeAsync(1_000);
    h.edit("b");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(h.saves).toHaveLength(1);
    h.replyNext(null);
    release({ ok: true, revision: 2 });
    h.server.revision = 2;
    await vi.runAllTimersAsync();
    expect(h.saves.map((s) => [s.revision, s.content.savedAt])).toEqual([[1, "a"], [2, "b"]]);
    expect(h.meta()?.pending).toBe(false);
  });

  it("offline, keeps the change and retries with backoff", async () => {
    const h = await loaded();
    h.server.offline = true;
    h.edit("a");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(state()).toBe("retrying");
    expect(h.meta()?.pending).toBe(true);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(h.saves).toHaveLength(2);
    h.server.offline = false;
    await vi.advanceTimersByTimeAsync(4_000);
    expect(state()).toBe("saved");
    expect(h.meta()?.pending).toBe(false);
  });

  it("stops at a conflict, and Load the latest takes the account's copy", async () => {
    const h = await loaded();
    h.server.revision = 3;
    h.server.content = file("other tab");
    h.edit("mine");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(state()).toBe("conflict");
    h.edit("more");
    await vi.runAllTimersAsync();
    expect(h.saves).toHaveLength(1);

    await useBoardSync.getState().actions!.loadLatest();
    expect(h.board().savedAt).toBe("other tab");
    expect(h.meta()).toEqual({ owner: "ana@accenture.com", revision: 3, pending: false });
    expect(state()).toBe("saved");
  });

  it("too large: says so, and tries again on the next change", async () => {
    const h = await loaded();
    h.replyNext(() => ({ ok: false, kind: "tooLarge", message: "The board is 950 KB" }));
    h.edit("big");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(useBoardSync.getState()).toMatchObject({ state: "tooLarge", message: "The board is 950 KB" });
    await vi.runAllTimersAsync();
    expect(h.saves).toHaveLength(1);
    h.replyNext(null);
    h.edit("smaller");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(state()).toBe("saved");
  });

  it("changes before the first load are kept, and sent once it lands", async () => {
    const h = harness({ meta: { owner: "ana@accenture.com", revision: 1, pending: false }, server: { revision: 1, content: file("local") } });
    h.edit("early");
    expect(h.saves).toEqual([]);
    await h.sync.start();
    expect(h.saves.map((s) => s.content.savedAt)).toEqual(["early"]);
  });
});

describe("closing the page", () => {
  it("sends a change still waiting for its timer, as keepalive", async () => {
    const h = harness({ meta: { owner: "ana@accenture.com", revision: 1, pending: false }, server: { revision: 1, content: file("local") } });
    await h.sync.start();
    h.edit("last");
    h.sync.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.saves).toEqual([{ revision: 1, content: file("last"), keepalive: true }]);
    await vi.runAllTimersAsync();
    expect(h.saves).toHaveLength(1);
  });

  it("does nothing with nothing waiting, or in a conflict", async () => {
    const h = harness({ meta: { owner: "ana@accenture.com", revision: 4, pending: true }, server: { revision: 5, content: file("server") } });
    await h.sync.start();
    h.sync.flush();
    h.edit("more");
    h.sync.flush();
    await vi.runAllTimersAsync();
    expect(h.saves).toEqual([]);
  });
});
