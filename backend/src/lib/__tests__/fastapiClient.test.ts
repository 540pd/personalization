import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import http from "http";
import type { AddressInfo } from "net";
import {
  createFakeFastApiClient,
  createFastApiClient,
  fastApiConfig,
  FastApiError,
  type CreateJobRequest,
  type FastApiClient,
} from "../fastapi/index.js";
import { DEFAULT_TIMEOUTS_MS, type FastApiConfig } from "../fastapi/config.js";
import { fetchTransport, googleServiceTokens, TransportError, type HttpRequest, type HttpResponse } from "../fastapi/transport.js";

// The Node → FastAPI service client (#494, PACK NJS-08), shaped to the service
// in docs/aryash/GCOS-FastAPI-skills-main, on a fake token provider and a fake
// HTTP transport that records every request.

const BASE = "https://fastapi-internal.example.run.app";
const TOKEN = "service-id-token-abc";
const ANA = { ownerKey: "usr_ana" };

const config: FastApiConfig = { baseUrl: BASE, audience: BASE, timeoutsMs: { ...DEFAULT_TIMEOUTS_MS }, maxResponseBytes: 1024 };

type Answer = HttpResponse | TransportError | ((req: HttpRequest) => HttpResponse);
const ok = (body: unknown, status = 200): HttpResponse => ({ status, headers: {}, body: JSON.stringify(body) });
/** An error answer the way FastAPI sends one: { detail }. */
const err = (status: number, detail: unknown = `upstream said something with ${BASE} and ${TOKEN}`, headers: Record<string, string> = {}): HttpResponse => ({
  status,
  headers,
  body: JSON.stringify({ detail }),
});

/** The service's Skill row (app/service.py), ownerKey and hashes included. */
const row = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  skillId: "abc123-brand-tone",
  ownerKey: "usr_ana",
  registryResource: "projects/p/locations/us/skills/private-gcos-abc123-brand-tone",
  status: "draft",
  createHash: "deadbeef",
  createdAt: "2026-11-11T00:00:00Z",
  updatedAt: "2026-11-11T00:00:00Z",
  latestPublishedRevision: null,
  activePublishOp: null,
  ...over,
});

/** A client whose transport answers with `answers` in turn and records what it was sent. */
function setup(answers: Answer[], tokens = { token: vi.fn(async () => TOKEN) }) {
  const sent: HttpRequest[] = [];
  const transport = vi.fn(async (req: HttpRequest) => {
    sent.push(req);
    const next = answers.shift();
    if (!next) throw new Error("no more answers");
    if (next instanceof TransportError) throw next;
    return typeof next === "function" ? next(req) : next;
  });
  const sleep = vi.fn(async () => {});
  const client = createFastApiClient({ config, tokens, transport, sleep });
  return { client, sent, transport, tokens, sleep };
}

