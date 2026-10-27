import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import type { Express } from "express";

// Generation and stored files (#323): outputs answered as asset URLs, and
// asset URLs sent as references read back into bytes for the model.

const { generateV2, generateText, generateVideo } = vi.hoisted(() => ({
  generateV2: vi.fn(),
  generateText: vi.fn(),
  generateVideo: vi.fn(),
}));
vi.mock("../../capabilities/index.js", () => ({
  getCapability: () => ({ generateV2 }),
  getTextCapability: () => ({ generateText }),
  getVideoCapability: () => ({ generateVideo, getVideo: vi.fn() }),
}));

// The memory store, standing in for a durable one: whether assets outlive
// the process is the only thing the cloud store adds here.
const durable = vi.hoisted(() => ({ value: true }));
vi.mock("../../lib/assets/index.js", async (original) => ({
  ...(await original<typeof import("../../lib/assets/index.js")>()),
  assetsAreDurable: () => durable.value,
}));

const SECRET = "test-secret";
const PIXEL = Buffer.from("fake png bytes");
const dataUrl = (mime: string, bytes: Buffer) => `data:${mime};base64,${bytes.toString("base64")}`;

async function app(): Promise<Express> {
  vi.resetModules();
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-id");
  vi.stubEnv("SESSION_SECRET", SECRET);
  for (const k of ["FIRESTORE_PROJECT_ID", "GCS_BUCKET_NAME"]) vi.stubEnv(k, "");
  const { createApp } = await import("../../server.js");
  return createApp();
}

const as = (email: string) => `gcos_session=${jwt.sign({ email }, SECRET, { expiresIn: 3600 })}`;
const ANA = as("ana@accenture.com");
const BEN = as("ben@accenture.com");

async function content(a: Express, url: string, cookie = ANA): Promise<{ status: number; body: Buffer; type?: string }> {
  const res = await request(a).get(url.replace("/api/proxy", "/api")).set("Cookie", cookie).buffer(true).parse((r, cb) => {
    const chunks: Buffer[] = [];
    r.on("data", (c: Buffer) => chunks.push(c));
    r.on("end", () => cb(null, Buffer.concat(chunks)));
  });
  return { status: res.status, body: res.body as Buffer, type: res.headers["content-type"] };
}

