import { createHash } from "node:crypto";
import { verifyRunRequest, type AuthorizedRunContext, type RunDenial, type RunPrincipal } from "../admission/index.js";
import { FastApiError, getFastApiClient, type FastApiClient } from "../fastapi/index.js";
import { runAdmissionStore } from "./stores.js";
import type { RunAdmissionStore } from "./types.js";

export type { RunAdmissionStore, RunRecord, PlayspaceLock, IdempotencyRecord } from "./types.js";
export { runAdmissionStore } from "./stores.js";

// Run admission (#491 PACK NJS-05 + #492 PACK NJS-06; docs/aryash
// 03_Sequence_One_Node_Run.mmd steps 1–4): verify the Run (#493), reserve the
// click and the Playspace together, then ask FastAPI to create the job,
// outside the transaction. A lost answer leaves the reservation pending under
// its stable job ID; it is never resubmitted under a new one.

export interface RunAdmissionConfig {
  /** How long a click is recognised as a replay (#491; default 7 days). */
  retentionMs: number;
  /** A lock held longer than this is logged as stale (the 25 min job limit). */
  staleLockMs: number;
}

const DAY_S = 24 * 60 * 60;

export function runAdmissionConfig(env: NodeJS.ProcessEnv = process.env): RunAdmissionConfig {
  const seconds = (name: string, fallback: number) => {
    const text = env[name]?.trim();
    if (!text) return fallback;
    const value = Number(text);
    if (!Number.isInteger(value) || value < 60) throw new Error(`${name} must be a whole number of seconds from 60, got "${text}".`);
    return value;
  };
  return {
    retentionMs: seconds("RUN_IDEMPOTENCY_RETENTION_SECONDS", 7 * DAY_S) * 1000,
    staleLockMs: seconds("RUN_LOCK_STALE_SECONDS", 25 * 60) * 1000,
  };
}

/** The header a Run click's key travels in; 8–128 characters, as the FastAPI service takes. */
export const IDEMPOTENCY_HEADER = "Idempotency-Key";
const KEY = /^[A-Za-z0-9_.:-]{8,128}$/;
export const isIdempotencyKey = (key: unknown): key is string => typeof key === "string" && KEY.test(key);

/** JSON with keys sorted at every level: the same request always prints the same. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * The request's fingerprint (#491 criterion 2): the verified fields that
 * change the result, and nothing else (no timestamps, no trace IDs). Order is
 * kept in lists: the first asset is the main image, so order is meaning.
 */
export function runFingerprint(context: AuthorizedRunContext): string {
  const skills = context.skills.map((s) => (s.pinned ? { ref: s.revisionRef } : { name: s.name, sha256: createHash("sha256").update(s.content).digest("hex") }));
  return createHash("sha256")
    .update(
      canonical({
        playspaceId: context.playspaceId,
        nodeId: context.nodeId,
        mode: context.mode,
        requestedCount: context.requestedCount,
        instruction: context.instruction,
        assetIds: context.assets.map((a) => a.assetId),
        parentJobIds: context.parents.map((p) => p.jobId),
        skills,
      })
    )
    .digest("hex");
}

/** The job's ID, from owner + key (docs/aryash data model: "job_id from idempotency key"). */
export const jobIdFor = (ownerKey: string, key: string) => `job_${createHash("sha256").update(`${ownerKey}\0${key}`).digest("hex").slice(0, 32)}`;

export type AdmitResult =
  | { ok: true; status: 202 | 200; jobId: string; state: "accepted" | "pending"; replay: boolean }
  | { ok: false; status: number; code: string; message: string; field?: string };

export interface RunServiceDeps {
  store: RunAdmissionStore;
  fastapi: () => FastApiClient;
  verify: (principal: RunPrincipal, body: unknown) => ReturnType<typeof verifyRunRequest>;
  config: RunAdmissionConfig;
  now?: () => number;
}

const denied = (d: RunDenial): AdmitResult => ({ ok: false, status: d.status, code: d.code, message: d.message, ...(d.field ? { field: d.field } : {}) });

