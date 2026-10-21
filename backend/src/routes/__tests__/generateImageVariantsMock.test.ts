import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../server.js";

// No capability stub here on purpose: this exercises the real
// ImagenCapability down the mock path, which is what a developer without GCP
// credentials actually hits. Rule 3 in CLAUDE.md -- missing keys return a
// placeholder, never crash -- has to hold for a batch too.
// The drawn placeholder (#335): inline in memory mode, or stored as an asset
// where assets are durable (the emulators in CI's backend-emulators job).
const PLACEHOLDER = /^(data:image\/png;base64,|\/api\/proxy\/assets\/[0-9a-f-]{36}\/content$)/;

describe("POST /api/generate/image — variants in mock mode", () => {
  const saved = process.env.VERTEX_PROJECT_ID;

  beforeAll(() => {
    delete process.env.VERTEX_PROJECT_ID;
    // The capability warns once per call; silence it so the run stays readable.
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterAll(() => {
    if (saved === undefined) delete process.env.VERTEX_PROJECT_ID;
    else process.env.VERTEX_PROJECT_ID = saved;
    vi.restoreAllMocks();
  });

  const body = (variants?: number) => ({
    modelId: "gemini-3.1-flash-image",
    instruction: "a cat on a bicycle",
    aspectRatio: "1:1",
    ...(variants === undefined ? {} : { variants }),
  });

  it("serves a single placeholder when variants is absent", async () => {
    const res = await request(createApp()).post("/api/generate/image").send(body());

    expect(res.status).toBe(200);
    expect(res.body.imageUrl).toMatch(PLACEHOLDER);
    expect(res.body.modelUsed).toBe("mock");
  });

  it("serves one placeholder per variant", async () => {
    const res = await request(createApp()).post("/api/generate/image").send(body(4));

    expect(res.status).toBe(200);
    expect(res.body.imageUrls).toHaveLength(4);
    res.body.imageUrls.forEach((url: string) => expect(url).toMatch(PLACEHOLDER));
    // Variants are told apart: each a different tint.
    expect(new Set(res.body.imageUrls).size).toBe(4);
    expect(res.body).not.toHaveProperty("errors");
  });

  it("still rejects an out-of-range count with no credentials", async () => {
    const res = await request(createApp()).post("/api/generate/image").send(body(99));

    expect(res.status).toBe(400);
  });
});
