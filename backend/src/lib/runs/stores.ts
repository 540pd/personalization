import path from "node:path";
import { createHash } from "node:crypto";
import type { Firestore, Transaction } from "@google-cloud/firestore";
import { getFirestoreClient, isFirestoreMode } from "../firestore.js";
import { localDataDir } from "../storageMode.js";
import { inside, readJson, writeAtomic } from "../localDisk.js";
import { keyedLock } from "../boards/types.js";
import type { IdempotencyRecord, PlayspaceLock, ReserveInput, ReserveResult, RunAdmissionStore, RunRecord } from "./types.js";

// The run admission store in Firestore, on local disk or in memory (#491,
// #492). The decision is the same pure function in all three (decide()), so
// they can't drift; only how they make it atomic differs: a Firestore
// transaction, or a per-owner lock in the single-process placeholders.

type Snapshot = { idempotency: IdempotencyRecord | null; lock: PlayspaceLock | null };
type Writes = { idempotency: IdempotencyRecord; lock: PlayspaceLock; run: RunRecord };

/** What to answer, and what to write, given the current records. */
export function decide(input: ReserveInput, { idempotency, lock }: Snapshot): { result: ReserveResult; writes?: Writes } {
  const live = idempotency && idempotency.expiresAt > input.now ? idempotency : null;
  if (live) {
    if (live.fingerprint !== input.fingerprint) return { result: { kind: "conflict" } };
    return { result: { kind: "replay", jobId: live.jobId, status: live.status } };
  }
  // An expired (or no) record: a new admission, but only through the lock.
  // Expiry never frees a Playspace (#491 criterion 8).
  if (lock?.inFlightJobId && lock.inFlightJobId !== input.jobId) {
    return { result: { kind: "busy", inFlightJobId: lock.inFlightJobId, lockedSince: lock.lockUpdatedAt } };
  }
  return {
    result: { kind: "reserved", jobId: input.jobId },
    writes: {
      idempotency: {
        ownerKey: input.ownerKey,
        key: input.key,
        fingerprint: input.fingerprint,
        playspaceId: input.playspaceId,
        jobId: input.jobId,
        status: "pending",
        createdAt: input.now,
        expiresAt: input.now + input.retentionMs,
      },
      lock: { inFlightJobId: input.jobId, lockUpdatedAt: input.now },
      run: {
        jobId: input.jobId,
        ownerKey: input.ownerKey,
        playspaceId: input.playspaceId,
        nodeId: input.nodeId,
        mode: input.mode,
        state: "admitted",
        createdAt: input.now,
        updatedAt: input.now,
      },
    },
  };
}

const idemId = (ownerKey: string, key: string) => `${ownerKey}:${key}`;
const lockId = (ownerKey: string, playspaceId: string) => `${ownerKey}/${playspaceId}`;

/** In memory: tests, and LOCAL_DATA_DIR=memory. */
export function memoryRunAdmissionStore(): RunAdmissionStore {
  const idem = new Map<string, IdempotencyRecord>();
  const locks = new Map<string, PlayspaceLock>();
  const runs = new Map<string, RunRecord>();
  const locked = keyedLock();
  const release = (ownerKey: string, playspaceId: string, jobId: string, now: number) => {
    const lock = locks.get(lockId(ownerKey, playspaceId));
    if (lock?.inFlightJobId !== jobId) return false;
    locks.set(lockId(ownerKey, playspaceId), { inFlightJobId: null, lockUpdatedAt: now });
    return true;
  };
  return {
    reserve: (input) =>
      locked(input.ownerKey, async () => {
        const { result, writes } = decide(input, {
          idempotency: idem.get(idemId(input.ownerKey, input.key)) ?? null,
          lock: locks.get(lockId(input.ownerKey, input.playspaceId)) ?? null,
        });
        if (writes) {
          idem.set(idemId(input.ownerKey, input.key), writes.idempotency);
          locks.set(lockId(input.ownerKey, input.playspaceId), writes.lock);
          runs.set(input.jobId, writes.run);
        }
        return result;
      }),
    settle: (ownerKey, key, jobId, status, now) =>
      locked(ownerKey, async () => {
        const record = idem.get(idemId(ownerKey, key));
        if (!record || record.jobId !== jobId || record.status !== "pending") return;
        idem.set(idemId(ownerKey, key), { ...record, status });
        const run = runs.get(jobId);
        if (run) runs.set(jobId, { ...run, state: status === "accepted" ? "accepted" : "failed", updatedAt: now });
        if (status === "failed") release(ownerKey, record.playspaceId, jobId, now);
      }),
    finish: (ownerKey, playspaceId, jobId, outcome, now) =>
      locked(ownerKey, async () => {
        const run = runs.get(jobId);
        if (run && run.ownerKey === ownerKey && run.state !== "finished" && run.state !== "failed") runs.set(jobId, { ...run, state: outcome, updatedAt: now });
        return release(ownerKey, playspaceId, jobId, now);
      }),
    async getRun(jobId) {
      const run = runs.get(jobId);
      return run ? { ...run } : null;
    },
    async getLock(ownerKey, playspaceId) {
      const lock = locks.get(lockId(ownerKey, playspaceId));
      return lock ? { ...lock } : null;
    },
  };
}

