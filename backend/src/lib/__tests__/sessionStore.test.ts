import { describe, expect, it, vi } from "vitest";
import { Firestore } from "@google-cloud/firestore";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { firestoreSessionStore, localSessionStore, memorySessionStore } from "../sessions/stores.js";
import { hashSessionId, newSessionId, sessionService } from "../sessions/index.js";
import { sessionConfig, type SessionConfig } from "../sessions/config.js";
import type { SessionRecord, SessionStore } from "../sessions/types.js";
import type { Owner } from "../identity/index.js";

// Opaque, revocable sessions (#489, PACK NJS-03). The store contract runs on
// memory and local disk every `npm test`, on Firestore when the emulator is up.

const EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;

const stores: Array<[string, () => SessionStore, boolean]> = [
  ["memory", memorySessionStore, true],
  ["local disk", () => localSessionStore(mkdtempSync(path.join(tmpdir(), "gcos-sessions-"))), true],
  ["firestore (emulator)", () => firestoreSessionStore(new Firestore({ projectId: process.env.FIRESTORE_PROJECT_ID ?? "demo-gcos" })), EMULATOR],
];

const record = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  sessionHash: hashSessionId(newSessionId()),
  ownerKey: `usr_${Math.random().toString(36).slice(2)}`,
  email: "ana@accenture.com",
  createdAt: 1000,
  lastSeenAt: 1000,
  idleExpiresAt: 2000,
  absoluteExpiresAt: 5000,
  revokedAt: null,
  ...over,
});

describe.each(stores)("%s session store", (_name, make, enabled) => {
  const run = enabled ? it : it.skip;

  run("creates and reads back a session, by hash", async () => {
    const store = make();
    const r = record();
    await store.create(r);
    expect(await store.get(r.sessionHash)).toEqual(r);
    expect(await store.get(hashSessionId(newSessionId()))).toBeNull();
  });

  run("refuses to create the same hash twice", async () => {
    const store = make();
    const r = record();
    await store.create(r);
    await expect(store.create(r)).rejects.toThrow();
  });

  run("touches a live session, never a revoked one", async () => {
    const store = make();
    const live = record();
    const gone = record({ revokedAt: 1500 });
    await store.create(live);
    await store.create(gone);
    await store.touch(live.sessionHash, 1800, 2800);
    await store.touch(gone.sessionHash, 1800, 2800);
    expect(await store.get(live.sessionHash)).toMatchObject({ lastSeenAt: 1800, idleExpiresAt: 2800 });
    expect(await store.get(gone.sessionHash)).toMatchObject({ lastSeenAt: 1000, idleExpiresAt: 2000 });
  });

  run("revokes once, keeping the first time", async () => {
    const store = make();
    const r = record();
    await store.create(r);
    await store.revoke(r.sessionHash, 1500);
    await store.revoke(r.sessionHash, 1700);
    expect((await store.get(r.sessionHash))?.revokedAt).toBe(1500);
  });

  run("revokes every live session of one owner, and only theirs", async () => {
    const store = make();
    const owner = `usr_${Math.random().toString(36).slice(2)}`;
    const mine = [record({ ownerKey: owner }), record({ ownerKey: owner }), record({ ownerKey: owner, revokedAt: 1200 })];
    const theirs = record();
    for (const r of [...mine, theirs]) await store.create(r);
    expect(await store.revokeAllForOwner(owner, 1600)).toBe(2);
    expect((await store.get(mine[0].sessionHash))?.revokedAt).toBe(1600);
    expect((await store.get(mine[2].sessionHash))?.revokedAt).toBe(1200);
    expect((await store.get(theirs.sessionHash))?.revokedAt).toBeNull();
  });
});

describe("local disk session store", () => {
  it("names each file by the hash: the session ID itself is never written", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "gcos-sessions-"));
    const id = newSessionId();
    await localSessionStore(dir).create(record({ sessionHash: hashSessionId(id) }));
    const files = readdirSync(path.join(dir, "login-sessions"));
    expect(files).toEqual([`${hashSessionId(id)}.json`]);
    expect(readFileSync(path.join(dir, "login-sessions", files[0]), "utf8")).not.toContain(id);
  });
});

