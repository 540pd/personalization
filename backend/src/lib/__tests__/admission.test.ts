import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  DEFAULT_RUN_LIMITS,
  readRunEnvelope,
  runLimits,
  verifyRun,
  type AdmissionAsset,
  type AdmissionDeps,
  type AdmissionJob,
  type RunPrincipal,
} from "../admission/index.js";

// Run admission (#493, PACK NJS-07): the envelope reader, the verifier on fake
// stores, and the placeholder deps on the real (memory) stores.

const ANA: RunPrincipal = { email: "ana@accenture.com", ownerKey: "usr_ana" };
const BEN: RunPrincipal = { email: "ben@accenture.com", ownerKey: "usr_ben" };
const A1 = randomUUID();
const A2 = randomUUID();

const body = (over: Record<string, unknown> = {}) => ({ playspaceId: "ps_ana", nodeId: "node_b", mode: "run", requestedCount: 2, ...over });

/** Fake stores: Ana owns ps_ana, assets A1/A2 and jobs j1 (node_a), j2 (node_b, her own last), j3 (other Playspace). */
function fakes(over: Partial<AdmissionDeps> = {}): AdmissionDeps {
  const assets: Record<string, AdmissionAsset & { owner: string }> = {
    [A1]: { assetId: A1, mimeType: "image/png", bytes: 1000, state: "ready", storagePath: `users/ana/assets/${A1}`, owner: ANA.email },
    [A2]: { assetId: A2, mimeType: "image/webp", bytes: 2000, state: "ready", storagePath: `users/ana/assets/${A2}`, owner: ANA.email },
  };
  const jobs: Record<string, AdmissionJob & { owner: string }> = {
    j1: { jobId: "j1", state: "finished", playspaceId: "ps_ana", nodeId: "node_a", owner: ANA.email },
    j2: { jobId: "j2", state: "finished", playspaceId: "ps_ana", nodeId: "node_b", owner: ANA.email },
    j3: { jobId: "j3", state: "finished", playspaceId: "ps_other", nodeId: "node_a", owner: ANA.email },
    j4: { jobId: "j4", state: "running", playspaceId: "ps_ana", nodeId: "node_a", owner: ANA.email },
    jBen: { jobId: "jBen", state: "finished", playspaceId: "ps_ana", nodeId: "node_a", owner: BEN.email },
  };
  const strip = <T extends { owner: string }>(x: T | undefined, p: RunPrincipal) => {
    if (!x || x.owner !== p.email) return null;
    const { owner: _o, ...rest } = x;
    return rest;
  };
  return {
    ownsPlayspace: async (p, id) => p.email === ANA.email && id === "ps_ana",
    getAsset: async (p, id) => strip(assets[id], p) as AdmissionAsset | null,
    getJob: async (p, id) => strip(jobs[id], p) as AdmissionJob | null,
    resolveSkillRevision: async (p, ref) =>
      p.email === ANA.email && ref === "registry/skills/editorial/revisions/3" ? { pinned: true, revisionRef: ref, contentSha256: "ab" } : null,
    resolveInlineSkills: async (_p, skills) => skills.map((s) => ({ pinned: false, name: s.name, content: s.content })),
    checkCost: async () => ({ ok: true }),
    ...over,
  };
}

const run = (b: unknown, p = ANA, deps = fakes()) => verifyRun(p, b, deps, DEFAULT_RUN_LIMITS);

