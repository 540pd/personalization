// Cloud Tasks for video jobs (#325): each queued job becomes a task that
// calls this backend's worker endpoint, on whichever instance it reaches,
// retried by the queue if that call fails. Through the REST API with
// google-auth-library (already a dependency), not a client package.

import { GoogleAuth } from "google-auth-library";
import type { JobDispatcher } from "./dispatch.js";

export interface CloudTasksConfig {
  /** projects/<p>/locations/<l>/queues/<q> */
  queue: string;
  /** The identity the task's OIDC token is minted for, and the only one the
   * worker endpoint accepts. */
  serviceAccount: string;
  /** This backend's own URL, as Cloud Tasks reaches it; also the token's audience. */
  workerUrl: string;
}

const env = (name: string) => process.env[name]?.trim() || undefined;

/** The config from env, or null when Cloud Tasks is not set up (in process). */
export function cloudTasksConfig(): CloudTasksConfig | null {
  const queue = env("CLOUD_TASKS_QUEUE");
  const serviceAccount = env("CLOUD_TASKS_SERVICE_ACCOUNT");
  const workerUrl = env("JOBS_WORKER_URL")?.replace(/\/+$/, "");
  return queue && serviceAccount && workerUrl ? { queue, serviceAccount, workerUrl } : null;
}

/** The worker endpoint a task calls for `jobId`. */
export const workerPath = (jobId: string) => `/internal/jobs/${encodeURIComponent(jobId)}/run`;

type Requester = (opts: { url: string; method: "POST"; data: unknown }) => Promise<unknown>;

function defaultRequester(): Requester {
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  return async (opts) => (await auth.getClient()).request(opts);
}

/**
 * Enqueues a task per job. Named after the job, so dispatching one twice
 * is a 409 from the queue, not a second run. The deadline is Cloud Tasks'
 * longest for an HTTP task: Veo polls for up to 15 minutes.
 */
export function cloudTasksDispatcher(config: CloudTasksConfig, request: Requester = defaultRequester()): JobDispatcher {
  return {
    name: "cloud-tasks",
    async dispatch(jobId) {
      try {
        await request({
          url: `https://cloudtasks.googleapis.com/v2/${config.queue}/tasks`,
          method: "POST",
          data: {
            task: {
              name: `${config.queue}/tasks/${jobId}`,
              dispatchDeadline: "1800s",
              httpRequest: {
                httpMethod: "POST",
                url: `${config.workerUrl}${workerPath(jobId)}`,
                oidcToken: { serviceAccountEmail: config.serviceAccount, audience: config.workerUrl },
              },
            },
          },
        });
      } catch (err) {
        // Already enqueued: the job is on its way, which is what was asked.
        if ((err as { response?: { status?: number } }).response?.status === 409) return;
        throw err;
      }
    },
  };
}