/**
 * JSON files under `<dir>/run-admission/` (idempotency, playspace-locks, runs):
 * the local-disk placeholder. One process owns the folder, so a per-owner
 * lock stands in for the transaction; file names are hashes, never raw keys.
 */
export function localRunAdmissionStore(root: string): RunAdmissionStore {
  const dir = path.join(root, "run-admission");
  const h = (s: string) => createHash("sha256").update(s).digest("hex");
  const idemFile = (ownerKey: string, key: string) => inside(path.join(dir, "idempotency"), `${h(idemId(ownerKey, key))}.json`);
  const lockFile = (ownerKey: string, playspaceId: string) => inside(path.join(dir, "playspace-locks"), `${h(lockId(ownerKey, playspaceId))}.json`);
  const runFile = (jobId: string) => inside(path.join(dir, "runs"), `${h(jobId)}.json`);
  const write = (file: string, value: unknown) => writeAtomic(file, JSON.stringify(value, null, 2));
  const locked = keyedLock();
  const release = async (ownerKey: string, playspaceId: string, jobId: string, now: number) => {
    const lock = await readJson<PlayspaceLock>(lockFile(ownerKey, playspaceId));
    if (lock?.inFlightJobId !== jobId) return false;
    await write(lockFile(ownerKey, playspaceId), { inFlightJobId: null, lockUpdatedAt: now } satisfies PlayspaceLock);
    return true;
  };
  return {
    reserve: (input) =>
      locked(input.ownerKey, async () => {
        const { result, writes } = decide(input, {
          idempotency: await readJson<IdempotencyRecord>(idemFile(input.ownerKey, input.key)),
          lock: await readJson<PlayspaceLock>(lockFile(input.ownerKey, input.playspaceId)),
        });
        if (writes) {
          // Run and lock before the idempotency record: a crash between them
          // leaves the Playspace locked (safe), never an unlocked reservation.
          await write(runFile(input.jobId), writes.run);
          await write(lockFile(input.ownerKey, input.playspaceId), writes.lock);
          await write(idemFile(input.ownerKey, input.key), writes.idempotency);
        }
        return result;
      }),
    settle: (ownerKey, key, jobId, status, now) =>
      locked(ownerKey, async () => {
        const record = await readJson<IdempotencyRecord>(idemFile(ownerKey, key));
        if (!record || record.jobId !== jobId || record.status !== "pending") return;
        await write(idemFile(ownerKey, key), { ...record, status });
        const run = await readJson<RunRecord>(runFile(jobId));
        if (run) await write(runFile(jobId), { ...run, state: status === "accepted" ? "accepted" : "failed", updatedAt: now });
        if (status === "failed") await release(ownerKey, record.playspaceId, jobId, now);
      }),
    finish: (ownerKey, playspaceId, jobId, outcome, now) =>
      locked(ownerKey, async () => {
        const run = await readJson<RunRecord>(runFile(jobId));
        if (run && run.ownerKey === ownerKey && run.state !== "finished" && run.state !== "failed") {
          await write(runFile(jobId), { ...run, state: outcome, updatedAt: now });
        }
        return release(ownerKey, playspaceId, jobId, now);
      }),
    getRun: (jobId) => readJson<RunRecord>(runFile(jobId)),
    getLock: (ownerKey, playspaceId) => readJson<PlayspaceLock>(lockFile(ownerKey, playspaceId)),
  };
}

/**
 * Firestore, as the pack lays it out: idempotency/{ownerKey}:{key},
 * owners/{ownerKey}/playspaces/{playspaceId} and runs/{jobId}. One
 * transaction reads the idempotency record and the lock and writes all three;
 * Firestore retries it on contention, so of two racing clicks one reserves
 * and the other then sees the result. No TTL on the lock document.
 */
