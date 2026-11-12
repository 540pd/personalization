import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { DEV_ORIGINS } from "../../lib/allowedOrigins.js";

// POST /api/runs through the real app (#491 PACK NJS-05, #492 PACK NJS-06):
// opaque sessions, Google stubbed, memory storage, the placeholder FastAPI.

const ORIGIN = DEV_ORIGINS[0];

vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    async verifyIdToken({ idToken }: { idToken: string }) {
      const over = JSON.parse(idToken.slice("claims:".length)) as Record<string, unknown>;
      const payload = {
        iss: "https://accounts.google.com",
        sub: "sub-ana",
        exp: Math.floor(Date.now() / 1000) + 3600,
        email: "ana@accenture.com",
        email_verified: true,
        hd: "accenture.com",
        ...over,
      };
      return { getPayload: () => payload };
    }
  },
  GoogleAuth: class {},
}));

async function app(env: Record<string, string> = {}): Promise<Express> {
  vi.resetModules();
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-id");
  vi.stubEnv("SESSION_MODE", "opaque");
  vi.stubEnv("SESSION_SECRET", "s");
  vi.stubEnv("ALLOWED_EMAIL_DOMAINS", "accenture.com");
  vi.stubEnv("ALLOWED_HOSTED_DOMAINS", undefined);
  for (const k of ["AUTH_MODE", "FIRESTORE_PROJECT_ID", "GCS_BUCKET_NAME", "FASTAPI_BASE_URL"]) vi.stubEnv(k, "");
  vi.stubEnv("LOCAL_DATA_DIR", "memory");
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const { createApp } = await import("../../server.js");
  return createApp();
}

/** Signs in as `sub` and returns the session cookie. */
async function signIn(a: Express, sub = "sub-ana", email = "ana@accenture.com"): Promise<string> {
  const res = await request(a).post("/api/session/refresh").set("Origin", ORIGIN).set("Authorization", `Bearer claims:${JSON.stringify({ sub, email })}`);
  return ([] as string[]).concat(res.headers["set-cookie"] ?? []).find((c) => c.startsWith("gcos_session="))!.split(";")[0];
}

const board = async (a: Express, cookie: string) => (await request(a).post("/api/boards").set("Origin", ORIGIN).set("Cookie", cookie).send({ name: "PlaySpace" })).body.id as string;
const run = (a: Express, cookie: string, key: string | null, body: Record<string, unknown>) => {
  const r = request(a).post("/api/runs").set("Origin", ORIGIN).set("Cookie", cookie);
  if (key !== null) r.set("Idempotency-Key", key);
  return r.send(body);
};

