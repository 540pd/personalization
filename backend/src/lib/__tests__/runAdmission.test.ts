import { describe, expect, it, vi } from "vitest";
import { Firestore } from "@google-cloud/firestore";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { firestoreRunAdmissionStore, localRunAdmissionStore, memoryRunAdmissionStore } from "../runs/stores.js";
import { jobIdFor, runAdmissionConfig, runFingerprint, runService } from "../runs/index.js";
import type { ReserveInput, RunAdmissionStore } from "../runs/types.js";
import type { AuthorizedRunContext, RunVerification } from "../admission/index.js";
import { FastApiError, type FastApiClient } from "../fastapi/index.js";

// Run admission (#491 PACK NJS-05 + #492 PACK NJS-06). The store contract on
// memory and local disk every `npm test`, on Firestore when the emulator is up.

const EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;
const DAY = 864e5;

const stores: Array<[string, () => RunAdmissionStore, boolean]> = [
  ["memory", memoryRunAdmissionStore, true],
  ["local disk", () => localRunAdmissionStore(mkdtempSync(path.join(tmpdir(), "gcos-runs-"))), true],
  ["firestore (emulator)", () => firestoreRunAdmissionStore(new Firestore({ projectId: process.env.FIRESTORE_PROJECT_ID ?? "demo-gcos" })), EMULATOR],
];

const uniq = () => Math.random().toString(36).slice(2, 10);
const input = (over: Partial<ReserveInput> = {}): ReserveInput => {
  const ownerKey = over.ownerKey ?? `usr_${uniq()}`;
  const key = over.key ?? `click-${uniq()}`;
  return { ownerKey, key, fingerprint: "fp1", playspaceId: "ps_1", nodeId: "n1", mode: "run", jobId: jobIdFor(ownerKey, key), now: 1_000_000, retentionMs: 7 * DAY, ...over };
};