describe("readRunEnvelope", () => {
  const read = (b: unknown) => readRunEnvelope(b, DEFAULT_RUN_LIMITS);

  it("reads a minimal Run, defaulting mode to run and count to 1", () => {
    expect(read({ playspaceId: "ps_1", nodeId: "n1" })).toEqual({
      ok: true,
      envelope: { playspaceId: "ps_1", nodeId: "n1", mode: "run", requestedCount: 1, parentJobIds: [], assetIds: [], skillRevisionRefs: [], skills: [] },
    });
  });

  it.each([
    ["no Playspace", { playspaceId: undefined }, "playspaceId"],
    ["a Playspace with a slash", { playspaceId: "ps/1" }, "playspaceId"],
    ["an overlong node ID", { nodeId: "n".repeat(129) }, "nodeId"],
    ["an unknown mode", { mode: "edit" }, "mode"],
    ["count 0", { requestedCount: 0 }, "requestedCount"],
    ["count 11", { requestedCount: 11 }, "requestedCount"],
    ["count 1.5", { requestedCount: 1.5 }, "requestedCount"],
    ["assets not a list", { assetIds: "a" }, "assetIds"],
    ["a raw GCS path for an asset", { assetIds: ["gs://bucket/users/ben/assets/x"] }, "assetIds[0]"],
    ["a traversal path for an asset", { assetIds: ["../../users/ben/assets/x"] }, "assetIds[0]"],
    ["an asset URL instead of an ID", { assetIds: [`/api/proxy/assets/${A1}/content`] }, "assetIds[0]"],
    ["the same asset twice", { assetIds: [A1, A1] }, "assetIds[1]"],
    ["six assets", { assetIds: Array.from({ length: 6 }, () => randomUUID()) }, "assetIds"],
    ["the same parent twice", { parentJobIds: ["j1", "j1"] }, "parentJobIds[1]"],
    ["a Skill by URL", { skillRevisionRefs: ["https://registry.example.com/skills/x"] }, "skillRevisionRefs[0]"],
    ["a Skill by name", { skillRevisionRefs: ["editorial"] }, "skillRevisionRefs[0]"],
    ["a revision ref with ..", { skillRevisionRefs: ["registry/../revisions/1"] }, "skillRevisionRefs[0]"],
    ["a Skill over 100 KiB", { skills: [{ name: "big", content: "x".repeat(100 * 1024 + 1) }] }, "skills[0]"],
    ["Skills over 400 KiB together", { skills: Array.from({ length: 5 }, (_, i) => ({ name: `s${i}`, content: "x".repeat(90 * 1024) })) }, "skills"],
    ["21 Skills", { skills: Array.from({ length: 21 }, (_, i) => ({ name: `s${i}`, content: "x" })) }, "skills"],
    ["an instruction over 30,000 characters", { instruction: "x".repeat(30_001) }, "instruction"],
  ])("refuses %s", (_label, over, field) => {
    expect(read(body(over))).toMatchObject({ ok: false, field });
  });

  it.each(["ownerKey", "owner_key", "owner", "userId", "email"])("refuses a body naming its own %s", (key) => {
    expect(read(body({ [key]: "usr_ben" }))).toMatchObject({ ok: false, field: key });
  });

  it("refuses something that isn't an object", () => {
    expect(read(null)).toMatchObject({ ok: false });
    expect(read([body()])).toMatchObject({ ok: false });
  });
});