describe("sessionConfig", () => {
  it("defaults to jwt, 7 days idle, 30 days absolute, renewal at most hourly", () => {
    expect(sessionConfig({})).toEqual({ mode: "jwt", idleMs: 7 * 864e5, absoluteMs: 30 * 864e5, touchAfterMs: 36e5, cacheMs: 10_000 });
  });

  it("reads opaque mode and the timeouts", () => {
    expect(sessionConfig({ SESSION_MODE: "opaque", SESSION_IDLE_SECONDS: "1200", SESSION_ABSOLUTE_SECONDS: "3600" })).toMatchObject({
      mode: "opaque",
      idleMs: 1_200_000,
      absoluteMs: 3_600_000,
      touchAfterMs: 300_000,
    });
  });

  it.each([
    [{ SESSION_MODE: "cookie" }, /SESSION_MODE/],
    [{ SESSION_IDLE_SECONDS: "60" }, /SESSION_IDLE_SECONDS/],
    [{ SESSION_ABSOLUTE_SECONDS: "forever" }, /SESSION_ABSOLUTE_SECONDS/],
    [{ SESSION_IDLE_SECONDS: "7200", SESSION_ABSOLUTE_SECONDS: "3600" }, /longer than/],
  ])("refuses %o", (env, message) => {
    expect(() => sessionConfig(env)).toThrow(message);
  });
});

