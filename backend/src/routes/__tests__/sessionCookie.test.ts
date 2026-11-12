import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import type { Express } from "express";

// The session cookie (#320): set on refresh, read by requireIdentity when no
// bearer token comes, renewed once old, cleared on sign-out.

const SECRET = "test-secret";
const DAY = 60 * 60 * 24;

// Google's verification, stubbed: "google:<email>" is a valid ID token for a
// Workspace account, with the claims a real one carries (#487).
vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    async verifyIdToken({ idToken }: { idToken: string }) {
      if (!idToken.startsWith("google:")) throw new Error("Wrong number of segments");
      const email = idToken.slice("google:".length);
      return {
        getPayload: () => ({
          iss: "https://accounts.google.com",
          sub: `sub-${email}`,
          exp: Math.floor(Date.now() / 1000) + 3600,
          email,
          email_verified: true,
          hd: email.split("@")[1],
        }),
      };
    }
  },
}));

/** A session JWT for `email`, issued `ageSeconds` ago. */
function session(email: string, ageSeconds = 0, ttl = 30 * DAY, secret = SECRET): string {
  const iat = Math.floor(Date.now() / 1000) - ageSeconds;
  return jwt.sign({ email, iat }, secret, { expiresIn: ttl });
}

const cookieOf = (res: request.Response): string | undefined =>
  ([] as string[]).concat(res.headers["set-cookie"] ?? []).find((c) => c.startsWith("gcos_session="));

/** The app with OAuth and sessions configured; env is read on import. */
async function app(env: Record<string, string> = {}): Promise<Express> {
  vi.resetModules();
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-id");
  vi.stubEnv("SESSION_SECRET", SECRET);
  vi.stubEnv("ALLOWED_EMAIL_DOMAINS", "accenture.com");
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const { createApp } = await import("../../server.js");
  return createApp();
}

// A gated route that answers who the request is.
const whoAmI = (a: Express) => request(a).get("/api/boards");

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/session/refresh", () => {
  it("sets the session cookie for a verified Google ID token", async () => {
    const res = await request(await app())
      .post("/api/session/refresh")
      .set("Authorization", "Bearer google:ana@accenture.com");

    expect(res.status).toBe(200);
    const cookie = cookieOf(res)!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=2592000/);
    expect(cookie).not.toMatch(/Secure/);
  });

  it("marks the cookie Secure in production", async () => {
    const res = await request(await app({ NODE_ENV: "production" }))
      .post("/api/session/refresh")
      .set("X-User-Identity", "Bearer google:ana@accenture.com");
    expect(cookieOf(res)).toMatch(/Secure/);
  });

  it("is not blocked by an expired cookie when a fresh token comes with it", async () => {
    const res = await request(await app())
      .post("/api/session/refresh")
      .set("Authorization", "Bearer google:ana@accenture.com")
      .set("Cookie", `gcos_session=${session("ana@accenture.com", 31 * DAY)}`);
    expect(res.status).toBe(200);
    expect(cookieOf(res)).toBeDefined();
  });
});

describe("requireIdentity with the session cookie", () => {
  it("identifies a request by its cookie alone", async () => {
    const res = await whoAmI(await app()).set("Cookie", `other=1; gcos_session=${session("ana@accenture.com")}`);
    expect(res.status).toBe(200);
  });

  it("does not renew a cookie younger than a day", async () => {
    const res = await whoAmI(await app()).set("Cookie", `gcos_session=${session("ana@accenture.com", DAY - 60)}`);
    expect(res.status).toBe(200);
    expect(cookieOf(res)).toBeUndefined();
  });

  it("renews a cookie older than a day", async () => {
    const res = await whoAmI(await app()).set("Cookie", `gcos_session=${session("ana@accenture.com", DAY + 60)}`);
    expect(res.status).toBe(200);
    const fresh = cookieOf(res)!.split(";")[0].slice("gcos_session=".length);
    const payload = jwt.verify(fresh, SECRET) as { email: string; iat: number };
    expect(payload.email).toBe("ana@accenture.com");
    expect(Date.now() / 1000 - payload.iat).toBeLessThan(60);
  });

  it("answers token_expired for an expired cookie", async () => {
    const res = await whoAmI(await app()).set("Cookie", `gcos_session=${session("ana@accenture.com", 31 * DAY)}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("token_expired");
  });

  it("answers token_missing for a cookie that is not ours", async () => {
    const res = await whoAmI(await app()).set("Cookie", `gcos_session=${session("ana@accenture.com", 0, 30 * DAY, "other")}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("token_missing");
  });

  it("answers token_missing with neither a bearer token nor the cookie", async () => {
    const res = await whoAmI(await app()).set("Cookie", "other=1");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("token_missing");
  });

  it("keeps the domain allowlist", async () => {
    const res = await whoAmI(await app()).set("Cookie", `gcos_session=${session("ana@gmail.com")}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("domain_not_allowed");
  });

  it("deployed, ignores Authorization (the infra token) and uses the cookie", async () => {
    const res = await whoAmI(await app({ K_SERVICE: "gcos-backend" }))
      .set("Authorization", "Bearer infra-oidc-token")
      .set("Cookie", `gcos_session=${session("ana@accenture.com")}`);
    expect(res.status).toBe(200);
  });

  it("locally, still accepts a bearer token in Authorization", async () => {
    const res = await whoAmI(await app()).set("Authorization", "Bearer google:ana@accenture.com");
    expect(res.status).toBe(200);
  });
});

describe("GET /api/session", () => {
  it("answers who the cookie is", async () => {
    const res = await request(await app()).get("/api/session").set("Cookie", `gcos_session=${session("ana@accenture.com")}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ email: "ana@accenture.com" });
  });

  it("answers 401 with no session", async () => {
    const res = await request(await app()).get("/api/session");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("token_missing");
  });
});

describe("POST /api/session/sign-out", () => {
  it("clears the cookie and answers 204, with or without a session", async () => {
    const a = await app();
    for (const cookie of [`gcos_session=${session("ana@accenture.com")}`, ""]) {
      const res = await request(a).post("/api/session/sign-out").set("Cookie", cookie);
      expect(res.status).toBe(204);
      const cleared = cookieOf(res)!;
      expect(cleared).toMatch(/^gcos_session=;/);
      expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
      expect(cleared).toMatch(/HttpOnly/);
    }
  });
});

describe("anonymous mode", () => {
  it("is unchanged: no token or cookie needed", async () => {
    vi.resetModules();
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("K_SERVICE", "");
    const { createApp } = await import("../../server.js");
    const res = await whoAmI(createApp());
    expect(res.status).toBe(200);
  });
});
