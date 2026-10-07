// Long-running generation jobs — in-memory for now.
//
// /generate/image and /generate/text do their work inline and return
// status "done" in the same response. Video cannot: Gemini video generation
// runs for minutes and a Cloud Run request will time out well before it
// returns. routes/generate.ts has carried the acknowledgement since the start:
//
//   // TODO: replace with async job queue (Cloud Tasks) for long-running
//   // generations.
//
// The response shape already had a jobId that was generated and never used.
// This gives it a meaning. The storage is deliberately the smallest thing
// that makes the *contract* real, so the client can be built against it;
// swapping this for Cloud Tasks + Firestore (#7) should not change the HTTP
// surface at all.
//
// Known limit, handled client-side rather than hidden: jobs do not survive a
// backend restart. A client polling a job that no longer exists gets
// "failed" with a reason, not a hang.

import { createId } from "../utils/id.js";

export type JobStatus = "pending" | "done" | "failed";

export interface Job {
  id: string;
  userId: string;
  status: JobStatus;
  /** Set when status is "done". */
  result?: { videoUrl: string; modelUsed: string };
  /** Set when status is "failed". */
  error?: string;
  createdAt: number;
}

const _jobs = new Map<string, Job>();

// Jobs are only interesting while a client is polling them. Without this a
// long-lived process accumulates every generation it has ever run.
const TTL_MS = 60 * 60 * 1000;

function sweep(): void {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, job] of _jobs) {
    if (job.createdAt < cutoff) _jobs.delete(id);
  }
}

export function createJob(userId: string): Job {
  sweep();
  const job: Job = { id: createId(), userId, status: "pending", createdAt: Date.now() };
  _jobs.set(job.id, job);
  return job;
}

export function completeJob(id: string, result: Job["result"]): void {
  const job = _jobs.get(id);
  if (!job) return; // swept, or the process restarted mid-flight
  job.status = "done";
  job.result = result;
}

export function failJob(id: string, error: string): void {
  const job = _jobs.get(id);
  if (!job) return;
  job.status = "failed";
  job.error = error;
}

/**
 * Scoped by user: a job id is a bearer token for its result, so one user must
 * not be able to read another's by guessing.
 */
export function getJob(id: string, userId: string): Job | null {
  const job = _jobs.get(id);
  if (!job || job.userId !== userId) return null;
  return job;
}