export function firestoreRunAdmissionStore(db: Firestore = getFirestoreClient()): RunAdmissionStore {
  const idemRef = (ownerKey: string, key: string) => db.collection("idempotency").doc(idemId(ownerKey, key));
  const lockRef = (ownerKey: string, playspaceId: string) => db.collection("owners").doc(ownerKey).collection("playspaces").doc(playspaceId);
  const runRef = (jobId: string) => db.collection("runs").doc(jobId);
  // The lock document may also hold the session mapping (the pack's layout):
  // only these fields are ever written here.
  const releaseIn = async (tx: Transaction, ownerKey: string, playspaceId: string, jobId: string, now: number) => {
    const snap = await tx.get(lockRef(ownerKey, playspaceId));
    if (snap.get("inFlightJobId") !== jobId) return false;
    tx.set(lockRef(ownerKey, playspaceId), { inFlightJobId: null, lockUpdatedAt: now }, { merge: true });
    return true;
  };
  return {
    reserve: (input) =>
      db.runTransaction(async (tx) => {
        const [idemSnap, lockSnap] = await Promise.all([tx.get(idemRef(input.ownerKey, input.key)), tx.get(lockRef(input.ownerKey, input.playspaceId))]);
        const { result, writes } = decide(input, {
          idempotency: idemSnap.exists ? (idemSnap.data() as IdempotencyRecord) : null,
          lock: lockSnap.exists ? { inFlightJobId: lockSnap.get("inFlightJobId") ?? null, lockUpdatedAt: lockSnap.get("lockUpdatedAt") ?? 0 } : null,
        });
        if (writes) {
          tx.set(idemRef(input.ownerKey, input.key), { ...writes.idempotency, expireAt: new Date(writes.idempotency.expiresAt) });
          tx.set(lockRef(input.ownerKey, input.playspaceId), writes.lock, { merge: true });
          tx.set(runRef(input.jobId), writes.run);
        }
        return result;
      }),
    settle: (ownerKey, key, jobId, status, now) =>
      db.runTransaction(async (tx) => {
        const snap = await tx.get(idemRef(ownerKey, key));
        const record = snap.exists ? (snap.data() as IdempotencyRecord) : null;
        if (!record || record.jobId !== jobId || record.status !== "pending") return;
        const runSnap = await tx.get(runRef(jobId));
        const lockSnap = status === "failed" ? await tx.get(lockRef(ownerKey, record.playspaceId)) : null;
        tx.update(idemRef(ownerKey, key), { status });
        if (runSnap.exists) tx.update(runRef(jobId), { state: status === "accepted" ? "accepted" : "failed", updatedAt: now });
        if (lockSnap && lockSnap.get("inFlightJobId") === jobId) {
          tx.set(lockRef(ownerKey, record.playspaceId), { inFlightJobId: null, lockUpdatedAt: now }, { merge: true });
        }
      }),
    finish: (ownerKey, playspaceId, jobId, outcome, now) =>
      db.runTransaction(async (tx) => {
        const runSnap = await tx.get(runRef(jobId));
        const run = runSnap.exists ? (runSnap.data() as RunRecord) : null;
        const released = await releaseIn(tx, ownerKey, playspaceId, jobId, now);
        if (run && run.ownerKey === ownerKey && run.state !== "finished" && run.state !== "failed") {
          tx.update(runRef(jobId), { state: outcome, updatedAt: now });
        }
        return released;
      }),
    async getRun(jobId) {
      const snap = await runRef(jobId).get();
      return snap.exists ? (snap.data() as RunRecord) : null;
    },
    async getLock(ownerKey, playspaceId) {
      const snap = await lockRef(ownerKey, playspaceId).get();
      return snap.exists ? { inFlightJobId: snap.get("inFlightJobId") ?? null, lockUpdatedAt: snap.get("lockUpdatedAt") ?? 0 } : null;
    },
  };
}

let _store: RunAdmissionStore | null = null;

/** The run admission store for this process's storage mode, made on first use. */
export function runAdmissionStore(): RunAdmissionStore {
  if (!_store) {
    const dir = localDataDir();
    _store = isFirestoreMode() ? firestoreRunAdmissionStore() : dir ? localRunAdmissionStore(dir) : memoryRunAdmissionStore();
  }
  return _store;
}