describe.each(stores)("%s run admission store", (_name, make, enabled) => {
  const run = enabled ? it : it.skip;

  run("reserves the click, the Playspace and the run together", async () => {
    const store = make();
    const i = input();
    expect(await store.reserve(i)).toEqual({ kind: "reserved", jobId: i.jobId });
    expect(await store.getLock(i.ownerKey, "ps_1")).toMatchObject({ inFlightJobId: i.jobId });
    expect(await store.getRun(i.jobId)).toMatchObject({ jobId: i.jobId, ownerKey: i.ownerKey, playspaceId: "ps_1", nodeId: "n1", state: "admitted" });
  });

  run("answers the same click with the same job, and a changed one with a conflict", async () => {
    const store = make();
    const i = input();
    await store.reserve(i);
    expect(await store.reserve(i)).toEqual({ kind: "replay", jobId: i.jobId, status: "pending" });
    await store.settle(i.ownerKey, i.key, i.jobId, "accepted", i.now + 1);
    expect(await store.reserve(i)).toEqual({ kind: "replay", jobId: i.jobId, status: "accepted" });
    expect(await store.reserve({ ...i, fingerprint: "fp2" })).toEqual({ kind: "conflict" });
  });

  run("refuses a different click on a busy Playspace", async () => {
    const store = make();
    const a = input();
    await store.reserve(a);
    const b = input({ ownerKey: a.ownerKey });
    expect(await store.reserve(b)).toMatchObject({ kind: "busy", inFlightJobId: a.jobId });
    expect(await store.getRun(b.jobId)).toBeNull();
  });

  run("admits one of several same-key clicks at once", async () => {
    const store = make();
    const i = input();
    const results = await Promise.all(Array.from({ length: 5 }, () => store.reserve(i)));
    expect(results.filter((r) => r.kind === "reserved")).toHaveLength(1);
    expect(results.filter((r) => r.kind === "replay")).toHaveLength(4);
  });

  run("admits one of several different clicks on one Playspace at once", async () => {
    const store = make();
    const ownerKey = `usr_${uniq()}`;
    const results = await Promise.all(Array.from({ length: 5 }, () => store.reserve(input({ ownerKey }))));
    expect(results.filter((r) => r.kind === "reserved")).toHaveLength(1);
    expect(results.filter((r) => r.kind === "busy")).toHaveLength(4);
  });

  run("lets each Playspace, and each owner, run one job of its own", async () => {
    const store = make();
    const ownerKey = `usr_${uniq()}`;
    expect((await store.reserve(input({ ownerKey, playspaceId: "ps_a" }))).kind).toBe("reserved");
    expect((await store.reserve(input({ ownerKey, playspaceId: "ps_b" }))).kind).toBe("reserved");
    expect((await store.reserve(input({ playspaceId: "ps_a" }))).kind).toBe("reserved");
  });

  run("keeps the same key string apart for different owners", async () => {
    const store = make();
    const key = `click-${uniq()}`;
    const a = await store.reserve(input({ key }));
    const b = await store.reserve(input({ key }));
    expect(a.kind).toBe("reserved");
    expect(b.kind).toBe("reserved");
    expect(a).not.toEqual(b);
  });

  run("after the replay window, a key starts a new admission, but only through the lock", async () => {
    const store = make();
    const i = input();
    await store.reserve(i);
    // Expired, lock still held by the same job (its own key): admitted again as the same job.
    expect(await store.reserve({ ...i, now: i.now + 8 * DAY })).toEqual({ kind: "reserved", jobId: i.jobId });
    // Expired, and another job holds the Playspace: still busy.
    const other = input({ ownerKey: i.ownerKey });
    await store.finish(i.ownerKey, "ps_1", i.jobId, "finished", i.now + 1);
    await store.reserve({ ...other, now: i.now + 2 });
    expect(await store.reserve({ ...i, fingerprint: "fp-new", now: i.now + 16 * DAY })).toMatchObject({ kind: "busy", inFlightJobId: other.jobId });
  });

  run("releases only the job that holds the lock (compare-and-set)", async () => {
    const store = make();
    const i = input();
    await store.reserve(i);
    expect(await store.finish(i.ownerKey, "ps_1", "job_stale", "finished", i.now + 1)).toBe(false);
    expect((await store.getLock(i.ownerKey, "ps_1"))?.inFlightJobId).toBe(i.jobId);
    expect(await store.finish(i.ownerKey, "ps_1", i.jobId, "finished", i.now + 2)).toBe(true);
    expect((await store.getLock(i.ownerKey, "ps_1"))?.inFlightJobId).toBeNull();
    expect((await store.getRun(i.jobId))?.state).toBe("finished");
    expect(await store.finish(i.ownerKey, "ps_1", i.jobId, "finished", i.now + 3)).toBe(false);
  });

  run("a failed settle frees the Playspace; an accepted one keeps it", async () => {
    const store = make();
    const a = input();
    await store.reserve(a);
    await store.settle(a.ownerKey, a.key, a.jobId, "accepted", a.now + 1);
    expect((await store.getLock(a.ownerKey, "ps_1"))?.inFlightJobId).toBe(a.jobId);
    const b = input();
    await store.reserve(b);
    await store.settle(b.ownerKey, b.key, b.jobId, "failed", b.now + 1);
    expect((await store.getLock(b.ownerKey, "ps_1"))?.inFlightJobId).toBeNull();
    expect((await store.getRun(b.jobId))?.state).toBe("failed");
    expect(await store.reserve(b)).toEqual({ kind: "replay", jobId: b.jobId, status: "failed" });
  });

  run("an old lock is never released by time alone (no worker-lease release)", async () => {
    const store = make();
    const i = input();
    await store.reserve(i);
    expect(await store.reserve(input({ ownerKey: i.ownerKey, now: i.now + 365 * DAY }))).toMatchObject({ kind: "busy" });
  });
});

