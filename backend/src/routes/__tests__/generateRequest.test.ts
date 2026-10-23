import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../server.js";
import { readGenerateRequest } from "../generateRequest.js";

const models = new Set(["model-a", "model-b"]);
const skills = [{ name: "brand-voice", content: "Warm." }];
const agent = { name: "copywriter", instructions: "Write three." };

describe("readGenerateRequest", () => {
  it("refuses a model outside the allow-list, naming the list", () => {
    for (const modelId of [undefined, "model-c", 4]) {
      expect(readGenerateRequest({ modelId, instruction: "x" }, { models, agent: false })).toEqual({
        ok: false,
        message: "modelId must be one of: model-a, model-b.",
      });
    }
  });

  it("refuses a missing or blank instruction", () => {
    for (const instruction of [undefined, "", "   ", 7]) {
      expect(readGenerateRequest({ modelId: "model-a", instruction }, { models, agent: false })).toEqual({
        ok: false,
        message: "instruction is required.",
      });
    }
  });

  it("checks the model before the instruction", () => {
    const out = readGenerateRequest({}, { models, agent: false });
    expect(out.ok === false && out.message).toMatch(/^modelId/);
  });

  it("passes on a malformed mention context's message", () => {
    expect(readGenerateRequest({ modelId: "model-a", instruction: "x", skills: "nope" }, { models, agent: false }))
      .toEqual({ ok: false, message: "skills must be an array." });
  });

  it("trims the instruction and reads skills and references", () => {
    expect(
      readGenerateRequest(
        { modelId: "model-b", instruction: "  a poster  ", skills, references: [{ url: "data:a" }] },
        { models, agent: false }
      )
    ).toEqual({
      ok: true,
      modelId: "model-b",
      instruction: "a poster",
      context: { skills },
      references: [{ kind: "image", url: "data:a" }],
    });
  });

  it("takes an agent only when the route does", () => {
    const body = { modelId: "model-a", instruction: "x", agent };
    const without = readGenerateRequest(body, { models, agent: false });
    expect(without.ok && without.context).toEqual({});

    const withAgent = readGenerateRequest(body, { models, agent: true });
    expect(withAgent.ok && withAgent.context).toEqual({ agent });

    // Ignored, so not validated either, where the route takes none.
    expect(readGenerateRequest({ ...body, agent: "bad" }, { models, agent: false }).ok).toBe(true);
    expect(readGenerateRequest({ ...body, agent: "bad" }, { models, agent: true }).ok).toBe(false);
  });

  it("tolerates a missing body", () => {
    expect(readGenerateRequest(undefined, { models, agent: false }).ok).toBe(false);
  });
});

// The routes' 400s, which the frontend shows as-is.
describe("generate routes' validation", () => {
  const saved = process.env.VERTEX_PROJECT_ID;

  beforeAll(() => {
    delete process.env.VERTEX_PROJECT_ID;
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterAll(() => {
    if (saved === undefined) delete process.env.VERTEX_PROJECT_ID;
    else process.env.VERTEX_PROJECT_ID = saved;
    vi.restoreAllMocks();
  });

  it.each([
    ["image", "gemini-3.1-flash-image, gemini-3.1-flash-lite-image, gemini-3-pro-image, gemini-nano-banana-2.1"],
    ["text", "gemini-3.8-flash, gemini-3.5-flash-lite"],
    ["video", "veo-3.1-lite-generate-001"],
  ])("/generate/%s names its own models", async (route, list) => {
    const res = await request(createApp()).post(`/api/generate/${route}`).send({ modelId: "nope", instruction: "x" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "validation_error", message: `modelId must be one of: ${list}.` });
  });

  it.each([
    ["image", "gemini-3.1-flash-image"],
    ["text", "gemini-3.8-flash"],
    ["video", "veo-3.1-lite-generate-001"],
  ])("/generate/%s requires an instruction", async (route, modelId) => {
    const res = await request(createApp()).post(`/api/generate/${route}`).send({ modelId, instruction: " " });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("instruction is required.");
  });

  it("the legacy POST /api/generate is gone", async () => {
    const res = await request(createApp()).post("/api/generate").send({ prompt: "a helmet" });
    expect(res.status).toBe(404);
  });
});
