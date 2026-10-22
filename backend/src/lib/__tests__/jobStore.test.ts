import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Firestore } from "@google-cloud/firestore";
import { memoryJobStore } from "../jobs/memory.js";
import { localJobStore } from "../jobs/local.js";
import { firestoreJobStore } from "../jobs/firestore.js";
import type { Job, JobStore } from "../jobs/types.js";

// One contract for every job store (#325). Memory and local disk on every
// `npm test`; Firestore whenever the emulator is up (CI).

const EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;

const stores: Array<[string, () => JobStore, boolean]> = [
  ["memory", memoryJobStore, true],
  ["local disk", () => localJobStore(mkdtempSync(path.join(tmpdir(), "gcos-jobs-"))), true],
  ["firestore (emulator)", () => firestoreJobStore(new Firestore({ projectId: process.env.FIRESTORE_PROJECT_ID ?? "demo-gcos" })), EMULATOR],
];

const ALICE = "alice@example.com";
const BOB = "bob@example.com";

const newJob = (userId = ALICE): Job => ({
  id: `job-${Math.random().toString(36).slice(2)}`,
  userId,
  kind: "video",
  status: "queued",
  params: { modelId: "veo", instruction: "a wave" },
  createdAt: new Date().toISOString(),
});

describe.each(stores)("%s job store", (_name, make, enabled) => {
  const run = enabled ? it : it.skip;

  run("keeps a job for its owner only", async () => {
    const store = make();
    const job = newJob();
    await store.create(job);
    expect(await store.get(job.id, ALICE)).toMatchObject({ id: job.id, status: "queued", params: job.params });
    // A job id is a bearer token for its result: another user gets nothing.
    expect(await store.get(job.id, BOB)).toBeNull();
    expect(await store.get("no-such-job", ALICE)).toBeNull();
  });

  run("claims a queued job once, even when two try at once", async () => {
    const store = make();
    const job = newJob();
    await store.create(job);
    const [a, b] = await Promise.all([store.claim(job.id), store.claim(job.id)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect((a ?? b)!.status).toBe("running");
    expect(await store.claim(job.id)).toBeNull();
    expect(await store.claim("no-such-job")).toBeNull();
  });

  run("finishes once: done carries the result, failed the reason", async () => {
    const store = make();
    const done = newJob();
    const failed = newJob();
    await store.create(done);
    await store.create(failed);
    await store.claim(done.id);
    await store.claim(failed.id);
    await store.finish(done.id, { result: { videoUrl: "/api/proxy/assets/x/content", modelUsed: "veo" } });
    await store.finish(failed.id, { error: "quota exhausted" });
    // A late second outcome does not overwrite the first.
    await store.finish(done.id, { error: "too late" });
    expect(await store.get(done.id, ALICE)).toMatchObject({ status: "done", result: { modelUsed: "veo" } });
    expect((await store.get(done.id, ALICE))?.error).toBeUndefined();
    expect(await store.get(failed.id, ALICE)).toMatchObject({ status: "failed", error: "quota exhausted" });
  });

  run("lists unfinished jobs, and requeues a running one", async () => {
    const store = make();
    const queued = newJob();
    const running = newJob();
    const finished = newJob();
    for (const j of [queued, running, finished]) await store.create(j);
    await store.claim(running.id);
    await store.claim(finished.id);
    await store.finish(finished.id, { error: "x" });
    const ids = (await store.unfinished()).map((j) => j.id);
    expect(ids).toEqual(expect.arrayContaining([queued.id, running.id]));
    expect(ids).not.toContain(finished.id);

    await store.requeue(running.id);
    expect((await store.get(running.id, ALICE))?.status).toBe("queued");
    // Only a running job goes back.
    await store.requeue(finished.id);
    expect((await store.get(finished.id, ALICE))?.status).toBe("failed");
  });
});
