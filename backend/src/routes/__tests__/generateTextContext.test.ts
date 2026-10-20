import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../server.js";
import { MAX_CONTEXT_SKILLS, readMentionContext } from "../mentionContext.js";

// The prompt's @agent and @skills (#239), down the real mock path: CLAUDE.md
// rule 3, missing keys return a placeholder, holds with them too.
describe("POST /api/generate/text with an agent and skills (#239)", () => {
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

  const body = (extra: Record<string, unknown> = {}) => ({
    modelId: "gemini-3.5-flash-lite",
    instruction: "@copywriter taglines in @brand-voice",
    ...extra,
  });

  it("accepts them and the mock names them", async () => {
    const res = await request(createApp())
      .post("/api/generate/text")
      .send(body({ agent: { name: "copywriter", instructions: "Write three." }, skills: [{ name: "brand-voice", content: "Warm." }] }));
    expect(res.status).toBe(200);
    expect(res.body.modelUsed).toBe("mock");
    expect(res.body.text).toBe("[mock] @copywriter taglines in @brand-voice (as copywriter) (with skills: brand-voice)");
  });

  it("sends exactly what it did before without them", async () => {
    const res = await request(createApp()).post("/api/generate/text").send(body());
    expect(res.status).toBe(200);
    expect(res.body.text).toBe("[mock] @copywriter taglines in @brand-voice");
  });

  it("refuses a malformed agent or skill with a 400", async () => {
    for (const extra of [{ agent: "copywriter" }, { skills: "brand-voice" }, { skills: [{ name: "x" }] }]) {
      const res = await request(createApp()).post("/api/generate/text").send(body(extra));
      expect(res.status).toBe(400);
    }
  });
});

describe("readMentionContext", () => {
  it("caps the count and the total size", () => {
    const many = Array.from({ length: MAX_CONTEXT_SKILLS + 1 }, (_, i) => ({ name: `s${i}`, content: "x" }));
    expect(readMentionContext(undefined, many)).toMatchObject({ ok: false });
    const big = [{ name: "big", content: "x".repeat(400 * 1024 + 1) }];
    expect(readMentionContext(undefined, big)).toEqual({ ok: false, message: "agent and skills are over 400 KB in all." });
  });

  it("strips control characters and bounds names, keeping newlines", () => {
    const r = readMentionContext({ name: "a\u0000b", instructions: "one\ntwo\u0007" }, [{ name: "n".repeat(80), content: "c\td" }]);
    expect(r).toEqual({
      ok: true,
      agent: { name: "a b", instructions: "one\ntwo " },
      skills: [{ name: "n".repeat(60), content: "c\td" }],
    });
  });

  it("leaves both out when absent or empty", () => {
    expect(readMentionContext(undefined, [])).toEqual({ ok: true });
    expect(readMentionContext(null, null)).toEqual({ ok: true });
  });
});