describe("runService.admitRun", () => {
  const context = (over: Partial<AuthorizedRunContext> = {}): AuthorizedRunContext => ({
    principal: { email: "ana@accenture.com", ownerKey: "usr_ana" },
    playspaceId: "ps_1",
    nodeId: "n1",
    mode: "run",
    requestedCount: 2,
    instruction: "brighter",
    assets: [],
    skills: [{ pinned: false, name: "s", content: "Be brief." }],
    parents: [],
    ...over,
  });

  function setup(over: { createJob?: FastApiClient["createJob"]; verified?: RunVerification } = {}) {
    let clock = 1_000_000;
    const store = memoryRunAdmissionStore();
    const createJob = vi.fn(over.createJob ?? (async () => ({ status: "accepted" as const, jobId: "upstream" })));
    const verify = vi.fn(async () => over.verified ?? ({ ok: true, context: context() } as RunVerification));
    const svc = runService({ store, fastapi: () => ({ createJob }) as unknown as FastApiClient, verify, config: runAdmissionConfig({}), now: () => clock });
    return { svc, store, createJob, verify, tick: (ms: number) => (clock += ms) };
  }
  const ANA = { email: "ana@accenture.com", ownerKey: "usr_ana" };

  it("admits a Run once: the same click returns the same job and calls FastAPI once", async () => {
    const { svc, createJob } = setup();
    const first = await svc.admitRun(ANA, "click-0001", {});
    expect(first).toEqual({ ok: true, status: 202, jobId: jobIdFor("usr_ana", "click-0001"), state: "accepted", replay: false });
    expect(await svc.admitRun(ANA, "click-0001", {})).toEqual({ ok: true, status: 200, jobId: first.ok && first.jobId, state: "accepted", replay: true });
    expect(createJob).toHaveBeenCalledTimes(1);
    expect(createJob.mock.calls[0][1]).toMatchObject({ playspaceId: "ps_1", nodeId: "n1", idempotencyKey: jobIdFor("usr_ana", "click-0001") });
  });

  it("refuses the same key with a changed Run with 409 idempotency_conflict", async () => {
    const { svc, verify } = setup();
    await svc.admitRun(ANA, "click-0002", {});
    verify.mockResolvedValueOnce({ ok: true, context: context({ requestedCount: 3 }) });
    expect(await svc.admitRun(ANA, "click-0002", {})).toMatchObject({ ok: false, status: 409, code: "idempotency_conflict" });
  });

  it("refuses another click while the Playspace runs, then admits after the job finishes", async () => {
    const { svc } = setup();
    const first = await svc.admitRun(ANA, "click-0003", {});
    expect(await svc.admitRun(ANA, "click-0004", {})).toMatchObject({ ok: false, status: 409, code: "playspace_busy" });
    expect(await svc.finishRun("usr_ana", "ps_1", first.ok ? first.jobId : "", "finished")).toBe(true);
    expect(await svc.admitRun(ANA, "click-0004", {})).toMatchObject({ ok: true, state: "accepted" });
  });

  it("keeps a pending reservation, and its job ID, when FastAPI's answer is lost", async () => {
    const { svc, createJob, store } = setup({ createJob: async (_p, r) => ({ status: "pending", idempotencyKey: r.idempotencyKey }) });
    const first = await svc.admitRun(ANA, "click-0005", {});
    expect(first).toMatchObject({ ok: true, status: 202, state: "pending" });
    expect(await svc.admitRun(ANA, "click-0005", {})).toMatchObject({ ok: true, status: 202, state: "pending", replay: true, jobId: first.ok && first.jobId });
    expect(createJob).toHaveBeenCalledTimes(1);
    expect((await store.getLock("usr_ana", "ps_1"))?.inFlightJobId).toBe(first.ok && first.jobId);
  });

  it("frees the Playspace when FastAPI refuses the job, and won't retry that click", async () => {
    const { svc, store } = setup({ createJob: async () => Promise.reject(new FastApiError(422, "validation_failed", "bad", false)) });
    expect(await svc.admitRun(ANA, "click-0006", {})).toMatchObject({ ok: false, status: 422, code: "validation_failed" });
    expect((await store.getLock("usr_ana", "ps_1"))?.inFlightJobId).toBeNull();
    expect(await svc.admitRun(ANA, "click-0006", {})).toMatchObject({ ok: false, status: 409, code: "run_failed" });
  });

  it("frees the Playspace when there is no FastAPI client to call", async () => {
    let clock = 1;
    const store = memoryRunAdmissionStore();
    const svc = runService({
      store,
      fastapi: () => {
        throw new Error("FASTAPI_BASE_URL is not set");
      },
      verify: async () => ({ ok: true, context: context() }),
      config: runAdmissionConfig({}),
      now: () => clock++,
    });
    expect(await svc.admitRun(ANA, "click-0007", {})).toMatchObject({ ok: false, status: 503 });
    expect((await store.getLock("usr_ana", "ps_1"))?.inFlightJobId).toBeNull();
  });

  it("passes a verifier denial on, reserving nothing", async () => {
    const { svc, store, createJob } = setup({ verified: { ok: false, status: 404, code: "resource_not_accessible", message: "x", field: "playspaceId" } });
    expect(await svc.admitRun(ANA, "click-0008", {})).toMatchObject({ ok: false, status: 404, field: "playspaceId" });
    expect(await store.getLock("usr_ana", "ps_1")).toBeNull();
    expect(createJob).not.toHaveBeenCalled();
  });

  it.each([[undefined], ["short"], ["has space in it"], ["x".repeat(129)]])("refuses a missing or malformed key (%s)", async (key) => {
    const { svc, verify } = setup();
    expect(await svc.admitRun(ANA, key, {})).toMatchObject({ ok: false, status: 422, field: "Idempotency-Key" });
    expect(verify).not.toHaveBeenCalled();
  });

  it("refuses a principal without an owner key", async () => {
    expect(await setup().svc.admitRun({ email: "ana@accenture.com" }, "click-0009", {})).toMatchObject({ ok: false, status: 403 });
  });

  it("logs a lock held past the job limit", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { svc, tick } = setup();
    await svc.admitRun(ANA, "click-0010", {});
    tick(26 * 60_000);
    await svc.admitRun(ANA, "click-0011", {});
    expect(warn.mock.calls.flat().join(" ")).toMatch(/release-run-lock/);
    warn.mockRestore();
  });
});

