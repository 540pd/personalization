// Long-running generation jobs (#325): video, which runs for minutes. Kept
// where boards and assets are, so a job outlives the request -- and, off
// memory, the process -- that started it.

import type { Reference } from "../../capabilities/types.js";

/**
 * queued → running → done | failed. The API reports queued and running both
 * as "pending": the client's contract has not changed since the first job.
 */
export type JobStatus = "queued" | "running" | "done" | "failed";

/** A video job's request, as sent: references still asset URLs, resolved
 * when it runs. */
export interface VideoJobParams {
  modelId: string;
  instruction: string;
  durationSeconds?: number;
  resolution?: string;
  references?: Reference[];
}

export interface Job {
  id: string;
  userId: string;
  kind: "video";
  status: JobStatus;
  params: VideoJobParams;
  /** Set when status is "done". */
  result?: { videoUrl: string; modelUsed: string };
  /** Set when status is "failed". */
  error?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface JobStore {
  create(job: Job): Promise<void>;
  /** The job, if `userId` owns it: a job id is a bearer token for its result. */
  get(id: string, userId: string): Promise<Job | null>;
  /**
   * queued → running, atomically: the job if this caller now runs it, null
   * if it was not queued (running elsewhere, finished, or gone). What makes a
   * retried task, or a second dispatch, harmless.
   */
  claim(id: string): Promise<Job | null>;
  /** Settles a running job. */
  finish(id: string, outcome: { result: NonNullable<Job["result"]> } | { error: string }): Promise<void>;
  /** Jobs not yet finished, for picking up after a restart. */
  unfinished(): Promise<Job[]>;
  /** A running job back to queued (its runner is gone). */
  requeue(id: string): Promise<void>;
}

/** A job still running after this has failed: its runner is gone. */
export const JOB_TIMEOUT_MS = 20 * 60 * 1000;
