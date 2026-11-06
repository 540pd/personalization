import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import type { Express } from "express";
import { cleanDescription } from "../../services/describeService.js";
import type { TextGenerationParams } from "../../capabilities/types.js";

// "Describe it" (#448): POST /api/assets/:id/describe, on the memory store.

const SECRET = "test-secret";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff]);

/** Auth on, so two users can be told apart; `vertex` sets a project, for the stubbed model. */
async function app(vertex = false): Promise<Express> {
  vi.resetModules();
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-id");
  vi.stubEnv("SESSION_SECRET", SECRET);
  vi.stubEnv("VERTEX_PROJECT_ID", vertex ? "test-project" : "");
  for (const k of ["FIRESTORE_PROJECT_ID", "GCS_BUCKET_NAME"]) vi.stubEnv(k, "");
  const { createApp } = await import("../../server.js");
  return createApp();
}

const as = (email: string) => `gcos_session=${jwt.sign({ email }, SECRET, { expiresIn: 3600 })}`;
const ANA = as("ana@accenture.com");
const BEN = as("ben@accenture.com");

async function upload(a: Express, kind: string, name: string, type = "image/png", body: Buffer = PNG): Promise<string> {
  const res = await request(a)
    .post(`/api/assets?kind=${kind}&name=${name}`)
    .set("Cookie", ANA)
    .set("Content-Type", type)
    .send(body);
  expect(res.status).toBe(201);
  return res.body.id as string;
}

const describeIt = (a: Express, id: string, cookie = ANA) => request(a).post(`/api/assets/${id}/describe`).set("Cookie", cookie);

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.doUnmock("../../capabilities/index.js");
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/assets/:id/describe", () => {
  it("in mock mode, answers a placeholder naming the file, and never fails", async () => {
    const a = await app();
    const id = await upload(a, "productImage", "front.png");
    const res = await describeIt(a, id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ description: "[mock] A description of front.png." });
  });

  it("is a 404 for another user's asset, or a missing one", async () => {
    const a = await app();
    const id = await upload(a, "logo", "logo.png");
    expect((await describeIt(a, id, BEN)).status).toBe(404);
    expect((await describeIt(a, "nope")).status).toBe(404);
  });

  it("is a 415 for a video", async () => {
    const a = await app();
    const id = await upload(a, "styleExample", "clip.mp4", "video/mp4", Buffer.from([0, 0, 0, 1]));
    expect((await describeIt(a, id)).status).toBe(415);
  });

  it("needs a signed-in user", async () => {
    const a = await app();
    const id = await upload(a, "reference", "street.png");
    expect((await request(a).post(`/api/assets/${id}/describe`)).status).toBe(401);
  });

  it("sends the image with the prompt for its kind, and cleans the answer", async () => {
    const generateText = vi.fn(async (_params: TextGenerationParams) => ({ text: '  "Wet city street at dusk,\n neon reflections"  ', modelUsed: "gemini-3.5-flash-lite" }));
    vi.doMock("../../capabilities/index.js", async (orig) => ({
      ...(await orig<object>()),
      getTextCapability: () => ({ generateText }),
    }));
    const a = await app(true);
    const id = await upload(a, "reference", "street.png");
    const res = await describeIt(a, id);

    expect(res.body).toEqual({ description: "Wet city street at dusk, neon reflections" });
    const params = generateText.mock.calls[0][0];
    expect(params.modelId).toBe("gemini-3.5-flash-lite");
    expect(params.instruction).toMatch(/^Describe this reference image: the scene, the light, and the mood\./);
    expect(params.references).toEqual([{ kind: "image", url: `data:image/png;base64,${PNG.toString("base64")}`, name: "street.png" }]);
  });
});

describe("cleanDescription", () => {
  it("makes one unquoted line within the limit", () => {
    expect(cleanDescription("“Black wordmark”\n")).toBe("Black wordmark");
    expect(cleanDescription("a\n\nb   c")).toBe("a b c");
    expect(cleanDescription("x".repeat(3000))).toHaveLength(2000);
  });
});
