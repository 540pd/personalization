import { describe, expect, it, vi } from "vitest";
import { Firestore } from "@google-cloud/firestore";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { firestoreIdentityStore, localIdentityStore, memoryIdentityStore } from "../identity/stores.js";
import { linkIdFor, linkKey, type LinkKey } from "../identity/linkKey.js";
import { newOwnerKey, OWNER_CACHE_MS, ownerService } from "../identity/index.js";
import { CorruptIdentityLinkError, type IdentityStore } from "../identity/types.js";
import type { VerifiedGoogleIdentity } from "../googleIdToken.js";

// Owner keys and identity links (#488, PACK NJS-02). One contract for every
// identity store: memory and local disk on every `npm test`, Firestore when
// the emulator is up (`npm run test:emulators`, and CI).

const EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;

const stores: Array<[string, () => IdentityStore, boolean]> = [
  ["memory", memoryIdentityStore, true],
  ["local disk", () => localIdentityStore(mkdtempSync(path.join(tmpdir(), "gcos-identity-"))), true],
  ["firestore (emulator)", () => firestoreIdentityStore(new Firestore({ projectId: process.env.FIRESTORE_PROJECT_ID ?? "demo-gcos" })), EMULATOR],
];

const KEY: LinkKey = { key: Buffer.alloc(32, 7), version: 1, ephemeral: false };
const unique = () => Math.random().toString(36).slice(2);
const profile = (email = "ana@accenture.com") => ({ email, hostedDomain: "accenture.com" });

describe.each(stores)("%s identity store", (_name, make, enabled) => {
  const run = enabled ? it : it.skip;

  run("creates the owner and its link on first sign-in, then finds them", async () => {
    const store = make();
    const linkId = `v1_${unique()}`;
    const key = newOwnerKey();
    const first = await store.findOrCreate(linkId, 1, profile(), key);
    expect(first).toMatchObject({ created: true, owner: { ownerKey: key, status: "active", email: "ana@accenture.com" } });
    const again = await store.findOrCreate(linkId, 1, profile(), newOwnerKey());
    expect(again).toMatchObject({ created: false, owner: { ownerKey: key } });
    expect(await store.get(key)).toMatchObject({ ownerKey: key, status: "active" });
  });

  run("keeps the owner when the email changes, refreshing the profile only", async () => {
    const store = make();
    const linkId = `v1_${unique()}`;
    const { owner } = await store.findOrCreate(linkId, 1, profile("ana@accenture.com"), newOwnerKey());
    const after = await store.findOrCreate(linkId, 1, profile("ana.silva@accenture.com"), newOwnerKey());
    expect(after.owner.ownerKey).toBe(owner.ownerKey);
    expect((await store.get(owner.ownerKey))?.email).toBe("ana.silva@accenture.com");
  });

  run("makes one owner from several first sign-ins at once", async () => {
    const store = make();
    const linkId = `v1_${unique()}`;
    const results = await Promise.all(Array.from({ length: 5 }, () => store.findOrCreate(linkId, 1, profile(), newOwnerKey())));
    expect(new Set(results.map((r) => r.owner.ownerKey)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
  });

  run("never changes a disabled owner's status on sign-in", async () => {
    const store = make();
    const linkId = `v1_${unique()}`;
    const { owner } = await store.findOrCreate(linkId, 1, profile(), newOwnerKey());
    await store.setStatus(owner.ownerKey, "disabled");
    const again = await store.findOrCreate(linkId, 1, profile(), newOwnerKey());
    expect(again).toMatchObject({ created: false, owner: { ownerKey: owner.ownerKey, status: "disabled" } });
  });

  run("answers null for an unknown owner, and ignores a status change for one", async () => {
    const store = make();
    expect(await store.get(newOwnerKey())).toBeNull();
    await expect(store.setStatus(newOwnerKey(), "disabled")).resolves.toBeUndefined();
  });
});

describe("local disk identity store", () => {
  it("keeps one file per owner and per link, with nothing else", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "gcos-identity-"));
    const store = localIdentityStore(dir);
    const { owner } = await store.findOrCreate("v1_abc", 1, profile(), newOwnerKey());
    expect(readdirSync(path.join(dir, "users"))).toEqual([`${owner.ownerKey}.json`]);
    expect(readdirSync(path.join(dir, "identity-links"))).toEqual(["v1_abc.json"]);
  });

  it("refuses a link whose owner is gone, instead of making a second owner", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "gcos-identity-"));
    const store = localIdentityStore(dir);
    const { owner } = await store.findOrCreate("v1_gone", 1, profile(), newOwnerKey());
    const { rmSync } = await import("node:fs");
    rmSync(path.join(dir, "users", `${owner.ownerKey}.json`));
    await expect(store.findOrCreate("v1_gone", 1, profile(), newOwnerKey())).rejects.toBeInstanceOf(CorruptIdentityLinkError);
    expect(readdirSync(path.join(dir, "users"))).toEqual([]);
  });
});