const job = (over: Partial<CreateJobRequest> = {}): CreateJobRequest => ({
  playspaceId: "ps_1",
  nodeId: "node_1",
  mode: "run",
  parentJobIds: ["job_0"],
  assetIds: ["asset_1"],
  skillRevisionRefs: ["registry/x/revisions/1"],
  requestedCount: 2,
  idempotencyKey: "click-1",
  ...over,
});
const publish = { markdown: "---\nname: brand-tone\n---\n# Instructions\n", toolNames: ["brand.read"], idempotencyKey: "6f0c4563-967d-45bd" };

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("what goes on the wire (the service's contract)", () => {
  it("sends the service token, the owner in X-Owner-Key, and no browser credential", async () => {
    const { client, sent } = setup([ok(row())]);
    await client.getSkill(ANA, "abc123-brand-tone", { requestId: "req-7" });
    expect(sent[0].headers).toEqual({
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/json",
      "X-Owner-Key": "usr_ana",
      "X-Request-Id": "req-7",
    });
  });

  it.each([
    ["createSkill", (c: FastApiClient) => c.createSkill(ANA, { slug: "brand-tone", displayName: "Brand Tone", description: "Applies brand voice" }), "POST", "/v1/skills", { slug: "brand-tone", display_name: "Brand Tone", description: "Applies brand voice" }, row()],
    ["listSkills", (c: FastApiClient) => c.listSkills(ANA), "GET", "/v1/skills", undefined, { skills: [row()] }],
    ["getSkill", (c: FastApiClient) => c.getSkill(ANA, "abc123-brand-tone"), "GET", "/v1/skills/abc123-brand-tone", undefined, row()],
    ["updateSkill", (c: FastApiClient) => c.updateSkill(ANA, "s1", { displayName: "New" }), "PATCH", "/v1/skills/s1", { display_name: "New" }, { status: "pending", operation: "op1" }],
    ["disableSkill", (c: FastApiClient) => c.disableSkill(ANA, "s1"), "DELETE", "/v1/skills/s1", undefined, { status: "disable_requested", operation: "op2" }],
    ["listRevisions", (c: FastApiClient) => c.listRevisions(ANA, "s1"), "GET", "/v1/skills/s1/revisions", undefined, { revisions: [] }],
    ["getRevision", (c: FastApiClient) => c.getRevision(ANA, "s1", "r1"), "GET", "/v1/skills/s1/revisions/r1", undefined, { name: "r1" }],
    ["publishSkill", (c: FastApiClient) => c.publishSkill(ANA, "s1", publish), "POST", "/v1/skills/s1/publish", { markdown: publish.markdown, tool_names: ["brand.read"] }, { operation_id: "op", status: "pending" }],
    ["getPublishStatus", (c: FastApiClient) => c.getPublishStatus(ANA, "s1", "op"), "GET", "/v1/skills/s1/publish-operations/op", undefined, { operation_id: "op", status: "published", revision: "r1" }],
    ["validateTools", (c: FastApiClient) => c.validateTools(ANA, ["brand.read"]), "POST", "/v1/tools/validate", { tool_names: ["brand.read"] }, { valid: true, results: [] }],
    ["draftSkill", (c: FastApiClient) => c.draftSkill(ANA, { name: "brand-tone", goal: "Short brand copy", approvedTools: ["brand.read"] }), "POST", "/v1/skills/ai-draft", { name: "brand-tone", goal: "Short brand copy", approved_tools: ["brand.read"] }, { markdown: "# x", approved_tools: [], warning: "Draft only" }],
  ] as const)("%s: %s %s", async (_name, callIt, method, path, body, answer) => {
    const { client, sent } = setup([ok(answer)]);
    await callIt(client);
    expect(sent[0].method).toBe(method);
    expect(sent[0].url).toBe(`${BASE}${path}`);
    expect(sent[0].body === undefined ? undefined : JSON.parse(sent[0].body)).toEqual(body);
    if (body === undefined) expect(sent[0].headers["Content-Type"]).toBeUndefined();
  });

  it("never puts the owner in a body: it travels only in X-Owner-Key", async () => {
    const { client, sent } = setup([ok(row())]);
    await client.createSkill(ANA, { slug: "brand-tone", displayName: "Brand Tone", description: "Applies brand voice" });
    expect(sent[0].body).not.toContain("usr_ana");
  });

  it("sends the publish key as the Idempotency-Key header, not in the body", async () => {
    const { client, sent } = setup([ok({ operation_id: "op", status: "pending" }, 202)]);
    expect(await client.publishSkill(ANA, "s1", publish)).toEqual({ operationId: "op", status: "pending", revision: null, error: null });
    expect(sent[0].headers["Idempotency-Key"]).toBe("6f0c4563-967d-45bd");
    expect(JSON.parse(sent[0].body!)).not.toHaveProperty("idempotency_key");
  });

  it("refuses a publish key the service would refuse, sending nothing", async () => {
    const { client, transport } = setup([ok({})]);
    await expect(client.publishSkill(ANA, "s1", { ...publish, idempotencyKey: "short" })).rejects.toMatchObject({ code: "validation_failed" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("trims a Skill row to known fields: the service's ownerKey and hashes never come back out", async () => {
    const { client } = setup([ok({ skills: [row(), row({ skillId: "s2", status: "creating" })] })]);
    const { skills } = await client.listSkills(ANA);
    expect(skills[0]).toEqual({
      skillId: "abc123-brand-tone",
      status: "draft",
      latestPublishedRevision: null,
      registryResource: "projects/p/locations/us/skills/private-gcos-abc123-brand-tone",
      createdAt: "2026-11-11T00:00:00Z",
      updatedAt: "2026-11-11T00:00:00Z",
    });
    expect(JSON.stringify(skills)).not.toMatch(/usr_ana|ownerKey|createHash|activePublishOp/);
  });

  it("uses each operation's timeout and the response size limit", async () => {
    const { client, sent } = setup([ok({ job_id: "j" }), ok({ skills: [] }), ok({ markdown: "# x", approved_tools: [], warning: "" })]);
    await client.createJob(ANA, job());
    await client.listSkills(ANA);
    await client.draftSkill(ANA, { name: "brand-tone", goal: "Short brand copy" });
    expect(sent.map((r) => r.timeoutMs)).toEqual([15_000, 10_000, 30_000]);
    expect(sent.every((r) => r.maxResponseBytes === 1024)).toBe(true);
  });

  it("encodes IDs into the path and refuses one that isn't an ID", async () => {
    const { client } = setup([ok(row())]);
    await expect(client.getSkill(ANA, "../admin")).rejects.toMatchObject({ code: "validation_failed" });
    await expect(client.getRevision(ANA, "s1", "r/../x")).rejects.toMatchObject({ code: "validation_failed" });
    for (const id of ["..", ".", "a..b"]) await expect(client.getSkill(ANA, id)).rejects.toMatchObject({ code: "validation_failed" });
  });

  it("treats a malformed answer as a broken service", async () => {
    const { client } = setup([ok({ status: "draft" }), ok({ skills: "nope" }), ok({ operation_id: "op", status: "done" })]);
    await expect(client.getSkill(ANA, "s1")).rejects.toMatchObject({ status: 502 });
    await expect(client.listSkills(ANA)).rejects.toMatchObject({ status: 502 });
    await expect(client.getPublishStatus(ANA, "s1", "op")).rejects.toMatchObject({ status: 502 });
  });
});

describe("the owner comes from the session", () => {
  it.each([
    ["ownerKey", { ownerKey: "usr_ben" }],
    ["owner_key", { owner_key: "usr_ben" }],
    ["a nested owner", { nested: { owner: "usr_ben" } }],
  ])("refuses input carrying %s, sending nothing", async (_label, extra) => {
    const { client, transport } = setup([ok({})]);
    await expect(client.draftSkill(ANA, { name: "brand-tone", goal: "Short brand copy", ...extra } as never)).rejects.toMatchObject({ status: 422, code: "validation_failed" });
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([[""], ["own_ana"], ["usr_"], [`usr_${"a".repeat(125)}`]])("refuses an owner key the service wouldn't take (%s)", async (ownerKey) => {
    const { client, transport } = setup([ok({})]);
    await expect(client.listSkills({ ownerKey })).rejects.toBeInstanceOf(FastApiError);
    expect(transport).not.toHaveBeenCalled();
  });
});

describe("retries", () => {
  it("retries an idempotent publish once after a 503, with the same body and key and a fresh token", async () => {
    const { client, sent, tokens, sleep } = setup([err(503), ok({ operation_id: "op", status: "published", revision: "r1" })]);
    expect((await client.publishSkill(ANA, "s1", publish)).status).toBe("published");
    expect(sent).toHaveLength(2);
    expect(sent[1].body).toBe(sent[0].body);
    expect(sent[1].headers["Idempotency-Key"]).toBe(sent[0].headers["Idempotency-Key"]);
    expect(tokens.token).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("retries a create: the service makes the same Skill from owner and slug", async () => {
    const { client, sent } = setup([new TransportError("timeout"), ok(row())]);
    expect((await client.createSkill(ANA, { slug: "brand-tone", displayName: "Brand Tone", description: "Applies brand voice" })).skillId).toBe("abc123-brand-tone");
    expect(sent).toHaveLength(2);
  });

  it("honours Retry-After on a 429, capped at 2 s", async () => {
    const { client, sleep } = setup([err(429, "slow down", { "retry-after": "60" }), ok({ skills: [] })]);
    await client.listSkills(ANA);
    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  it("retries an idempotent call once after a timeout, then gives up with 504", async () => {
    const { client, sent } = setup([new TransportError("timeout"), new TransportError("timeout")]);
    await expect(client.listSkills(ANA)).rejects.toMatchObject({ status: 504, code: "dependency_unavailable", retryable: true });
    expect(sent).toHaveLength(2);
  });

  it("doesn't retry a 4xx", async () => {
    const { client, sent } = setup([err(422, [{ loc: ["body", "tool_names"], msg: "too long", type: "too_long" }])]);
    await expect(client.validateTools(ANA, ["x"])).rejects.toMatchObject({ code: "validation_failed" });
    expect(sent).toHaveLength(1);
  });

  it("never retries the AI draft helper: each try is a billed model call", async () => {
    const { client, sent } = setup([err(503), ok({})]);
    await expect(client.draftSkill(ANA, { name: "brand-tone", goal: "Short brand copy" })).rejects.toMatchObject({ code: "dependency_unavailable" });
    expect(sent).toHaveLength(1);
  });
});

describe("createJob never submits twice (proposal: no service takes jobs yet)", () => {
  it("posts the job in snake_case with the owner in X-Owner-Key", async () => {
    const { client, sent } = setup([ok({ job_id: "job_42" }, 202)]);
    expect(await client.createJob(ANA, job())).toEqual({ status: "accepted", jobId: "job_42" });
    expect(sent[0]).toMatchObject({ method: "POST", url: `${BASE}/v1/jobs` });
    expect(sent[0].headers["X-Owner-Key"]).toBe("usr_ana");
    expect(JSON.parse(sent[0].body!)).toEqual({
      playspace_id: "ps_1",
      node_id: "node_1",
      mode: "run",
      parent_job_ids: ["job_0"],
      asset_ids: ["asset_1"],
      skill_revision_refs: ["registry/x/revisions/1"],
      requested_count: 2,
      idempotency_key: "click-1",
    });
  });

  it.each([
    ["a timeout", new TransportError("timeout")],
    ["a dropped connection", new TransportError("network")],
    ["a 503", err(503)],
    ["a 500", err(500)],
  ])("answers pending after %s, with one request sent", async (_label, answer) => {
    const { client, sent } = setup([answer, ok({ job_id: "second" })]);
    expect(await client.createJob(ANA, job({ idempotencyKey: "click-9" }))).toEqual({ status: "pending", idempotencyKey: "click-9" });
    expect(sent).toHaveLength(1);
  });

  it("passes a definite refusal on: a busy Playspace is 409 playspace_busy", async () => {
    const { client } = setup([{ status: 409, headers: {}, body: JSON.stringify({ error: { code: "playspace_busy" } }) }]);
    await expect(client.createJob(ANA, job())).rejects.toMatchObject({ status: 409, code: "playspace_busy" });
  });

  it("treats an answer without a job ID as a broken service, not a success", async () => {
    const { client } = setup([ok({}, 202)]);
    await expect(client.createJob(ANA, job())).rejects.toMatchObject({ status: 502, code: "dependency_unavailable" });
  });
});

describe("errors use the shared contract and leak nothing", () => {
  it.each([
    [401, 502, "dependency_unavailable", false],
    [403, 502, "dependency_unavailable", false],
    [429, 503, "dependency_unavailable", true],
    [500, 502, "dependency_unavailable", true],
    [404, 404, "resource_not_accessible", false],
    [409, 409, "conflict", false],
  ])("maps %i to %i %s", async (upstream, status, code, retryable) => {
    const { client } = setup([err(upstream), err(upstream)]);
    const e = (await client.getSkill(ANA, "s1").catch((x: unknown) => x)) as FastApiError;
    expect(e).toBeInstanceOf(FastApiError);
    expect({ status: e.status, code: e.code, retryable: e.retryable }).toEqual({ status, code, retryable });
    expect(e.message).not.toContain(BASE);
    expect(e.message).not.toContain(TOKEN);
    expect(e.message).not.toContain("upstream said");
  });

  it("turns the service's invalid_tools into tool_not_approved, naming each tool", async () => {
    const { client } = setup([err(422, { invalid_tools: ["shell.exec", "net.fetch"] })]);
    const e = (await client.publishSkill(ANA, "s1", publish).catch((x: unknown) => x)) as FastApiError;
    expect(e).toMatchObject({ status: 422, code: "tool_not_approved" });
    expect(e.issues).toEqual([
      { code: "tool_not_approved", path: "toolNames[0]", message: "shell.exec isn't an approved tool." },
      { code: "tool_not_approved", path: "toolNames[1]", message: "net.fetch isn't an approved tool." },
    ]);
  });

  it("turns Pydantic's validation detail into issues without the body prefix", async () => {
    const { client } = setup([err(422, [{ loc: ["body", "slug"], msg: "String should match pattern", type: "string_pattern_mismatch" }])]);
    const e = (await client.createSkill(ANA, { slug: "X", displayName: "Brand Tone", description: "Applies brand voice" }).catch((x: unknown) => x)) as FastApiError;
    expect(e).toMatchObject({ code: "validation_failed" });
    expect(e.issues).toEqual([{ code: "string_pattern_mismatch", path: "slug", message: "String should match pattern" }]);
  });

  it("refuses an answer over the size limit without retrying", async () => {
    const { client, sent } = setup([new TransportError("too_large"), ok({})]);
    await expect(client.listSkills(ANA)).rejects.toMatchObject({ status: 502, code: "dependency_unavailable" });
    expect(sent).toHaveLength(1);
  });

  it("answers 503 and sends nothing when the service token can't be minted", async () => {
    const tokens = { token: vi.fn(async () => Promise.reject(new Error(`metadata server down at ${BASE}`))) };
    const { client, transport } = setup([ok({})], tokens);
    await expect(client.listSkills(ANA)).rejects.toMatchObject({ status: 503, code: "dependency_unavailable", retryable: true });
    expect(transport).not.toHaveBeenCalled();
  });

  it("logs the operation and the outcome, never the base URL, the token, the owner or the key", async () => {
    const { client } = setup([err(503), err(503)]);
    await client.publishSkill(ANA, "s1", publish).catch(() => {});
    const logged = errors.mock.calls.flat().join(" ");
    expect(logged).toContain("/v1/skills/{skillId}/publish");
    expect(logged).toContain("503");
    for (const leak of [BASE, TOKEN, "usr_ana", publish.idempotencyKey]) expect(logged).not.toContain(leak);
  });

  it("refuses an answer that isn't JSON", async () => {
    const { client } = setup([{ status: 200, headers: {}, body: "<html>proxy page</html>" }]);
    await expect(client.listSkills(ANA)).rejects.toMatchObject({ status: 502, code: "dependency_unavailable" });
  });
});

describe("fastApiConfig", () => {
  it("is null without FASTAPI_BASE_URL: the fake is used", () => {
    expect(fastApiConfig({}, false)).toBeNull();
  });

  it("defaults the audience to the base URL and the timeouts to 15 s, 10 s and 30 s", () => {
    expect(fastApiConfig({ FASTAPI_BASE_URL: `${BASE}/` }, true)).toEqual({
      baseUrl: BASE,
      audience: BASE,
      timeoutsMs: { job: 15_000, skills: 10_000, helper: 30_000 },
      maxResponseBytes: 1024 * 1024,
    });
  });

  it("reads a custom audience and timeouts", () => {
    const cfg = fastApiConfig({ FASTAPI_BASE_URL: BASE, FASTAPI_AUDIENCE: "custom-aud", FASTAPI_JOB_TIMEOUT_MS: "5000" }, true)!;
    expect(cfg.audience).toBe("custom-aud");
    expect(cfg.timeoutsMs.job).toBe(5000);
  });

  it.each([
    [{ FASTAPI_BASE_URL: "not a url" }, false, /not a URL/],
    [{ FASTAPI_BASE_URL: "http://fastapi.internal" }, true, /HTTPS/],
    [{ FASTAPI_BASE_URL: "https://a.example.com?x=1" }, false, /plain/],
    [{ FASTAPI_BASE_URL: BASE, FASTAPI_SKILLS_TIMEOUT_MS: "5" }, false, /SKILLS_TIMEOUT/],
  ])("refuses %o", (env, deployed, message) => {
    expect(() => fastApiConfig(env, deployed)).toThrow(message);
  });

  it("allows plain HTTP locally", () => {
    expect(fastApiConfig({ FASTAPI_BASE_URL: "http://localhost:8000" }, false)!.baseUrl).toBe("http://localhost:8000");
  });
});

describe("googleServiceTokens", () => {
  it("mints the ID token for the configured audience through Application Default Credentials", async () => {
    const getIdTokenClient = vi.fn(async () => ({ getRequestHeaders: async () => ({ Authorization: "Bearer minted" }) }));
    const tokens = googleServiceTokens("aud-1", { getIdTokenClient } as never);
    expect(await tokens.token()).toBe("minted");
    expect(await tokens.token()).toBe("minted");
    expect(getIdTokenClient).toHaveBeenCalledWith("aud-1");
    expect(getIdTokenClient).toHaveBeenCalledTimes(1);
  });

  it("tries afresh after a failure", async () => {
    const getIdTokenClient = vi
      .fn()
      .mockResolvedValueOnce({ getRequestHeaders: async () => Promise.reject(new Error("no ADC")) })
      .mockResolvedValueOnce({ getRequestHeaders: async () => ({ Authorization: "Bearer later" }) });
    const tokens = googleServiceTokens("aud-1", { getIdTokenClient } as never);
    await expect(tokens.token()).rejects.toThrow();
    expect(await tokens.token()).toBe("later");
  });
});

describe("fetchTransport", () => {
  let server: http.Server;
  let url: string;
  let seen: http.IncomingHttpHeaders | undefined;
  beforeEach(async () => {
    server = http.createServer((req, res) => {
      seen = req.headers;
      if (req.url === "/big") return res.end("x".repeat(5000));
      if (req.url === "/slow") return void setTimeout(() => res.end("{}"), 1000);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(() => new Promise<void>((r) => server.close(() => r())));

  const req = (path: string, over: Partial<HttpRequest> = {}): HttpRequest => ({
    method: "GET",
    url: `${url}${path}`,
    headers: { Authorization: "Bearer t" },
    timeoutMs: 500,
    maxResponseBytes: 1000,
    ...over,
  });

  it("sends the headers and reads the answer", async () => {
    const res = await fetchTransport(req("/"));
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    expect(seen?.authorization).toBe("Bearer t");
  });

  it("cuts off an answer over the size limit", async () => {
    await expect(fetchTransport(req("/big"))).rejects.toMatchObject({ kind: "too_large" });
  });

  it("times out", async () => {
    await expect(fetchTransport(req("/slow", { timeoutMs: 100 }))).rejects.toMatchObject({ kind: "timeout" });
  });

  it("reports a refused connection as a network failure", async () => {
    await expect(fetchTransport(req("/", { url: "http://127.0.0.1:1/" }))).rejects.toMatchObject({ kind: "network" });
  });
});

describe("the fake FastAPI (placeholder)", () => {
  let fake: FastApiClient;
  beforeEach(() => {
    fake = createFakeFastApiClient();
  });
  const create = (p = ANA) => fake.createSkill(p, { slug: "brand-tone", displayName: "Brand Tone", description: "Applies brand voice" });

  it("returns the same job for the same idempotency key, per owner", async () => {
    const a = await fake.createJob(ANA, job());
    expect(await fake.createJob(ANA, job())).toEqual(a);
    expect(await fake.createJob({ ownerKey: "usr_ben" }, job())).not.toEqual(a);
  });

  it("makes the same Skill for the same owner and slug, like the service", async () => {
    const a = await create();
    expect(await create()).toEqual(a);
    expect((await create({ ownerKey: "usr_ben" })).skillId).not.toBe(a.skillId);
  });

  it("keeps one owner's Skills from another", async () => {
    const skill = await create();
    expect((await fake.listSkills(ANA)).skills).toHaveLength(1);
    expect((await fake.listSkills({ ownerKey: "usr_ben" })).skills).toHaveLength(0);
    await expect(fake.getSkill({ ownerKey: "usr_ben" }, skill.skillId)).rejects.toMatchObject({ status: 404 });
  });

  it("publishes once per key, refuses the same key with other content, and polls", async () => {
    const skill = await create();
    const first = await fake.publishSkill(ANA, skill.skillId, publish);
    expect(first.status).toBe("published");
    expect(await fake.publishSkill(ANA, skill.skillId, publish)).toEqual(first);
    await expect(fake.publishSkill(ANA, skill.skillId, { ...publish, markdown: "# other" })).rejects.toMatchObject({ status: 409, code: "conflict" });
    expect(await fake.getPublishStatus(ANA, skill.skillId, first.operationId)).toEqual(first);
  });

  it("refuses unapproved tools as tool_not_approved", async () => {
    const skill = await create();
    await expect(fake.publishSkill(ANA, skill.skillId, { ...publish, toolNames: ["shell.exec"] })).rejects.toMatchObject({ code: "tool_not_approved" });
    expect(await fake.validateTools(ANA, ["brand.read", "shell.exec", "brand.read"])).toEqual({
      valid: false,
      results: [
        { name: "brand.read", approved: true, reason: "approved by catalog" },
        { name: "shell.exec", approved: false, reason: "not in approved tool catalog" },
        { name: "brand.read", approved: false, reason: "duplicate" },
      ],
    });
  });

  it("drafts but never publishes", async () => {
    const draft = await fake.draftSkill(ANA, { name: "Brand Tone", goal: "Short brand copy" });
    expect(draft.markdown).toContain("name: brand-tone");
    expect(draft.warning).toMatch(/Draft only/);
    expect((await fake.listSkills(ANA)).skills).toHaveLength(0);
  });
});

describe("getFastApiClient", () => {
  afterEach(() => vi.unstubAllEnvs());

  async function load(env: Record<string, string>) {
    vi.resetModules();
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    return (await import("../fastapi/index.js")).getFastApiClient;
  }

  it("uses the fake locally without FASTAPI_BASE_URL, saying so once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const get = await load({ FASTAPI_BASE_URL: "", K_SERVICE: "", NODE_ENV: "test" });
    const client = get();
    expect(get()).toBe(client);
    expect((await client.createJob(ANA, job())).status).toBe("accepted");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("refuses the fake on a deployed backend", async () => {
    const get = await load({ FASTAPI_BASE_URL: "", K_SERVICE: "gcos-backend" });
    expect(() => get()).toThrow(/FASTAPI_BASE_URL is not set/);
  });

  it("builds the real client when FASTAPI_BASE_URL is set", async () => {
    const get = await load({ FASTAPI_BASE_URL: BASE, K_SERVICE: "gcos-backend" });
    expect(Object.keys(get()).sort()).toEqual(Object.keys(createFakeFastApiClient()).sort());
  });
});
