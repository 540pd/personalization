import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import type { Express } from "express";

// Cloud Tasks' worker endpoint (#325): only a Google-signed token for the
// configured service account and this URL runs a job.

const SA = "gcos-tasks@gcos.iam.gserviceaccount.com";
const WORKER = "https://gcos-backend-xyz.run.app";

// Google's verification, stubbed: "task:<email>:<audience>[:unverified]".
vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    async verifyIdToken({ idToken, audience }: { idToken: string; audience: string }) {
      const [kind, email, aud, flag] = idToken.split("|");
      if (kind !== "task" || aud !== audience) throw new Error("Wrong recipient");
      return { getPayload: () => ({ email, email_verified: flag !== "unverified" }) };
    }
  },
  GoogleAuth: class {
    async getClient() {
      return { request: async () => ({}) };
    }
  },
}));

const { generateVideo } = vi.hoisted(() => ({ generateVideo: vi.fn() }));
vi.mock("../../capabilities/index.js", () => ({
  getCapability: () => ({ generateV2: vi.fn() }),
  getTextCapability: () => ({ generateText: vi.fn() }),
  getVideoCapability: () => ({ generateVideo, getVideo: vi.fn() }),
}));

async function load(tasks = true) {
  vi.resetModules();
  for (const k of ["GOOGLE_OAUTH_CLIENT_ID", "AUTH_MODE", "FIRESTORE_PROJECT_ID", "GCS_BUCKET_NAME", "K_SERVICE"]) vi.stubEnv(k, "");
  vi.stubEnv("LOCAL_DATA_DIR", mkdtempSync(path.join(tmpdir(), "gcos-internal-")));
  vi.stubEnv("CLOUD_TASKS_QUEUE", tasks ? "projects/gcos/locations/us-central1/queues/video" : "");
  vi.stubEnv("CLOUD_TASKS_SERVICE_ACCOUNT", tasks ? SA : "");
  vi.stubEnv("JOBS_WORKER_URL", tasks ? WORKER : "");
  const { createApp } = await import("../../server.js");
  const { jobStore } = await import("../../lib/jobs/index.js");
  await jobStore().create({
    id: "job-1", userId: "anonymous", kind: "video", status: "queued",
    params: { modelId: "veo", instruction: "a wave" }, createdAt: new Date().toISOString(),
  });
  return { app: createApp() as Express, store: jobStore() };
}

const run = (a: Express, token?: string) => {
  const r = request(a).post("/internal/jobs/job-1/run");
  return token ? r.set("Authorization", `Bearer ${token}`) : r;
};

beforeEach(() => {
  generateVideo.mockReset();
  generateVideo.mockResolvedValue({ videoUrl: "data:video/mp4;base64,AAAA", modelUsed: "veo" });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /internal/jobs/:id/run", () => {
  it("runs the job for the task's token, and answers once it is settled", async () => {
    const { app, store } = await load();
    const res = await run(app, `task|${SA}|${WORKER}`);
    expect(res.status).toBe(204);
    expect((await store.get("job-1", "anonymous"))?.status).toBe("done");
  });

  it("a retried task runs nothing twice", async () => {
    const { app } = await load();
    await run(app, `task|${SA}|${WORKER}`);
    expect((await run(app, `task|${SA}|${WORKER}`)).status).toBe(204);
    expect(generateVideo).toHaveBeenCalledTimes(1);
  });

  it("refuses no token, another audience, another account, or an unverified email", async () => {
    const { app, store } = await load();
    expect((await run(app)).status).toBe(401);
    expect((await run(app, `task|${SA}|https://elsewhere.example`)).status).toBe(401);
    expect((await run(app, `task|someone@gcos.iam.gserviceaccount.com|${WORKER}`)).status).toBe(403);
    expect((await run(app, `task|${SA}|${WORKER}|unverified`)).status).toBe(403);
    expect((await store.get("job-1", "anonymous"))?.status).toBe("queued");
    expect(generateVideo).not.toHaveBeenCalled();
  });

  it("is not there at all in process", async () => {
    const { app } = await load(false);
    expect((await run(app, `task|${SA}|${WORKER}`)).status).toBe(404);
  });

  it("cannot be reached as /api/internal (the proxy's only way in)", async () => {
    const { app } = await load();
    expect((await request(app).post("/api/internal/jobs/job-1/run").set("Authorization", `Bearer task|${SA}|${WORKER}`)).status).toBe(404);
  });
});
