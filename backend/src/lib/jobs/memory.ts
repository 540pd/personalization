import type { Job, JobStore } from "./types.js";

// Jobs are only interesting while a client polls them; without a sweep a
// long-lived process keeps every one it ever ran.
const TTL_MS = 60 * 60 * 1000;

/** Jobs in this process: tests, and local dev with LOCAL_DATA_DIR=memory. */
export function memoryJobStore(): JobStore {
  const jobs = new Map<string, Job>();
  const sweep = () => {
    const cutoff = Date.now() - TTL_MS;
    for (const [id, job] of jobs) if (Date.parse(job.createdAt) < cutoff) jobs.delete(id);
  };
  return {
    async create(job) {
      sweep();
      jobs.set(job.id, { ...job });
    },
    async get(id, userId) {
      const job = jobs.get(id);
      return job?.userId === userId ? { ...job } : null;
    },
    async claim(id) {
      const job = jobs.get(id);
      if (job?.status !== "queued") return null;
      Object.assign(job, { status: "running", startedAt: new Date().toISOString() });
      return { ...job };
    },
    async finish(id, outcome) {
      const job = jobs.get(id);
      if (!job || job.status === "done" || job.status === "failed") return;
      Object.assign(job, "result" in outcome ? { status: "done", result: outcome.result } : { status: "failed", error: outcome.error }, {
        finishedAt: new Date().toISOString(),
      });
    },
    async unfinished() {
      return [...jobs.values()].filter((j) => j.status === "queued" || j.status === "running").map((j) => ({ ...j }));
    },
    async requeue(id) {
      const job = jobs.get(id);
      if (job?.status === "running") Object.assign(job, { status: "queued", startedAt: undefined });
    },
  };
}
