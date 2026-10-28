import path from "node:path";
import { inside, readAllJson, readJson, writeAtomic } from "../localDisk.js";
import { keyedLock } from "../boards/types.js";
import type { Job, JobStore } from "./types.js";

/**
 * Jobs as files (`<dir>/jobs/<id>.json`): the local-disk placeholder for
 * Firestore (#333, #325). One process owns the folder, so a per-job lock is
 * the whole of claim's atomicity.
 */
export function localJobStore(root: string): JobStore {
  const dir = path.join(root, "jobs");
  const file = (id: string) => inside(dir, `${id}.json`);
  const locked = keyedLock();
  const read = async (id: string) => {
    try {
      return await readJson<Job>(file(id));
    } catch {
      return null;
    }
  };
  const write = (job: Job) => writeAtomic(file(job.id), JSON.stringify(job));

  return {
    create: (job) => locked(job.id, () => write(job)),
    async get(id, userId) {
      const job = await read(id);
      return job?.userId === userId ? job : null;
    },
    claim: (id) =>
      locked(id, async () => {
        const job = await read(id);
        if (job?.status !== "queued") return null;
        const running: Job = { ...job, status: "running", startedAt: new Date().toISOString() };
        await write(running);
        return running;
      }),
    finish: (id, outcome) =>
      locked(id, async () => {
        const job = await read(id);
        if (!job || job.status === "done" || job.status === "failed") return;
        await write({
          ...job,
          ...("result" in outcome ? { status: "done", result: outcome.result } : { status: "failed", error: outcome.error }),
          finishedAt: new Date().toISOString(),
        });
      }),
    async unfinished() {
      return (await readAllJson<Job>(dir)).filter((j) => j.status === "queued" || j.status === "running");
    },
    requeue: (id) =>
      locked(id, async () => {
        const job = await read(id);
        if (job?.status !== "running") return;
        const { startedAt: _gone, ...rest } = job;
        await write({ ...rest, status: "queued" });
      }),
  };
}