describe("verifyRun", () => {
  it("returns an AuthorizedRunContext with only what it proved", async () => {
    const result = await run(
      body({
        assetIds: [A1, A2],
        parentJobIds: ["j1"],
        skillRevisionRefs: ["registry/skills/editorial/revisions/3"],
        skills: [{ name: "local", content: "Be brief." }],
        instruction: "Make it brighter",
        extra: "ignored",
      })
    );
    expect(result).toEqual({
      ok: true,
      context: {
        principal: ANA,
        playspaceId: "ps_ana",
        nodeId: "node_b",
        mode: "run",
        requestedCount: 2,
        instruction: "Make it brighter",
        assets: [
          { assetId: A1, mimeType: "image/png", bytes: 1000, state: "ready", storagePath: `users/ana/assets/${A1}` },
          { assetId: A2, mimeType: "image/webp", bytes: 2000, state: "ready", storagePath: `users/ana/assets/${A2}` },
        ],
        skills: [
          { pinned: true, revisionRef: "registry/skills/editorial/revisions/3", contentSha256: "ab" },
          { pinned: false, name: "local", content: "Be brief." },
        ],
        parents: [{ jobId: "j1", nodeId: "node_a" }],
      },
    });
  });

  it("refuses another user's Playspace", async () => {
    expect(await run(body({ playspaceId: "ps_ben" }))).toMatchObject({ ok: false, status: 404, field: "playspaceId" });
    expect(await run(body(), BEN)).toMatchObject({ ok: false, status: 404, field: "playspaceId" });
  });

  it("answers the same for another user's asset as for one that doesn't exist", async () => {
    const deps = fakes({ ownsPlayspace: async () => true });
    const theirs = await verifyRun(BEN, body({ assetIds: [A1] }), deps, DEFAULT_RUN_LIMITS);
    const missing = await verifyRun(BEN, body({ assetIds: [randomUUID()] }), deps, DEFAULT_RUN_LIMITS);
    expect(theirs).toEqual(missing);
    expect(theirs).toMatchObject({ ok: false, status: 404, code: "resource_not_accessible", field: "assetIds[0]" });
  });

  it.each([
    ["not ready", { state: "uploading" as const }, /isn't ready/],
    ["a GIF", { mimeType: "image/gif" }, /PNG, JPEG or WebP/],
    ["a video", { mimeType: "video/mp4" }, /PNG, JPEG or WebP/],
    ["too big", { bytes: 26 * 1024 * 1024 }, /over 25 MiB/],
  ])("refuses an asset that is %s", async (_label, change, message) => {
    const deps = fakes({
      getAsset: async (_p, id) => ({ assetId: id, mimeType: "image/png", bytes: 10, state: "ready", storagePath: "x", ...change }),
    });
    expect(await run(body({ assetIds: [A1] }), ANA, deps)).toMatchObject({ ok: false, status: 422, field: "assetIds[0]", message: expect.stringMatching(message) });
  });

  it("refuses a Skill revision the owner may not use, like a missing one", async () => {
    const theirs = await run(body({ skillRevisionRefs: ["registry/skills/editorial/revisions/3"] }), BEN, fakes({ ownsPlayspace: async () => true }));
    expect(theirs).toMatchObject({ ok: false, status: 404, field: "skillRevisionRefs[0]" });
    expect(await run(body({ skillRevisionRefs: ["registry/skills/other/revisions/1"] }))).toMatchObject({ ok: false, status: 404 });
  });

  it("refuses a resolver answer that isn't the revision asked for", async () => {
    const deps = fakes({ resolveSkillRevision: async () => ({ pinned: true, revisionRef: "registry/skills/x/revisions/9", contentSha256: "x" }) });
    expect(await run(body({ skillRevisionRefs: ["registry/skills/editorial/revisions/3"] }), ANA, deps)).toMatchObject({ ok: false, status: 404 });
  });

  it.each([
    ["another user's", "jBen", 404],
    ["a missing", "j_missing", 404],
    ["another Playspace's", "j3", 404],
    ["an unfinished", "j4", 422],
  ])("refuses %s parent job", async (_label, jobId, status) => {
    expect(await run(body({ parentJobIds: [jobId] }))).toMatchObject({ ok: false, status, field: "parentJobIds[0]" });
  });

  it("refuses a parent job it can't place in a Playspace (fail closed)", async () => {
    const deps = fakes({ getJob: async (_p, id) => ({ jobId: id, state: "finished" }) });
    expect(await run(body({ parentJobIds: ["j1"] }), ANA, deps)).toMatchObject({ ok: false, status: 404 });
  });

  it("refuses a node as its own parent in run and re-run", async () => {
    expect(await run(body({ parentJobIds: ["j1", "j2"] }))).toMatchObject({ ok: false, status: 422, field: "parentJobIds[1]", message: /own parent/ });
    expect(await run(body({ mode: "rerun", parentJobIds: ["j2"] }))).toMatchObject({ ok: false, status: 422, message: /own parent/ });
  });

  it("re-runs from parents' outputs, and needs at least one parent", async () => {
    expect(await run(body({ mode: "rerun", parentJobIds: ["j1"] }))).toMatchObject({ ok: true, context: { parents: [{ jobId: "j1", nodeId: "node_a" }] } });
    expect(await run(body({ mode: "rerun" }))).toMatchObject({ ok: false, status: 422, field: "parentJobIds" });
  });

  it("refines from the node's own last output only", async () => {
    expect(await run(body({ mode: "refine", parentJobIds: ["j2"] }))).toMatchObject({ ok: true, context: { parents: [{ jobId: "j2", nodeId: "node_b" }] } });
    for (const parentJobIds of [[], ["j1"], ["j2", "j1"]]) {
      expect(await run(body({ mode: "refine", parentJobIds }))).toMatchObject({ ok: false, status: 422, message: /Refine/ });
    }
  });

  it("refuses with 429 when the cost check does", async () => {
    const deps = fakes({ checkCost: async () => ({ ok: false, message: "Daily image limit reached." }) });
    expect(await run(body(), ANA, deps)).toMatchObject({ ok: false, status: 429, code: "cost_limit", message: "Daily image limit reached." });
  });

  it("refuses with 503 when a store fails, rather than letting the Run through", async () => {
    const deps = fakes({ getAsset: async () => Promise.reject(new Error("UNAVAILABLE")) });
    expect(await run(body({ assetIds: [A1] }), ANA, deps)).toMatchObject({ ok: false, status: 503, code: "dependency_unavailable" });
  });

  it("takes the owner from the principal only, never the body", async () => {
    expect(await run(body({ ownerKey: "usr_ana" }), BEN)).toMatchObject({ ok: false, status: 422, field: "ownerKey" });
    expect(await run(body(), { email: "" })).toMatchObject({ ok: false, status: 403 });
  });

  it("checks nothing else once a check fails", async () => {
    const getAsset = vi.fn(fakes().getAsset);
    await run(body({ playspaceId: "ps_ben", assetIds: [A1] }), ANA, fakes({ getAsset }));
    expect(getAsset).not.toHaveBeenCalled();
  });
});

describe("runLimits", () => {
  it("defaults to today's numbers", () => {
    expect(runLimits({})).toEqual(DEFAULT_RUN_LIMITS);
    expect(DEFAULT_RUN_LIMITS).toMatchObject({ maxSkills: 20, maxAssetBytes: 25 * 1024 * 1024, maxSkillBytes: 100 * 1024, maxCount: 10 });
  });

  it("lowers to the pack's numbers by config", () => {
    expect(runLimits({ RUN_MAX_SKILLS: "5", RUN_MAX_ASSET_BYTES: String(10 * 1024 * 1024) })).toMatchObject({ maxSkills: 5, maxAssetBytes: 10 * 1024 * 1024 });
  });

  it.each([{ RUN_MAX_SKILLS: "0" }, { RUN_MAX_ASSETS: "five" }, { RUN_MAX_COUNT: "11" }])("refuses %o", (env) => {
    expect(() => runLimits(env)).toThrow();
  });
});

describe("placeholder admission on the real stores", () => {
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const user = (): RunPrincipal => ({ email: `u-${Math.random().toString(36).slice(2)}@accenture.com` });

  async function load() {
    vi.resetModules();
    vi.stubEnv("FIRESTORE_PROJECT_ID", "");
    vi.stubEnv("GCS_BUCKET_NAME", "");
    vi.stubEnv("LOCAL_DATA_DIR", "memory");
    const admission = await import("../admission/index.js");
    const { boardStore } = await import("../boards/index.js");
    const { assetStore } = await import("../assets/index.js");
    const { jobStore } = await import("../jobs/index.js");
    return { ...admission, boardStore, assetStore, jobStore };
  }

  it("admits the owner's board and asset, resolving the asset's storage path internally", async () => {
    const { verifyRunRequest, boardStore, assetStore } = await load();
    const ana = user();
    const board = await boardStore().create(ana.email, "PlaySpace");
    const asset = await assetStore().put(ana.email, PNG, "image/png", "upload");
    const result = await verifyRunRequest(ana, { playspaceId: board.id, nodeId: "n1", assetIds: [asset.id], skills: [{ name: "s", content: "Be brief." }] });
    expect(result).toMatchObject({
      ok: true,
      context: {
        playspaceId: board.id,
        assets: [{ assetId: asset.id, state: "ready", storagePath: `users/${encodeURIComponent(ana.email)}/assets/${asset.id}` }],
        skills: [{ pinned: false, name: "s" }],
      },
    });
    vi.unstubAllEnvs();
  });

  it("refuses another user's board and asset alike", async () => {
    const { verifyRunRequest, boardStore, assetStore } = await load();
    const [ana, ben] = [user(), user()];
    const board = await boardStore().create(ana.email, "PlaySpace");
    const asset = await assetStore().put(ana.email, PNG, "image/png", "upload");
    expect(await verifyRunRequest(ben, { playspaceId: board.id, nodeId: "n1" })).toMatchObject({ ok: false, status: 404 });
    const benBoard = await boardStore().create(ben.email, "PlaySpace");
    expect(await verifyRunRequest(ben, { playspaceId: benBoard.id, nodeId: "n1", assetIds: [asset.id] })).toMatchObject({ ok: false, status: 404, field: "assetIds[0]" });
    vi.unstubAllEnvs();
  });

  it("refuses every parent job and Registry ref until their sources exist", async () => {
    const { verifyRunRequest, boardStore, jobStore } = await load();
    const ana = user();
    const board = await boardStore().create(ana.email, "PlaySpace");
    await jobStore().create({ id: "job_x", userId: ana.email, kind: "video", status: "done", params: { modelId: "m", instruction: "i" }, createdAt: new Date().toISOString() });
    expect(await verifyRunRequest(ana, { playspaceId: board.id, nodeId: "n1", parentJobIds: ["job_x"] })).toMatchObject({ ok: false, status: 404 });
    expect(await verifyRunRequest(ana, { playspaceId: board.id, nodeId: "n1", skillRevisionRefs: ["registry/skills/a/revisions/1"] })).toMatchObject({ ok: false, status: 404 });
    vi.unstubAllEnvs();
  });

  it("logs the cost check's size, and nothing about the content", async () => {
    const { verifyRunRequest, boardStore } = await load();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const ana = user();
    const board = await boardStore().create(ana.email, "PlaySpace");
    await verifyRunRequest(ana, { playspaceId: board.id, nodeId: "n1", requestedCount: 3, instruction: "secret prompt" });
    const logged = log.mock.calls.flat().join(" ");
    expect(logged).toContain("count=3");
    expect(logged).not.toContain("secret prompt");
    expect(logged).not.toContain(ana.email);
    log.mockRestore();
    vi.unstubAllEnvs();
  });
});