export function runService({ store, fastapi, verify, config, now = Date.now }: RunServiceDeps) {
  async function admitRun(principal: RunPrincipal, key: unknown, body: unknown): Promise<AdmitResult> {
    if (!principal.ownerKey) {
      return { ok: false, status: 403, code: "forbidden", message: "Runs need a signed-in account with an owner (SESSION_MODE=opaque or Google sign-in)." };
    }
    if (!isIdempotencyKey(key)) {
      return { ok: false, status: 422, code: "validation_failed", message: `A Run needs an ${IDEMPOTENCY_HEADER} header of 8–128 characters.`, field: IDEMPOTENCY_HEADER };
    }
    const verified = await verify(principal, body);
    if (!verified.ok) return denied(verified);
    const context = verified.context;
    const ownerKey = principal.ownerKey;
    const jobId = jobIdFor(ownerKey, key);

    let reserved;
    try {
      reserved = await store.reserve({
        ownerKey,
        key,
        fingerprint: runFingerprint(context),
        playspaceId: context.playspaceId,
        nodeId: context.nodeId,
        mode: context.mode,
        jobId,
        now: now(),
        retentionMs: config.retentionMs,
      });
    } catch {
      return { ok: false, status: 503, code: "dependency_unavailable", message: "Runs are unavailable right now. Try again shortly." };
    }

    if (reserved.kind === "conflict") {
      return { ok: false, status: 409, code: "idempotency_conflict", message: "This key was already used for a different Run." };
    }
    if (reserved.kind === "busy") {
      if (now() - reserved.lockedSince > config.staleLockMs) {
        console.warn(`[runs] Playspace lock held past the job limit (job ${reserved.inFlightJobId}); release it with npm run release-run-lock if its job is gone.`);
      }
      return { ok: false, status: 409, code: "playspace_busy", message: "A run is already active for this Playspace." };
    }
    if (reserved.kind === "replay") {
      if (reserved.status === "failed") return { ok: false, status: 409, code: "run_failed", message: "This Run could not be started. Use a new Run." };
      return { ok: true, status: reserved.status === "accepted" ? 200 : 202, jobId: reserved.jobId, state: reserved.status === "accepted" ? "accepted" : "pending", replay: true };
    }

    // Reserved: now, and only now, the network call, outside the transaction.
    let client: FastApiClient;
    try {
      client = fastapi();
    } catch {
      // No client (e.g. deployed without FASTAPI_BASE_URL): nothing was sent.
      await store.settle(ownerKey, key, jobId, "failed", now()).catch(() => {});
      return { ok: false, status: 503, code: "dependency_unavailable", message: "Runs are unavailable right now. Try again shortly." };
    }
    try {
      const created = await client.createJob(
        { ownerKey },
        {
          playspaceId: context.playspaceId,
          nodeId: context.nodeId,
          mode: context.mode,
          parentJobIds: context.parents.map((p) => p.jobId),
          assetIds: context.assets.map((a) => a.assetId),
          skillRevisionRefs: context.skills.flatMap((s) => (s.pinned ? [s.revisionRef] : [])),
          requestedCount: context.requestedCount,
          idempotencyKey: jobId,
        }
      );
      if (created.status === "pending") {
        // Maybe created: keep the reservation and the lock under the same job ID.
        return { ok: true, status: 202, jobId, state: "pending", replay: false };
      }
      await store.settle(ownerKey, key, jobId, "accepted", now()).catch(() => {});
      return { ok: true, status: 202, jobId, state: "accepted", replay: false };
    } catch (err) {
      // A FastApiError means FastAPI answered or the call never left: no job exists.
      if (err instanceof FastApiError) {
        await store.settle(ownerKey, key, jobId, "failed", now()).catch(() => {});
        return { ok: false, status: err.status, code: err.code, message: err.message };
      }
      return { ok: true, status: 202, jobId, state: "pending", replay: false };
    }
  }

  /**
   * The handoff for a future worker or reconciler (#492 scope 5), and the
   * admin script: the job reached a final state. Server-side only: no route.
   */
  function finishRun(ownerKey: string, playspaceId: string, jobId: string, outcome: "finished" | "failed"): Promise<boolean> {
    return store.finish(ownerKey, playspaceId, jobId, outcome, now());
  }

  return { admitRun, finishRun };
}

let _service: ReturnType<typeof runService> | null = null;

/** The process-wide run service. */
export function runs(): ReturnType<typeof runService> {
  _service ??= runService({ store: runAdmissionStore(), fastapi: getFastApiClient, verify: verifyRunRequest, config: runAdmissionConfig() });
  return _service;
}
