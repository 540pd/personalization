import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import type { Express } from "express";
import { DEV_ORIGINS } from "../../lib/allowedOrigins.js";

// Opaque, revocable sessions through the real routes (#489, PACK NJS-03):
// SESSION_MODE=opaque, Google stubbed, memory storage.

const APP_ORIGIN = DEV_ORIGINS[0];

// "claims:<json>" is a valid Workspace token with <json> laid over its claims.
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

const google = (over: Record<string, unknown> = {}) => `Bearer claims:${JSON.stringify(over)}`;
const DAY = 864e5;

async function app(env: Record<string, string> = {}): Promise<Express> {
  vi.resetModules();
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-id");
  vi.stubEnv("SESSION_MODE", "opaque");
  vi.stubEnv("SESSION_SECRET", "jwt-secret-for-the-old-cookie-test");
  vi.stubEnv("ALLOWED_EMAIL_DOMAINS", "accenture.com");
  vi.stubEnv("ALLOWED_HOSTED_DOMAINS", undefined);
  for (const k of ["AUTH_MODE", "FIRESTORE_PROJECT_ID", "GCS_BUCKET_NAME", "SESSION_IDLE_SECONDS", "SESSION_ABSOLUTE_SECONDS"]) vi.stubEnv(k, "");
  vi.stubEnv("LOCAL_DATA_DIR", "memory");
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const { createApp } = await import("../../server.js");
  return createApp();
}

const cookieHeader = (res: request.Response) =>
  ([] as string[]).concat(res.headers["set-cookie"] ?? []).find((c) => c.startsWith("gcos_session="));
const cookieOf = (res: request.Response) => cookieHeader(res)!.split(";")[0];
const idOf = (res: request.Response) => cookieOf(res).slice("gcos_session=".length);

const signIn = (a: Express, auth = google()) => request(a).post("/api/session/refresh").set("Origin", APP_ORIGIN).set("Authorization", auth);
const who = (a: Express, cookie: string) => request(a).get("/api/session").set("Cookie", cookie);

