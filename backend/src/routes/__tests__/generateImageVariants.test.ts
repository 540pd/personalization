import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Stub the capability, not the service: that keeps the route, its validation
// and the fan-out all under test, and only the upstream SDK call replaced.
const { generateV2 } = vi.hoisted(() => ({ generateV2: vi.fn() }));

vi.mock("../../capabilities/index.js", () => ({
  getCapability: () => ({ generate: vi.fn(), generateV2 }),
  getTextCapability: () => ({ generateText: vi.fn() }),
  getVideoCapability: () => ({ generateVideo: vi.fn(), getVideo: vi.fn() }),
}));

import { createApp } from "../../server.js";

const app = createApp();

const body = (extra: Record<string, unknown> = {}) => ({
  modelId: "gemini-3.1-flash-image",
  instruction: "a cat on a bicycle",
  aspectRatio: "1:1",
  ...extra,
});

const post = (payload: Record<string, unknown>) =>
  request(app).post("/api/generate/image").send(payload);

const ok = (n: number) => ({ imageUrl: `https://example.test/${n}.png`, modelUsed: "test-model" });

describe("POST /api/generate/image — variants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let n = 0;
    generateV2.mockImplementation(() => Promise.resolve(ok(n++)));
  });

  it("returns the single-image shape when variants is absent", async () => {
    const res = await post(body());

    expect(res.status).toBe(200);
    expect(res.body.imageUrl).toBe("https://example.test/0.png");
    expect(res.body).not.toHaveProperty("imageUrls");
    expect(generateV2).toHaveBeenCalledTimes(1);
  });

  it("returns the single-image shape when variants is 1", async () => {
    const res = await post(body({ variants: 1 }));

    expect(res.status).toBe(200);
    expect(res.body.imageUrl).toBe("https://example.test/0.png");
    expect(res.body).not.toHaveProperty("imageUrls");
    expect(generateV2).toHaveBeenCalledTimes(1);
  });

  it("returns one url per variant, in order", async () => {
    const res = await post(body({ variants: 4 }));

    expect(res.status).toBe(200);
    expect(res.body.imageUrls).toEqual([
      "https://example.test/0.png",
      "https://example.test/1.png",
      "https://example.test/2.png",
      "https://example.test/3.png",
    ]);
    expect(res.body).not.toHaveProperty("imageUrl");
    expect(generateV2).toHaveBeenCalledTimes(4);
  });

  it("accepts the maximum of 10", async () => {
    const res = await post(body({ variants: 10 }));

    expect(res.status).toBe(200);
    expect(res.body.imageUrls).toHaveLength(10);
  });

  // Each variant is a billed call, so a bad count must never reach the model.
  it.each([
    ["zero", 0],
    ["above the cap", 11],
    ["fractional", 2.5],
    ["negative", -1],
    ["a numeric string", "4"],
    ["a boolean", true],
    ["an array", [4]],
  ])("rejects %s without calling the model", async (_label, variants) => {
    const res = await post(body({ variants }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
    expect(res.body.message).toMatch(/variants/);
    expect(generateV2).not.toHaveBeenCalled();
  });

  it("keeps the variants that worked when one fails", async () => {
    generateV2
      .mockResolvedValueOnce(ok(0))
      .mockRejectedValueOnce(new Error("quota exhausted"))
      .mockResolvedValueOnce(ok(2))
      .mockResolvedValueOnce(ok(3));

    const res = await post(body({ variants: 4 }));

    expect(res.status).toBe(200);
    expect(res.body.imageUrls).toHaveLength(3);
    expect(res.body.errors).toEqual([{ index: 1, message: "quota exhausted" }]);
  });

  it("fails the request only when every variant fails", async () => {
    generateV2.mockRejectedValue(new Error("model unavailable"));

    const res = await post(body({ variants: 3 }));

    expect(res.status).toBe(500);
    expect(res.body).not.toHaveProperty("imageUrls");
  });

  it("omits the errors field when nothing failed", async () => {
    const res = await post(body({ variants: 2 }));

    expect(res.body).not.toHaveProperty("errors");
  });

  it("issues the calls concurrently rather than one after another", async () => {
    let live = 0;
    let peak = 0;
    generateV2.mockImplementation(async () => {
      live += 1;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 10));
      live -= 1;
      return ok(0);
    });

    await post(body({ variants: 5 }));

    // Serial would never have more than one call in flight.
    expect(peak).toBe(5);
  });

  it("still validates the rest of the body before fanning out", async () => {
    const res = await post({ instruction: "no model given", variants: 4 });

    expect(res.status).toBe(400);
    expect(generateV2).not.toHaveBeenCalled();
  });
});
