import { createHash, randomBytes } from "node:crypto";
import { isFirestoreMode } from "../firestore.js";
import { localDataDir } from "../storageMode.js";
import { identityStore, owners } from "../identity/index.js";
import type { Owner } from "../identity/index.js";
import { sessionConfig, type SessionConfig } from "./config.js";
import { firestoreSessionStore, localSessionStore, memorySessionStore } from "./stores.js";
import type { SessionRecord, SessionStore } from "./types.js";

export type { SessionRecord, SessionStore } from "./types.js";
export { sessionConfig } from "./config.js";

/** 32 random bytes (256 bits), base64url: what the cookie carries. */
export const newSessionId = (): string => randomBytes(32).toString("base64url");

/** The store key: never the ID itself. */
export const hashSessionId = (id: string): string => createHash("sha256").update(id, "utf8").digest("hex");

/** A cookie value that could be one of our IDs: anything else isn't looked up. */
const SESSION_ID = /^[A-Za-z0-9_-]{43}$/;

export type SessionRefusal = "not_found" | "revoked" | "idle_expired" | "absolute_expired" | "disabled" | "unavailable";

export type ResolvedSession =
  | { ok: true; record: SessionRecord }
  | { ok: false; reason: SessionRefusal };

export interface SessionServiceDeps {
  store: SessionStore;
  /** The owner's current record, for its status. */
  getOwner: (ownerKey: string) => Promise<Owner | null>;
  /** Marks the owner disabled (#488's trusted function). */
  setOwnerDisabled: (ownerKey: string) => Promise<void>;
  config: SessionConfig;
  now?: () => number;
  makeId?: () => string;
}

/**
 * Sessions (#489, PACK NJS-03). A resolved session is reused for at most
 * `cacheMs` (10 s) without reading the store; revoke and disableOwner clear it
 * at once in this process, so the delay applies only across instances. The
 * deadlines are checked against the clock on every request, cached or not.
 */
export function sessionService({ store, getOwner, setOwnerDisabled, config, now = Date.now, makeId = newSessionId }: SessionServiceDeps) {
  const cache = new Map<string, { record: SessionRecord; at: number }>();

  async function create(who: { email: string; ownerKey: string | null }): Promise<{ id: string; record: SessionRecord }> {
    const id = makeId();
    const at = now();
    const record: SessionRecord = {
      sessionHash: hashSessionId(id),
      ownerKey: who.ownerKey,
      email: who.email,
      createdAt: at,
      lastSeenAt: at,
      idleExpiresAt: at + config.idleMs,
      absoluteExpiresAt: at + config.absoluteMs,
      revokedAt: null,
    };
    await store.create(record);
    return { id, record };
  }

  /** The live session `id` names, renewing its idle deadline if due; or why not. */
  async function resolve(id: string | undefined): Promise<ResolvedSession> {
    if (!id || !SESSION_ID.test(id)) return { ok: false, reason: "not_found" };
    const hash = hashSessionId(id);
    const at = now();

    let record: SessionRecord | null;
    const hit = cache.get(hash);
    if (hit && at - hit.at < config.cacheMs) {
      record = hit.record;
    } else {
      try {
        record = await store.get(hash);
        if (record?.ownerKey) {
          const owner = await getOwner(record.ownerKey);
          if (!owner || owner.status !== "active") {
            cache.delete(hash);
            return { ok: false, reason: "disabled" };
          }
        }
      } catch {
        cache.delete(hash);
        return { ok: false, reason: "unavailable" };
      }
      if (record) cache.set(hash, { record, at });
      else cache.delete(hash);
    }

    if (!record) return { ok: false, reason: "not_found" };
    if (record.revokedAt !== null) return { ok: false, reason: "revoked" };
    if (at >= record.absoluteExpiresAt) return { ok: false, reason: "absolute_expired" };
    if (at >= record.idleExpiresAt) return { ok: false, reason: "idle_expired" };

    // Throttled renewal, capped at the absolute deadline.
    if (at - record.lastSeenAt >= config.touchAfterMs) {
      const idleExpiresAt = Math.min(at + config.idleMs, record.absoluteExpiresAt);
      const renewed = { ...record, lastSeenAt: at, idleExpiresAt };
      try {
        await store.touch(hash, at, idleExpiresAt);
        cache.set(hash, { record: renewed, at: cache.get(hash)?.at ?? at });
        record = renewed;
      } catch {
        // A missed write only shortens the session; it is still valid now.
      }
    }
    return { ok: true, record };
  }

  /** Revokes the session `id` names, live or not. Unknown IDs are a no-op. */
  async function revoke(id: string | undefined): Promise<void> {
    if (!id || !SESSION_ID.test(id)) return;
    const hash = hashSessionId(id);
    cache.delete(hash);
    await store.revoke(hash, now());
  }

  /**
   * Trusted, server-side only (no route): disables the owner and revokes every
   * session they have, in this process at once and elsewhere within cacheMs.
   */
  async function disableOwner(ownerKey: string): Promise<{ revoked: number }> {
    await setOwnerDisabled(ownerKey);
    for (const [hash, entry] of cache) if (entry.record.ownerKey === ownerKey) cache.delete(hash);
    return { revoked: await store.revokeAllForOwner(ownerKey, now()) };
  }

  return { create, resolve, revoke, disableOwner, config };
}

let _store: SessionStore | null = null;

/** The session store for this process's storage mode, made on first use. */
export function sessionStore(): SessionStore {
  if (!_store) {
    const dir = localDataDir();
    _store = isFirestoreMode() ? firestoreSessionStore() : dir ? localSessionStore(dir) : memorySessionStore();
  }
  return _store;
}

let _service: ReturnType<typeof sessionService> | null = null;

/** The process-wide session service, on the process's stores and config. */
export function sessions(): ReturnType<typeof sessionService> {
  _service ??= sessionService({
    store: sessionStore(),
    getOwner: (ownerKey) => identityStore().get(ownerKey),
    setOwnerDisabled: (ownerKey) => owners().setOwnerStatus(ownerKey, "disabled"),
    config: sessionConfig(),
  });
  return _service;
}