beforeEach(() => {
  for (const level of ["log", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("SESSION_MODE=opaque", () => {
  it("signs in with a Google token: a random session ID in an HttpOnly, host-only cookie, and nothing in the body", async () => {
    const res = await signIn(await app());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers["cache-control"]).toBe("no-store");
    const header = cookieHeader(res)!;
    expect(idOf(res)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(header).toMatch(/HttpOnly/);
    expect(header).toMatch(/SameSite=Lax/);
    expect(header).toMatch(/Max-Age=2592000/);
    expect(header).not.toMatch(/Domain=/i);
    expect(idOf(res).split(".")).toHaveLength(1); // not a JWT
  });

  it("marks the cookie Secure when deployed", async () => {
    const a = await app({ NODE_ENV: "production", ALLOWED_ORIGINS: "https://app.example.com", IDENTITY_LINK_HMAC_KEY: "ab".repeat(32) });
    const res = await request(a).post("/api/session/refresh").set("Origin", "https://app.example.com").set("X-User-Identity", google());
    expect(cookieHeader(res)).toMatch(/Secure/);
  });

  it("stores only the SHA-256 hash of the session ID, with the owner key", async () => {
    const a = await app();
    const id = idOf(await signIn(a));
    const { sessionStore, hashSessionId } = await import("../../lib/sessions/index.js");
    expect(await sessionStore().get(id)).toBeNull();
    const stored = await sessionStore().get(hashSessionId(id));
    expect(stored).toMatchObject({ email: "ana@accenture.com", revokedAt: null });
    expect(stored!.ownerKey).toMatch(/^usr_/);
    expect(JSON.stringify(stored)).not.toContain(id);
  });

  it("identifies later requests by the cookie alone, with no-store and no owner key in the answer", async () => {
    const a = await app();
    const res = await who(a, cookieOf(await signIn(a)));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ email: "ana@accenture.com" });
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(JSON.stringify(res.body)).not.toMatch(/usr_/);
  });

  it("doesn't take a Google token anywhere but sign-in", async () => {
    const a = await app();
    const res = await request(a).get("/api/boards").set("Authorization", google());
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("token_missing");
  });

  it("uses the cookie when a page still sends a Google token alongside it", async () => {
    const a = await app();
    const cookie = cookieOf(await signIn(a));
    const res = await request(a).get("/api/session").set("Cookie", cookie).set("Authorization", google({ email: "other@accenture.com", sub: "sub-other" }));
    expect(res.body.email).toBe("ana@accenture.com");
  });

  it("signs out: the server record is revoked, the cookie cleared, and a replay refused", async () => {
    const a = await app();
    const cookie = cookieOf(await signIn(a));
    const out = await request(a).post("/api/session/sign-out").set("Origin", APP_ORIGIN).set("Cookie", cookie);
    expect(out.status).toBe(204);
    expect(cookieHeader(out)).toMatch(/gcos_session=;/);
    const replay = await who(a, cookie);
    expect(replay.status).toBe(401);
    expect(replay.body.error).toBe("token_missing");
  });

  it("revokes on sign-out even after the session has expired", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() });
    const a = await app();
    const res = await signIn(a);
    vi.setSystemTime(Date.now() + 31 * DAY);
    await request(a).post("/api/session/sign-out").set("Origin", APP_ORIGIN).set("Cookie", cookieOf(res));
    const { sessionStore, hashSessionId } = await import("../../lib/sessions/index.js");
    expect((await sessionStore().get(hashSessionId(idOf(res))))!.revokedAt).not.toBeNull();
  });

  it("answers token_expired once the session idles out", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() });
    const a = await app({ SESSION_IDLE_SECONDS: "3600", SESSION_ABSOLUTE_SECONDS: "7200" });
    const cookie = cookieOf(await signIn(a));
    vi.setSystemTime(Date.now() + 3600_000);
    const res = await who(a, cookie);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("token_expired");
  });

  it("keeps a session in use alive, then ends it at the absolute deadline anyway", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() });
    const a = await app({ SESSION_IDLE_SECONDS: "3600", SESSION_ABSOLUTE_SECONDS: "7200" });
    const cookie = cookieOf(await signIn(a));
    const start = Date.now();
    for (let t = 50; t < 120; t += 50) {
      vi.setSystemTime(start + t * 60_000);
      expect((await who(a, cookie)).status).toBe(200);
    }
    vi.setSystemTime(start + 7200_000);
    const res = await who(a, cookie);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("token_expired");
  });

  it("refuses at once, with 403, every session of an owner disabled on the server", async () => {
    const a = await app();
    const cookie = cookieOf(await signIn(a));
    const other = cookieOf(await signIn(a));
    expect((await who(a, cookie)).status).toBe(200);
    const { sessions, sessionStore, hashSessionId } = await import("../../lib/sessions/index.js");
    const ownerKey = (await sessionStore().get(hashSessionId(cookie.slice("gcos_session=".length))))!.ownerKey!;
    expect(await sessions().disableOwner(ownerKey)).toEqual({ revoked: 2 });
    for (const c of [cookie, other]) {
      const res = await who(a, c);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("account_disabled");
    }
    // And a fresh Google sign-in for that account is refused too.
    const again = await signIn(a);
    expect(again.status).toBe(403);
    expect(again.body.error).toBe("account_disabled");
    expect(cookieHeader(again)).toBeUndefined();
  });

  it("revokes the browser's old session when it signs in again", async () => {
    const a = await app();
    const first = cookieOf(await signIn(a));
    const second = await request(a).post("/api/session/refresh").set("Origin", APP_ORIGIN).set("Cookie", first).set("Authorization", google());
    expect(idOf(second)).not.toBe(first.slice("gcos_session=".length));
    expect((await who(a, first)).status).toBe(401);
    expect((await who(a, cookieOf(second))).status).toBe(200);
  });

  it("refuses an old JWT session cookie: switching modes signs everyone out once", async () => {
    const a = await app();
    const old = `gcos_session=${jwt.sign({ email: "ana@accenture.com" }, "jwt-secret-for-the-old-cookie-test", { expiresIn: 3600 })}`;
    const res = await who(a, old);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("token_missing");
  });

  it("answers 503 and sets no cookie when the session store can't create one", async () => {
    const a = await app();
    const { sessionStore } = await import("../../lib/sessions/index.js");
    vi.spyOn(sessionStore(), "create").mockRejectedValue(new Error("UNAVAILABLE"));
    const res = await signIn(a);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("dependency_unavailable");
    expect(cookieHeader(res)).toBeUndefined();
  });

  it("gives dev sign-in an opaque session too", async () => {
    const a = await app({ GOOGLE_OAUTH_CLIENT_ID: "", AUTH_MODE: "dev" });
    const res = await request(a).post("/api/session/dev-sign-in").set("Origin", APP_ORIGIN).send({ email: "dev@accenture.com" });
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(idOf(res)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await who(a, cookieOf(res))).body).toEqual({ email: "dev@accenture.com" });
  });

  it("refuses to start with a SESSION_MODE it doesn't know", async () => {
    await expect(app({ SESSION_MODE: "cookie" })).rejects.toThrow(/SESSION_MODE/);
  });
});

describe("SESSION_MODE=jwt (the default)", () => {
  it("still signs in with a 30-day JWT, now with no-store", async () => {
    const a = await app({ SESSION_MODE: "" });
    const res = await signIn(a);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(idOf(res).split(".")).toHaveLength(3);
  });
});