const image = (extra: Record<string, unknown> = {}) => ({
  modelId: "gemini-3.1-flash-image", instruction: "a cat", aspectRatio: "1:1", ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  durable.value = true;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("generated outputs", () => {
  it("answers an image as a stored asset's URL, which serves the model's bytes", async () => {
    const a = await app();
    generateV2.mockResolvedValue({ imageUrl: dataUrl("image/png", PIXEL), modelUsed: "m" });
    const res = await request(a).post("/api/generate/image").set("Cookie", ANA).send(image());
    expect(res.status).toBe(200);
    expect(res.body.imageUrl).toMatch(/^\/api\/proxy\/assets\/[0-9a-f-]{36}\/content$/);
    const served = await content(a, res.body.imageUrl);
    expect(served.type).toBe("image/png");
    expect(Buffer.compare(served.body, PIXEL)).toBe(0);
    // Ana's, and only Ana's.
    expect((await content(a, res.body.imageUrl, BEN)).status).toBe(404);
    const list = await request(a).get("/api/assets").set("Cookie", ANA);
    expect(list.body).toEqual([expect.objectContaining({ source: "generated", url: res.body.imageUrl })]);
  });

  it("stores every variant", async () => {
    const a = await app();
    generateV2.mockResolvedValue({ imageUrl: dataUrl("image/png", PIXEL), modelUsed: "m" });
    const res = await request(a).post("/api/generate/image").set("Cookie", ANA).send(image({ variants: 3 }));
    expect(res.body.imageUrls).toHaveLength(3);
    expect(new Set(res.body.imageUrls).size).toBe(3);
    for (const url of res.body.imageUrls) expect(url).toMatch(/^\/api\/proxy\/assets\//);
  });

  it("leaves a URL that is not a data: URL as it is (the mock's placeholder)", async () => {
    const a = await app();
    generateV2.mockResolvedValue({ imageUrl: "https://via.placeholder.com/1.png", modelUsed: "mock" });
    const res = await request(a).post("/api/generate/image").set("Cookie", ANA).send(image());
    expect(res.body.imageUrl).toBe("https://via.placeholder.com/1.png");
  });

  it("stores a video job's output", async () => {
    const a = await app();
    generateVideo.mockResolvedValue({ videoUrl: dataUrl("video/mp4", PIXEL), modelUsed: "veo" });
    const start = await request(a).post("/api/generate/video").set("Cookie", ANA)
      .send({ modelId: "veo-3.1-lite-generate-001", instruction: "a wave" });
    expect(start.status).toBe(202);
    let job = { status: "pending" } as { status: string; videoUrl?: string };
    for (let i = 0; i < 20 && job.status === "pending"; i++) {
      await new Promise((r) => setTimeout(r, 10));
      job = (await request(a).get(`/api/generate/job/${start.body.jobId}`).set("Cookie", ANA)).body;
    }
    expect(job.status).toBe("done");
    expect(job.videoUrl).toMatch(/^\/api\/proxy\/assets\//);
    expect((await content(a, job.videoUrl!)).type).toBe("video/mp4");
  });
});

describe("assets in memory only", () => {
  beforeEach(() => {
    durable.value = false;
  });

  it("generation keeps answering data: URLs, which survive a backend restart", async () => {
    const a = await app();
    const inline = dataUrl("image/png", PIXEL);
    generateV2.mockResolvedValue({ imageUrl: inline, modelUsed: "m" });
    const count = async () => (await request(a).get("/api/assets").set("Cookie", ANA)).body.length;
    const before = await count();
    const res = await request(a).post("/api/generate/image").set("Cookie", ANA).send(image());
    expect(res.body.imageUrl).toBe(inline);
    expect(await count()).toBe(before);
  });

  it("an upload says it is not durable", async () => {
    const a = await app();
    const res = await request(a).post("/api/assets").set("Cookie", ANA).set("Content-Type", "image/png").send(PIXEL);
    expect(res.status).toBe(201);
    expect(res.body.durable).toBe(false);
  });
});

describe("asset references", () => {
  async function uploaded(a: Express, cookie = ANA): Promise<string> {
    const res = await request(a).post("/api/assets").set("Cookie", cookie).set("Content-Type", "image/png").send(PIXEL);
    return res.body.url;
  }

  it("reach the model as the stored bytes", async () => {
    const a = await app();
    const url = await uploaded(a);
    generateText.mockResolvedValue({ text: "ok", modelUsed: "m" });
    const res = await request(a).post("/api/generate/text").set("Cookie", ANA).send({
      modelId: "gemini-3.5-flash-lite", instruction: "describe it",
      references: [{ kind: "image", url, name: "cat" }, { kind: "text", text: "notes", name: "brief" }],
    });
    expect(res.status).toBe(200);
    expect(generateText.mock.calls[0][0].references).toEqual([
      { kind: "image", url: dataUrl("image/png", PIXEL), name: "cat" },
      { kind: "text", text: "notes", name: "brief" },
    ]);
  });

  it("still accept a data: URL as it is", async () => {
    const a = await app();
    generateV2.mockResolvedValue({ imageUrl: "https://x.test/1.png", modelUsed: "m" });
    const inline = dataUrl("image/jpeg", PIXEL);
    await request(a).post("/api/generate/image").set("Cookie", ANA).send(image({ references: [{ kind: "image", url: inline }] }));
    expect(generateV2.mock.calls[0][0].references).toEqual([{ kind: "image", url: inline }]);
  });

  it("refuse another user's asset, or a deleted one, before any model call", async () => {
    const a = await app();
    const bens = await uploaded(a, BEN);
    const gone = await uploaded(a);
    await request(a).delete(gone.replace("/api/proxy", "/api").replace("/content", "")).set("Cookie", ANA);

    for (const url of [bens, gone]) {
      const res = await request(a).post("/api/generate/image").set("Cookie", ANA)
        .send(image({ references: [{ kind: "image", url, name: "cat" }] }));
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Reference "cat" is no longer stored. Replace it and try again.');
    }
    const video = await request(a).post("/api/generate/video").set("Cookie", ANA)
      .send({ modelId: "veo-3.1-lite-generate-001", instruction: "x", references: [{ kind: "image", url: bens }] });
    expect(video.status).toBe(400);
    expect(video.body.message).toMatch(/no longer stored/);
    expect(generateV2).not.toHaveBeenCalled();
    expect(generateVideo).not.toHaveBeenCalled();
  });
});