describe("linkKey and linkIdFor", () => {
  it("reads a hex or base64 key of at least 32 bytes, version 1 by default", () => {
    const hex = "ab".repeat(32);
    expect(linkKey({ IDENTITY_LINK_HMAC_KEY: hex }, true)).toMatchObject({ version: 1, ephemeral: false });
    expect(linkKey({ IDENTITY_LINK_HMAC_KEY: Buffer.alloc(32, 1).toString("base64") }, true).key).toHaveLength(32);
    expect(linkKey({ IDENTITY_LINK_HMAC_KEY: hex, IDENTITY_LINK_HMAC_KEY_VERSION: "3" }, true).version).toBe(3);
  });

  it.each([
    [{ IDENTITY_LINK_HMAC_KEY: "ab".repeat(8) }, /at least 32 bytes/],
    [{ IDENTITY_LINK_HMAC_KEY: "not a key!" }, /at least 32 bytes/],
    [{ IDENTITY_LINK_HMAC_KEY: "ab".repeat(32), IDENTITY_LINK_HMAC_KEY_VERSION: "0" }, /VERSION/],
    [{ IDENTITY_LINK_HMAC_KEY: "ab".repeat(32), IDENTITY_LINK_HMAC_KEY_VERSION: "v2" }, /VERSION/],
  ])("refuses %o", (env, message) => {
    expect(() => linkKey(env, false)).toThrow(message);
  });

  it("refuses to start deployed without a key, and makes one per process locally", () => {
    expect(() => linkKey({}, true)).toThrow(/Refusing to start/);
    const a = linkKey({}, false);
    const b = linkKey({}, false);
    expect(a.ephemeral).toBe(true);
    expect(a.key.equals(b.key)).toBe(false);
  });

  it("is stable for one account, prefixed with the key version", () => {
    const id = linkIdFor("https://accounts.google.com", "123", KEY);
    expect(id).toMatch(/^v1_[0-9a-f]{64}$/);
    expect(linkIdFor("https://accounts.google.com", "123", KEY)).toBe(id);
  });

  it("differs for another subject, issuer, key or version, and isn't fooled by moving the boundary", () => {
    const id = linkIdFor("a", "bc", KEY);
    expect(linkIdFor("ab", "c", KEY)).not.toBe(id);
    expect(linkIdFor("a", "bd", KEY)).not.toBe(id);
    expect(linkIdFor("a", "bc", { ...KEY, key: Buffer.alloc(32, 8) })).not.toBe(id);
    expect(linkIdFor("a", "bc", { ...KEY, version: 2 })).toMatch(/^v2_/);
  });

  it("never contains the email, issuer or subject", () => {
    const id = linkIdFor("https://accounts.google.com", "sub-999", KEY);
    expect(id).not.toContain("sub-999");
    expect(id).not.toContain("google");
  });
});

