// Video jobs (#325): started by POST /generate/video, run by the dispatcher,
// read by the client's polling. The HTTP contract is the one the client has
// always used; what changed is that a job now outlives the request -- and,
// off memory, the process -- that started it.

import { createId } from "../utils/id.js";
import { currentIsoDate } from "../utils/date.js";
import { JOB_TIMEOUT_MS, jobStore, type Job, type VideoJobParams } from "../lib/jobs/index.js";
import { inProcessDispatcher, type JobDispatcher } from "../lib/jobs/dispatch.js";
import { cloudTasksConfig, cloudTasksDispatcher } from "../lib/jobs/cloudTasks.js";
import { generateVideo } from "./generationService.js";
import { resolveAssetReferences } from "./generatedAssets.js";

/** A job queued this long without a runner taking it has failed too. */
const QUEUE_TIMEOUT_MS = 30 * 60 * 1000;

let _dispatcher: JobDispatcher | null = null;

/** Cloud Tasks when it is set up (CLOUD_TASKS_*, JOBS_WORKER_URL); in
 * process, the placeholder, otherwise. */
export function jobDispatcher(): JobDispatcher {
  if (!_dispatcher) {
    const config = cloudTasksConfig();
    _dispatcher = config ? cloudTasksDispatcher(config) : inProcessDispatcher(runJob);
  }
  return _dispatcher;
}

/** Queues a video job for `userId` and hands it to the dispatcher. */
export async function startVideoJob(userId: string, params: VideoJobParams): Promise<Job> {
  const job: Job = { id: createId(), userId, kind: "video", status: "queued", params, createdAt: currentIsoDate() };
  await jobStore().create(job);
  await jobDispatcher().dispatch(job.id);
  return job;
}

/**
 * Runs a queued job: a no-op unless this call claims it, so a second
 * dispatch or a retried task never runs it twice. Never throws: every
 * failure lands on the job.
 */
export async function runJob(jobId: string): Promise<void> {
  const job = await jobStore().claim(jobId);
  if (!job) return;
  try {
    const references = await resolveAssetReferences(job.params.references, job.userId);
    if (!references.ok) {
      await jobStore().finish(job.id, { error: references.message });
      return;
    }
    const result = await generateVideo({
      ...job.params,
      references: references.references,
      userId: job.userId,
    });
    await jobStore().finish(job.id, { result });
  } catch (err) {
    await jobStore().finish(job.id, { error: err instanceof Error ? err.message : "Video generation failed." });
  }
}

/** The job as its owner polls it, failing one whose runner is gone. */
export async function readJob(jobId: string, userId: string): Promise<Job | null> {
  const job = await jobStore().get(jobId, userId);
  if (!job) return null;
  const now = Date.now();
  const stuck =
    (job.status === "running" && job.startedAt && now - Date.parse(job.startedAt) > JOB_TIMEOUT_MS) ||
    (job.status === "queued" && now - Date.parse(job.createdAt) > QUEUE_TIMEOUT_MS);
  if (!stuck) return job;
  await jobStore().finish(job.id, { error: "The video took too long and was stopped. Try again." });
  return jobStore().get(jobId, userId);
}

/**
 * At startup, in process only: jobs a restart interrupted are queued again
 * and run. (Cloud Tasks retries its own; memory has nothing to pick up.)
 */
export async function resumeUnfinishedJobs(): Promise<number> {
  if (jobDispatcher().name !== "in-process") return 0;
  const jobs = await jobStore().unfinished();
  for (const job of jobs) {
    if (job.status === "running") await jobStore().requeue(job.id);
    await jobDispatcher().dispatch(job.id);
  }
  return jobs.length;
}