describe("runFingerprint", () => {
  const base: AuthorizedRunContext = {
    principal: { email: "a@accenture.com", ownerKey: "usr_a" },
    playspaceId: "ps",
    nodeId: "n",
    mode: "run",
    requestedCount: 1,
    instruction: "x",
    assets: [
      { assetId: "a1", mimeType: "image/png", bytes: 1, state: "ready", storagePath: "p1" },
      { assetId: "a2", mimeType: "image/png", bytes: 1, state: "ready", storagePath: "p2" },
    ],
    skills: [{ pinned: false, name: "s", content: "c" }],
    parents: [],
  };

  it("is the same for the same Run, whoever's storage path or principal object", () => {
    expect(runFingerprint(base)).toBe(runFingerprint({ ...base, principal: { email: "other", ownerKey: "usr_b" }, assets: base.assets.map((a) => ({ ...a, storagePath: "elsewhere" })) }));
  });

  it("changes with anything that changes the result, including asset order and Skill text", () => {
    const fp = runFingerprint(base);
    for (const change of [
      { requestedCount: 2 },
      { instruction: "y" },
      { mode: "rerun" as const },
      { nodeId: "n2" },
      { assets: [...base.assets].reverse() },
      { skills: [{ pinned: false as const, name: "s", content: "changed" }] },
    ]) {
      expect(runFingerprint({ ...base, ...change })).not.toBe(fp);
    }
  });
});

describe("runAdmissionConfig", () => {
  it("defaults to a 7-day replay window and a 25-minute stale-lock warning", () => {
    expect(runAdmissionConfig({})).toEqual({ retentionMs: 7 * DAY, staleLockMs: 25 * 60_000 });
  });
  it("refuses a value under a minute", () => {
    expect(() => runAdmissionConfig({ RUN_IDEMPOTENCY_RETENTION_SECONDS: "10" })).toThrow(/RETENTION/);
  });
});