describe("sessionService", () => {
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const config: SessionConfig = { mode: "opaque", idleMs: 7 * 24 * HOUR, absoluteMs: 30 * 24 * HOUR, touchAfterMs: HOUR, cacheMs: 10_000 };

  function setup(over: { store?: SessionStore; status?: Owner["status"] } = {}) {
    let clock = 1_800_000_000_000;
    const store = over.store ?? memorySessionStore();
    const statuses = new Map<string, Owner["status"]>();
    const getOwner = vi.fn(async (ownerKey: string): Promise<Owner | null> => ({
      ownerKey,
      status: statuses.get(ownerKey) ?? over.status ?? "active",
      email: "ana@accenture.com",
      hostedDomain: "accenture.com",
      createdAt: "",
      lastLoginAt: "",
    }));
    const setOwnerDisabled = vi.fn(async (ownerKey: string) => void statuses.set(ownerKey, "disabled"));
    const svc = sessionService({ store, getOwner, setOwnerDisabled, config, now: () => clock });
    return { svc, store, getOwner, statuses, setOwnerDisabled, tick: (ms: number) => (clock += ms), now: () => clock };
  }
  const ana = { email: "ana@accenture.com", ownerKey: "usr_ana" };

  it("makes a 256-bit random ID and stores only its SHA-256 hash", async () => {
    const { svc, store } = setup();
    const { id, record: r } = await svc.create(ana);
    expect(id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(id, "base64url")).toHaveLength(32);
    expect(r.sessionHash).toBe(hashSessionId(id));
    expect(r.sessionHash).not.toContain(id);
    expect(await store.get(id)).toBeNull();
    expect(await store.get(r.sessionHash)).toMatchObject({ ownerKey: "usr_ana", revokedAt: null });
  });

  it("sets the idle and absolute deadlines from sign-in", async () => {
    const { svc, now } = setup();
    const { record: r } = await svc.create(ana);
    expect(r.idleExpiresAt - now()).toBe(config.idleMs);
    expect(r.absoluteExpiresAt - now()).toBe(config.absoluteMs);
  });

  it("resolves a live session", async () => {
    const { svc } = setup();
    const { id } = await svc.create(ana);
    expect(await svc.resolve(id)).toMatchObject({ ok: true, record: { email: "ana@accenture.com", ownerKey: "usr_ana" } });
  });

  it.each([
    ["no cookie", undefined],
    ["a malformed one", "nope"],
    ["an old JWT cookie", "eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6ImFuYUBhY2NlbnR1cmUuY29tIn0.sig"],
    ["an unknown ID", newSessionId()],
  ])("refuses %s as not_found", async (_label, id) => {
    expect(await setup().svc.resolve(id)).toEqual({ ok: false, reason: "not_found" });
  });

  it("expires an idle session", async () => {
    const { svc, tick } = setup();
    const { id } = await svc.create(ana);
    tick(config.idleMs);
    expect(await svc.resolve(id)).toEqual({ ok: false, reason: "idle_expired" });
  });

  it("renews the idle deadline at most once per touch interval", async () => {
    const { svc, store, tick } = setup();
    const { id, record: r } = await svc.create(ana);
    const touch = vi.spyOn(store, "touch");
    tick(10 * MIN);
    await svc.resolve(id);
    expect(touch).not.toHaveBeenCalled();
    tick(HOUR);
    await svc.resolve(id);
    expect(touch).toHaveBeenCalledTimes(1);
    expect((await store.get(r.sessionHash))!.idleExpiresAt).toBeGreaterThan(r.idleExpiresAt);
  });

  it("keeps a session in use alive, but never past the absolute deadline", async () => {
    const { svc, store, tick } = setup();
    const { id, record: r } = await svc.create(ana);
    for (let day = 0; day < 29; day++) {
      tick(24 * HOUR);
      expect((await svc.resolve(id)).ok).toBe(true);
    }
    const stored = (await store.get(r.sessionHash))!;
    expect(stored.idleExpiresAt).toBeLessThanOrEqual(r.absoluteExpiresAt);
    tick(24 * HOUR);
    expect(await svc.resolve(id)).toEqual({ ok: false, reason: "absolute_expired" });
  });

  it("refuses a revoked session, and a replay of it, at once", async () => {
    const { svc } = setup();
    const { id } = await svc.create(ana);
    expect((await svc.resolve(id)).ok).toBe(true); // now cached
    await svc.revoke(id);
    expect(await svc.resolve(id)).toEqual({ ok: false, reason: "revoked" });
    expect(await svc.resolve(id)).toEqual({ ok: false, reason: "revoked" });
  });

  it("revokes even an expired session", async () => {
    const { svc, store, tick } = setup();
    const { id, record: r } = await svc.create(ana);
    tick(config.absoluteMs + HOUR);
    await svc.revoke(id);
    expect((await store.get(r.sessionHash))!.revokedAt).not.toBeNull();
  });

  it("refuses a session whose owner is disabled", async () => {
    const { svc } = setup({ status: "disabled" });
    const { id } = await svc.create(ana);
    expect(await svc.resolve(id)).toEqual({ ok: false, reason: "disabled" });
  });

  it("disableOwner disables the owner and revokes every one of their sessions, at once here", async () => {
    const { svc, setOwnerDisabled } = setup();
    const a = await svc.create(ana);
    const b = await svc.create(ana);
    const ben = await svc.create({ email: "ben@accenture.com", ownerKey: "usr_ben" });
    await svc.resolve(a.id); // cached
    expect(await svc.disableOwner("usr_ana")).toEqual({ revoked: 2 });
    expect(setOwnerDisabled).toHaveBeenCalledWith("usr_ana");
    expect((await svc.resolve(a.id)).ok).toBe(false);
    expect((await svc.resolve(b.id)).ok).toBe(false);
    expect((await svc.resolve(ben.id)).ok).toBe(true);
  });

  it("another instance sees a revocation within the 10 s cache, never later", async () => {
    const store = memorySessionStore();
    const here = setup({ store });
    const there = setup({ store });
    const { id } = await here.svc.create(ana);
    expect((await there.svc.resolve(id)).ok).toBe(true); // cached there
    await here.svc.revoke(id);
    there.tick(9_000);
    expect((await there.svc.resolve(id)).ok).toBe(true); // within the documented bound
    there.tick(1_000);
    expect(await there.svc.resolve(id)).toEqual({ ok: false, reason: "revoked" });
  });

  it("reads the store and the owner at most once per 10 s for a session in use", async () => {
    const { svc, store, getOwner, tick } = setup();
    const { id } = await svc.create(ana);
    const get = vi.spyOn(store, "get");
    for (let i = 0; i < 5; i++) await svc.resolve(id);
    expect(get).toHaveBeenCalledTimes(1);
    expect(getOwner).toHaveBeenCalledTimes(1);
    tick(10_000);
    await svc.resolve(id);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("refuses when the store can't be read, failing closed", async () => {
    const store = memorySessionStore();
    const { svc } = setup({ store });
    const { id } = await svc.create(ana);
    vi.spyOn(store, "get").mockRejectedValue(new Error("UNAVAILABLE"));
    expect(await svc.resolve(id)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("checks no owner for a dev sign-in session (it has none)", async () => {
    const { svc, getOwner } = setup();
    const { id } = await svc.create({ email: "dev@accenture.com", ownerKey: null });
    expect((await svc.resolve(id)).ok).toBe(true);
    expect(getOwner).not.toHaveBeenCalled();
  });
});