beforeEach(() => {
  for (const level of ["log", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/runs", () => {
  it("admits a Run: 202 with its job ID, accepted by FastAPI", async () => {
    const a = await app();
    const cookie = await signIn(a);
    const ps = await board(a, cookie);
    const res = await run(a, cookie, "click-0001", { playspaceId: ps, nodeId: "n1", requestedCount: 2 });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ jobId: expect.stringMatching(/^job_[0-9a-f]{32}$/), status: "accepted" });
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("answers a repeated click with the same job, and calls FastAPI once", async () => {
    const a = await app();
    const cookie = await signIn(a);
    const ps = await board(a, cookie);
    const { getFastApiClient } = await import("../../lib/fastapi/index.js");
    const createJob = vi.spyOn(getFastApiClient(), "createJob");
    const first = await run(a, cookie, "click-0002", { playspaceId: ps, nodeId: "n1" });
    const again = await run(a, cookie, "click-0002", { playspaceId: ps, nodeId: "n1" });
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    expect(createJob).toHaveBeenCalledTimes(1);
  });

  it("refuses the same key with a changed Run, and a new click while the Playspace runs", async () => {
    const a = await app();
    const cookie = await signIn(a);
    const ps = await board(a, cookie);
    await run(a, cookie, "click-0003", { playspaceId: ps, nodeId: "n1" });
    const changed = await run(a, cookie, "click-0003", { playspaceId: ps, nodeId: "n1", requestedCount: 4 });
    expect(changed.status).toBe(409);
    expect(changed.body.error).toBe("idempotency_conflict");
    const busy = await run(a, cookie, "click-0004", { playspaceId: ps, nodeId: "n2" });
    expect(busy.status).toBe(409);
    expect(busy.body.error).toBe("playspace_busy");
  });

  it("lets another Playspace of the same owner run at the same time", async () => {
    const a = await app();
    const cookie = await signIn(a);
    const [ps1, ps2] = [await board(a, cookie), await board(a, cookie)];
    expect((await run(a, cookie, "click-0005", { playspaceId: ps1, nodeId: "n1" })).status).toBe(202);
    expect((await run(a, cookie, "click-0006", { playspaceId: ps2, nodeId: "n1" })).status).toBe(202);
  });

  it("refuses another user's Playspace with 404, reserving nothing", async () => {
    const a = await app();
    const ana = await signIn(a);
    const ben = await signIn(a, "sub-ben", "ben@accenture.com");
    const ps = await board(a, ana);
    const res = await run(a, ben, "click-0007", { playspaceId: ps, nodeId: "n1" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("resource_not_accessible");
    expect((await run(a, ana, "click-0008", { playspaceId: ps, nodeId: "n1" })).status).toBe(202);
  });

  it("keeps the same key apart for different users", async () => {
    const a = await app();
    const ana = await signIn(a);
    const ben = await signIn(a, "sub-ben", "ben@accenture.com");
    const one = await run(a, ana, "click-0009", { playspaceId: await board(a, ana), nodeId: "n1" });
    const two = await run(a, ben, "click-0009", { playspaceId: await board(a, ben), nodeId: "n1" });
    expect(one.status).toBe(202);
    expect(two.status).toBe(202);
    expect(one.body.jobId).not.toBe(two.body.jobId);
  });

  it("frees the Playspace when the job finishes, and lets the next Run refine from it", async () => {
    const a = await app();
    const cookie = await signIn(a);
    const ps = await board(a, cookie);
    const first = await run(a, cookie, "click-0010", { playspaceId: ps, nodeId: "n1" });
    const { runs, runAdmissionStore } = await import("../../lib/runs/index.js");
    const ownerKey = (await runAdmissionStore().getRun(first.body.jobId))!.ownerKey;
    expect(await runs().finishRun(ownerKey, ps, first.body.jobId, "finished")).toBe(true);
    const refine = await run(a, cookie, "click-0011", { playspaceId: ps, nodeId: "n1", mode: "refine", parentJobIds: [first.body.jobId] });
    expect(refine.status).toBe(202);
  });

  it("needs the Idempotency-Key header", async () => {
    const a = await app();
    const cookie = await signIn(a);
    const res = await run(a, cookie, null, { playspaceId: await board(a, cookie), nodeId: "n1" });
    expect(res.status).toBe(422);
    expect(res.body.field).toBe("Idempotency-Key");
  });

  it("offers the browser no way to release a lock", async () => {
    const a = await app();
    const cookie = await signIn(a);
    for (const [method, path] of [["delete", "/api/runs/job_x"], ["post", "/api/runs/job_x/release"], ["post", "/api/runs/release"]] as const) {
      const res = await request(a)[method](path).set("Origin", ORIGIN).set("Cookie", cookie);
      expect([404, 422]).toContain(res.status);
    }
  });

  it("needs a signed-in user, and is refused cross-site by the CSRF guard", async () => {
    const a = await app();
    expect((await request(a).post("/api/runs").set("Origin", ORIGIN).set("Idempotency-Key", "click-0012").send({})).status).toBe(401);
    const cookie = await signIn(a);
    const forged = await request(a).post("/api/runs").set("Origin", "https://evil.example.com").set("Cookie", cookie).set("Idempotency-Key", "click-0013").send({});
    expect(forged.status).toBe(403);
  });

  it("works for dev sign-in in opaque mode (a dev-only owner)", async () => {
    const a = await app({ GOOGLE_OAUTH_CLIENT_ID: "", AUTH_MODE: "dev" });
    const res = await request(a).post("/api/session/dev-sign-in").set("Origin", ORIGIN).send({ email: "dev@accenture.com" });
    const cookie = ([] as string[]).concat(res.headers["set-cookie"] ?? []).find((c) => c.startsWith("gcos_session="))!.split(";")[0];
    expect((await run(a, cookie, "click-0014", { playspaceId: await board(a, cookie), nodeId: "n1" })).status).toBe(202);
  });

  it("refuses Runs in jwt session mode, where sessions carry no owner key", async () => {
    const a = await app({ SESSION_MODE: "jwt" });
    const cookie = await signIn(a);
    const res = await run(a, cookie, "click-0015", { playspaceId: "ps_any", nodeId: "n1" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
  });
});
