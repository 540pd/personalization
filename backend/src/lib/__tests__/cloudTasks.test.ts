import { afterEach, describe, expect, it, vi } from "vitest";
import { cloudTasksConfig, cloudTasksDispatcher } from "../jobs/cloudTasks.js";

// Cloud Tasks for video jobs (#325): the task each job becomes.

afterEach(() => vi.unstubAllEnvs());

const config = {
  queue: "projects/gcos/locations/us-central1/queues/video",
  serviceAccount: "gcos-tasks@gcos.iam.gserviceaccount.com",
  workerUrl: "https://gcos-backend-xyz.run.app",
};

describe("cloudTasksConfig", () => {
  it("is null unless all three are set: in process, then", () => {
    vi.stubEnv("CLOUD_TASKS_QUEUE", config.queue);
    vi.stubEnv("CLOUD_TASKS_SERVICE_ACCOUNT", "");
    vi.stubEnv("JOBS_WORKER_URL", config.workerUrl);
    expect(cloudTasksConfig()).toBeNull();
    vi.stubEnv("CLOUD_TASKS_SERVICE_ACCOUNT", config.serviceAccount);
    vi.stubEnv("JOBS_WORKER_URL", `${config.workerUrl}/`);
    expect(cloudTasksConfig()).toEqual(config);
  });
});

describe("cloudTasksDispatcher", () => {
  it("enqueues a task named after the job, calling the worker with an OIDC token", async () => {
    const request = vi.fn().mockResolvedValue({});
    await cloudTasksDispatcher(config, request).dispatch("job-1");
    expect(request).toHaveBeenCalledWith({
      url: "https://cloudtasks.googleapis.com/v2/projects/gcos/locations/us-central1/queues/video/tasks",
      method: "POST",
      data: {
        task: {
          name: `${config.queue}/tasks/job-1`,
          dispatchDeadline: "1800s",
          httpRequest: {
            httpMethod: "POST",
            url: "https://gcos-backend-xyz.run.app/internal/jobs/job-1/run",
            oidcToken: { serviceAccountEmail: config.serviceAccount, audience: config.workerUrl },
          },
        },
      },
    });
  });

  it("treats a task already enqueued (409) as done, and any other failure as one", async () => {
    const conflict = Object.assign(new Error("exists"), { response: { status: 409 } });
    await expect(cloudTasksDispatcher(config, vi.fn().mockRejectedValue(conflict)).dispatch("job-1")).resolves.toBeUndefined();
    const denied = Object.assign(new Error("denied"), { response: { status: 403 } });
    await expect(cloudTasksDispatcher(config, vi.fn().mockRejectedValue(denied)).dispatch("job-1")).rejects.toThrow("denied");
  });
});
