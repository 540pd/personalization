import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import jwt from "jsonwebtoken";
import type { Express } from "express";

// Video jobs (#325): queued, run, polled; stuck ones failed; ones a restart
// interrupted picked up again. Local disk, as a dev backend runs.

const { generateVideo } = vi.hoisted(() => ({ generateVideo: vi.fn() }));
vi.mock("../../capabilities/index.js", () => ({
  getCapability: () => ({ generateV2: vi.fn() }),
  getTextCapability: () => ({ generateText: vi.fn() }),
  getVideoCapability: () => ({ generateVideo, getVideo: vi.fn() }),
}));

const SECRET = "test-secret";
const VIDEO = `data:video/mp4;base64,${Buffer.from("fake mp4").toString("base64")}`;
let dataDir = "";

async function load() {
  vi.resetModules();
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-id");
  vi.stubEnv("SESSION_SECRET", SECRET);
  for (const k of ["FIRESTORE_PROJECT_ID", "GCS_BUCKET_NAME", "AUTH_MODE"]) vi.stubEnv(k, "");
  vi.stubEnv("LOCAL_DATA_DIR", dataDir);
  const server = await import("../../server.js");
  const jobs = await import("../../services/videoJobs.js");
  const store = await import("../../lib/jobs/index.js");
  return { app: server.createApp() as Express, jobs, store };
}

const as = (email: string) => `gcos_session=${jwt.sign({ email }, SECRET, { expiresIn: 3600 })}`;
const ANA = as("ana@accenture.com");
const BEN = as("ben@accenture.com");
const body = (extra: Record<string, unknown> = {}) => ({ modelId: "veo-3.1-lite-generate-001", instruction: "a wave", ...extra });

async function poll(a: Express, id: string, cookie = ANA) {
  let job = { status: "pending" } as { status: string; videoUrl?: string; message?: string };
  for (let i = 0; i < 40 && job.status === "pending"; i++) {
    await new Promise((r) => setTimeout(r, 10));
    job = (await request(a).get(`/api/generate/job/${id}`).set("Cookie", cookie)).body;
  }
  return job;
}

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "gcos-videojobs-"));
  generateVideo.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/generate/video and polling", () => {
  it("queues, runs, and answers the stored video; the contract is unchanged", async () => {
    const { app } = await load();
    generateVideo.mockResolvedValue({ videoUrl: VIDEO, modelUsed: "veo" });
    const start = await request(app).post("/api/generate/video").set("Cookie", ANA).send(body());
    expect(start.status).toBe(202);
    expect(start.body).toEqual({ jobId: expect.any(String), status: "pending" });
    const job = await poll(app, start.body.jobId);
    expect(job).toMatchObject({ status: "done", modelUsed: "veo" });
    expect(job.videoUrl).toMatch(/^\/api\/proxy\/assets\//);
    expect(generateVideo).toHaveBeenCalledWith(expect.objectContaining({ userId: "ana@accenture.com", instruction: "a wave" }));
  });

  it("a failure lands on the job", async () => {
    const { app } = await load();
    generateVideo.mockRejectedValue(new Error("quota exhausted"));
    const start = await request(app).post("/api/generate/video").set("Cookie", ANA).send(body());
    expect(await poll(app, start.body.jobId)).toEqual({ jobId: start.body.jobId, status: "failed", message: "quota exhausted" });
  });

  it("another user's job is a 404", async () => {
    const { app } = await load();
    generateVideo.mockResolvedValue({ videoUrl: VIDEO, modelUsed: "veo" });
    const start = await request(app).post("/api/generate/video").set("Cookie", ANA).send(body());
    expect((await request(app).get(`/api/generate/job/${start.body.jobId}`).set("Cookie", BEN)).status).toBe(404);
    // Settled before the next test, which counts calls.
    await poll(app, start.body.jobId);
  });

  it("refuses references too large to queue, before any job", async () => {
    const { app } = await load();
    const big = `data:image/png;base64,${"A".repeat(950 * 1024)}`;
    const res = await request(app).post("/api/generate/video").set("Cookie", ANA).send(body({ references: [{ kind: "image", url: big }] }));
    expect(res.status).toBe(413);
    expect(generateVideo).not.toHaveBeenCalled();
  });
});

describe("jobs that outlive their runner", () => {
  it("a job still running after 20 minutes is failed when polled", async () => {
    const { app, store } = await load();
    const old = new Date(Date.now() - 21 * 60 * 1000).toISOString();
    await store.jobStore().create({
      id: "stuck", userId: "ana@accenture.com", kind: "video", status: "queued",
      params: { modelId: "veo", instruction: "x" }, createdAt: old,
    });
    await store.jobStore().claim("stuck");
    // Back-date the start, as a runner that died 21 minutes ago would leave it.
    const running = (await store.jobStore().get("stuck", "ana@accenture.com"))!;
    const fs = await import("node:fs/promises");
    await fs.writeFile(path.join(dataDir, "jobs", "stuck.json"), JSON.stringify({ ...running, startedAt: old }));
    const res = await request(app).get("/api/generate/job/stuck").set("Cookie", ANA);
    expect(res.body).toMatchObject({ status: "failed", message: "The video took too long and was stopped. Try again." });
  });

  it("after a restart, queued and interrupted jobs run again", async () => {
    // The process that queued these is gone: one never started, one died running.
    const first = await load();
    const now = new Date().toISOString();
    for (const id of ["never-started", "interrupted"]) {
      await first.store.jobStore().create({ id, userId: "ana@accenture.com", kind: "video", status: "queued", params: { modelId: "veo", instruction: id }, createdAt: now });
    }
    await first.store.jobStore().claim("interrupted");

    // A new process on the same folder.
    const second = await load();
    generateVideo.mockResolvedValue({ videoUrl: VIDEO, modelUsed: "veo" });
    expect(await second.jobs.resumeUnfinishedJobs()).toBe(2);
    for (const id of ["never-started", "interrupted"]) {
      expect(await poll(second.app, id)).toMatchObject({ status: "done" });
    }
    expect(generateVideo).toHaveBeenCalledTimes(2);
  });
});