describe("findOrCreateOwner", () => {
  const identity = (over: Partial<VerifiedGoogleIdentity> = {}): VerifiedGoogleIdentity => ({
    issuer: "https://accounts.google.com",
    subject: "sub-ana",
    email: "ana@accenture.com",
    hostedDomain: "accenture.com",
    ...over,
  });

  function service(store: IdentityStore = memoryIdentityStore()) {
    let clock = 1_000_000;
    const svc = ownerService({ store, key: KEY, now: () => clock });
    return { ...svc, store, tick: (ms: number) => (clock += ms) };
  }

  it("returns the stored owner key for a known identity", async () => {
    const { findOrCreateOwner } = service();
    const first = await findOrCreateOwner(identity());
    expect(first).toMatchObject({ ok: true, created: true });
    expect(await findOrCreateOwner(identity())).toMatchObject({ ok: true, ownerKey: first.ok && first.ownerKey });
  });

  it("makes random, opaque owner keys: not derived from the account", async () => {
    const a = await service().findOrCreateOwner(identity());
    const b = await service().findOrCreateOwner(identity());
    expect(a.ok && a.ownerKey).toMatch(/^usr_[A-Za-z0-9_-]{32}$/);
    expect(a.ok && b.ok && a.ownerKey !== b.ownerKey).toBe(true);
  });

  it("keeps the owner when the email changes; another subject gets another owner", async () => {
    const { findOrCreateOwner } = service();
    const ana = await findOrCreateOwner(identity());
    const renamed = await findOrCreateOwner(identity({ email: "ana.silva@accenture.com" }));
    const ben = await findOrCreateOwner(identity({ subject: "sub-ben", email: "ana@accenture.com" }));
    expect(renamed.ok && ana.ok && renamed.ownerKey).toBe(ana.ok && ana.ownerKey);
    expect(ben.ok && ana.ok && ben.ownerKey !== ana.ownerKey).toBe(true);
  });

  it("makes one owner from parallel first sign-ins", async () => {
    const { findOrCreateOwner } = service();
    const results = await Promise.all(Array.from({ length: 5 }, () => findOrCreateOwner(identity())));
    expect(new Set(results.map((r) => r.ok && r.ownerKey)).size).toBe(1);
  });

  it("refuses a disabled owner at once, and never re-creates it as a new one", async () => {
    const { findOrCreateOwner, setOwnerStatus, store } = service();
    const first = await findOrCreateOwner(identity());
    if (!first.ok) throw new Error("expected an owner");
    await setOwnerStatus(first.ownerKey, "disabled");
    expect(await findOrCreateOwner(identity())).toMatchObject({ ok: false, code: "account_disabled" });
    expect(await findOrCreateOwner(identity({ email: "new.email@accenture.com" }))).toMatchObject({ ok: false, code: "account_disabled" });
    expect((await store.get(first.ownerKey))?.status).toBe("disabled");
  });

  it("refuses when the store fails, and leaves no owner behind", async () => {
    const store = memoryIdentityStore();
    const failing: IdentityStore = { ...store, findOrCreate: vi.fn(async () => Promise.reject(new Error("ABORTED: contention"))) };
    const { findOrCreateOwner } = service(failing);
    expect(await findOrCreateOwner(identity())).toMatchObject({ ok: false, code: "identity_unavailable" });
    // The real store was never written: the same identity still makes a fresh owner.
    expect(await service(store).findOrCreateOwner(identity())).toMatchObject({ ok: true, created: true });
  });

  it("refuses a link to a missing owner as unavailable, not as a new account", async () => {
    const store = memoryIdentityStore();
    const corrupt: IdentityStore = { ...store, findOrCreate: async () => Promise.reject(new CorruptIdentityLinkError()) };
    expect(await service(corrupt).findOrCreateOwner(identity())).toMatchObject({ ok: false, code: "identity_unavailable", reason: expect.stringContaining("missing owner") });
  });

  it("reuses an active owner for 10 s without reading the store, then reads it again", async () => {
    const store = memoryIdentityStore();
    const spy = vi.spyOn(store, "findOrCreate");
    const svc = service(store);
    await svc.findOrCreateOwner(identity());
    await svc.findOrCreateOwner(identity());
    expect(spy).toHaveBeenCalledTimes(1);
    svc.tick(OWNER_CACHE_MS);
    await svc.findOrCreateOwner(identity());
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
