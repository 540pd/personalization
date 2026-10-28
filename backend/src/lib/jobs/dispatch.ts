// Who runs a queued job (#325). In process is the placeholder for Cloud
// Tasks: the job runs in this backend, right away, and on local disk one a
// restart interrupted is picked up again at startup. Cloud Tasks (next)
// runs it on whichever instance its task reaches, retrying on failure.

export interface JobDispatcher {
  /** "in-process" (placeholder) or "cloud-tasks". */
  readonly name: "in-process" | "cloud-tasks";
  dispatch(jobId: string): Promise<void>;
}

/** Runs each job here, after the current request has answered. */
export function inProcessDispatcher(run: (jobId: string) => Promise<void>): JobDispatcher {
  return {
    name: "in-process",
    async dispatch(jobId) {
      setImmediate(() => {
        run(jobId).catch((err) => console.error(`[jobs] ${jobId} failed to run`, err));
      });
    },
  };
}
