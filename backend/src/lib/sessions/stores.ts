import path from "node:path";
import type { Firestore } from "@google-cloud/firestore";
import { getFirestoreClient } from "../firestore.js";
import { inside, readAllJson, readJson, writeAtomic } from "../localDisk.js";
import { keyedLock } from "../boards/types.js";
import type { SessionRecord, SessionStore } from "./types.js";

// The session store in Firestore, on local disk or in memory (#489), picked
// by storage mode in index.ts like every other store.

const SESSIONS = "login_sessions";

/** In memory: tests, and LOCAL_DATA_DIR=memory. */
export function memorySessionStore(): SessionStore {
  const sessions = new Map<string, SessionRecord>();
  return {
    async create(record) {
      if (sessions.has(record.sessionHash)) throw new Error("session already exists");
      sessions.set(record.sessionHash, { ...record });
    },
    async get(hash) {
      const record = sessions.get(hash);
      return record ? { ...record } : null;
    },
    async touch(hash, lastSeenAt, idleExpiresAt) {
      const record = sessions.get(hash);
      if (record && record.revokedAt === null) sessions.set(hash, { ...record, lastSeenAt, idleExpiresAt });
    },
    async revoke(hash, at) {
      const record = sessions.get(hash);
      if (record && record.revokedAt === null) sessions.set(hash, { ...record, revokedAt: at });
    },
    async revokeAllForOwner(ownerKey, at) {
      let count = 0;
      for (const [hash, record] of sessions) {
        if (record.ownerKey === ownerKey && record.revokedAt === null) {
          sessions.set(hash, { ...record, revokedAt: at });
          count++;
        }
      }
      return count;
    },
  };
}

/**
 * One JSON file per session (`<dir>/login-sessions/<hash>.json`): the
 * local-disk placeholder. Revoke-all reads every file, fine for one developer.
 */
export function localSessionStore(root: string): SessionStore {
  const dir = path.join(root, "login-sessions");
  const file = (hash: string) => inside(dir, `${hash}.json`);
  const locked = keyedLock();
  const write = (record: SessionRecord) => writeAtomic(file(record.sessionHash), JSON.stringify(record, null, 2));
  const update = (hash: string, change: (r: SessionRecord) => SessionRecord | null) =>
    locked(hash, async () => {
      const record = await readJson<SessionRecord>(file(hash));
      const next = record && change(record);
      if (next) await write(next);
      return !!next;
    });
  return {
    create: (record) =>
      locked(record.sessionHash, async () => {
        if (await readJson(file(record.sessionHash))) throw new Error("session already exists");
        await write(record);
      }),
    get: (hash) => readJson<SessionRecord>(file(hash)),
    async touch(hash, lastSeenAt, idleExpiresAt) {
      await update(hash, (r) => (r.revokedAt === null ? { ...r, lastSeenAt, idleExpiresAt } : null));
    },
    async revoke(hash, at) {
      await update(hash, (r) => (r.revokedAt === null ? { ...r, revokedAt: at } : null));
    },
    async revokeAllForOwner(ownerKey, at) {
      const mine = (await readAllJson<SessionRecord>(dir)).filter((r) => r.ownerKey === ownerKey && r.revokedAt === null);
      let count = 0;
      for (const r of mine) if (await update(r.sessionHash, (x) => (x.revokedAt === null ? { ...x, revokedAt: at } : null))) count++;
      return count;
    },
  };
}

/**
 * login_sessions/{sessionHash} in Firestore. `expireAt` (a Timestamp, the
 * absolute deadline) is for a Firestore TTL policy to clean up old records;
 * expiry itself is always checked on read, never left to the TTL.
 */
export function firestoreSessionStore(db: Firestore = getFirestoreClient()): SessionStore {
  const sessions = db.collection(SESSIONS);
  const toRecord = (hash: string, data: Record<string, unknown>): SessionRecord => {
    const { expireAt: _ttl, ...rest } = data;
    return { ...(rest as Omit<SessionRecord, "sessionHash">), sessionHash: hash };
  };
  return {
    async create(record) {
      const { sessionHash, ...doc } = record;
      await sessions.doc(sessionHash).create({ ...doc, expireAt: new Date(record.absoluteExpiresAt) });
    },
    async get(hash) {
      const snap = await sessions.doc(hash).get();
      return snap.exists ? toRecord(hash, snap.data()!) : null;
    },
    async touch(hash, lastSeenAt, idleExpiresAt) {
      await db.runTransaction(async (tx) => {
        const ref = sessions.doc(hash);
        const snap = await tx.get(ref);
        if (snap.exists && snap.get("revokedAt") === null) tx.update(ref, { lastSeenAt, idleExpiresAt });
      });
    },
    async revoke(hash, at) {
      await db.runTransaction(async (tx) => {
        const ref = sessions.doc(hash);
        const snap = await tx.get(ref);
        if (snap.exists && snap.get("revokedAt") === null) tx.update(ref, { revokedAt: at });
      });
    },
    async revokeAllForOwner(ownerKey, at) {
      // Equality filter only, so no composite index is needed; live ones picked here.
      const snap = await sessions.where("ownerKey", "==", ownerKey).get();
      const live = snap.docs.filter((d) => d.get("revokedAt") === null);
      for (let i = 0; i < live.length; i += 400) {
        const batch = db.batch();
        for (const d of live.slice(i, i + 400)) batch.update(d.ref, { revokedAt: at });
        await batch.commit();
      }
      return live.length;
    },
  };
}
