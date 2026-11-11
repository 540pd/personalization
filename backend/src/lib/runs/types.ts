// Run admission records (#491 PACK NJS-05, #492 PACK NJS-06; docs/aryash
// 13_LLD_Storage_Layout.txt). Three records change together, in one
// transaction, so a Run click is admitted exactly once and a Playspace never
// runs two jobs at a time:
//   idempotency/{ownerKey}:{key}             the click: fingerprint → stable job ID
//   owners/{ownerKey}/playspaces/{id}        the lock: the one in-flight job
//   runs/{jobId}                             the job's Playspace, node and state
// Times are epoch milliseconds.

export type IdempotencyStatus = "pending" | "accepted" | "failed";

export interface IdempotencyRecord {
  ownerKey: string;
  key: string;
  fingerprint: string;
  playspaceId: string;
  jobId: string;
  status: IdempotencyStatus;
  createdAt: number;
  /** Replays are recognised until then (7 days by default); never used to free a lock. */
  expiresAt: number;
}

/** owners/{ownerKey}/playspaces/{playspaceId}: the admission lock (NJS-06). */
export interface PlayspaceLock {
  /** The job holding the Playspace, until it reaches a final state; null when free. */
  inFlightJobId: string | null;
  lockUpdatedAt: number;
}

/** admitted → accepted (FastAPI took it) → finished | failed. */
export type RunState = "admitted" | "accepted" | "finished" | "failed";

/** runs/{jobId}: what admission and lineage need to know about a job. */
export interface RunRecord {
  jobId: string;
  ownerKey: string;
  playspaceId: string;
  nodeId: string;
  mode: string;
  state: RunState;
  createdAt: number;
  updatedAt: number;
}

export interface ReserveInput {
  ownerKey: string;
  key: string;
  fingerprint: string;
  playspaceId: string;
  nodeId: string;
  mode: string;
  /** Derived from owner + key, so every replay names the same job. */
  jobId: string;
  now: number;
  retentionMs: number;
}

export type ReserveResult =
  /** First admission: the idempotency record, the lock and the run were written together. */
  | { kind: "reserved"; jobId: string }
  /** The same click again: the same job, as it stands. */
  | { kind: "replay"; jobId: string; status: IdempotencyStatus }
  /** The same key with a different request. */
  | { kind: "conflict" }
  /** Another job holds the Playspace. */
  | { kind: "busy"; inFlightJobId: string; lockedSince: number };

export interface RunAdmissionStore {
  /** NJS-05 + NJS-06 in one atomic step; no network call inside. */
  reserve(input: ReserveInput): Promise<ReserveResult>;
  /**
   * Records what FastAPI said. "failed" also releases the lock (fenced on the
   * job) and fails the run: the job was never created.
   */
  settle(ownerKey: string, key: string, jobId: string, status: "accepted" | "failed", now: number): Promise<void>;
  /**
   * The worker or reconciler's handoff (NJS-06 scope 5): the job reached a final
   * state. Clears the lock only if this job still holds it (compare-and-set).
   * Returns whether it released the lock.
   */
  finish(ownerKey: string, playspaceId: string, jobId: string, outcome: "finished" | "failed", now: number): Promise<boolean>;
  getRun(jobId: string): Promise<RunRecord | null>;
  getLock(ownerKey: string, playspaceId: string): Promise<PlayspaceLock | null>;
}
