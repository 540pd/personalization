import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { DEV_ORIGINS } from "../../lib/allowedOrigins.js";

// What the browser sends through the proxy; the CSRF guard needs it on changes (#490).
const APP_ORIGIN = DEV_ORIGINS[0];

// Dev sign-in, the placeholder for Google (#334): any allowed email typed in
// gets the production session cookie, and from there it is the real path.

/** The app in `env`; auth mode and the session secret are read on import. */
async function app(env: Record<string, string>): Promise<Express> {
  vi.resetModules();
  for (const k of ["GOOGLE_OAUTH_CLIENT_ID", "SESSION_SECRET", "K_SERVICE"]) vi.stubEnv(k, "");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("ALLOWED_EMAIL_DOMAINS", "accenture.com");
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const { createApp } = await import("../../server.js");
  return createApp();
}

const cookieOf = (res: request.Response) =>
  ([] as string[]).concat(res.headers["set-cookie"] ?? []).find((c) => c.startsWith("gcos_session="));

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("AUTH_MODE=dev", () => {
  it("says so in auth-config", async () => {
    const res = await request(await app({ AUTH_MODE: "dev" })).get("/api/auth-config");
    expect(res.body).toEqual({ mode: "dev" });
  });

  it("signs in with a typed email; the cookie then works like production's", async () => {
    const a = await app({ AUTH_MODE: "dev" });
    const res = await request(a).post("/api/session/dev-sign-in").set("Origin", APP_ORIGIN).send({ email: " Dev.User@Accenture.com " });
    expect(res.status).toBe(200);
    const cookie = cookieOf(res)!;
    expect(cookie).toMatch(/HttpOnly/);

    const session = await request(a).get("/api/session").set("Cookie", cookie.split(";")[0]);
    expect(session.body).toEqual({ email: "dev.user@accenture.com" });
    const signOut = await request(a).post("/api/session/sign-out").set("Origin", APP_ORIGIN).set("Cookie", cookie.split(";")[0]);
    expect(cookieOf(signOut)).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it("works without SESSION_SECRET: one is made per start", async () => {
    const a = await app({ AUTH_MODE: "dev" });
    const res = await request(a).post("/api/session/dev-sign-in").set("Origin", APP_ORIGIN).send({ email: "dev.user@accenture.com" });
    expect(cookieOf(res)).toBeDefined();
  });

  it("keeps the domain allowlist, so the refused account can be seen", async () => {
    const res = await request(await app({ AUTH_MODE: "dev" })).post("/api/session/dev-sign-in").set("Origin", APP_ORIGIN).send({ email: "ana@gmail.com" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("domain_not_allowed");
  });

  it("refuses what is not an email", async () => {
    const a = await app({ AUTH_MODE: "dev" });
    for (const email of ["", "dev", "a@b", 42, undefined]) {
      expect((await request(a).post("/api/session/dev-sign-in").set("Origin", APP_ORIGIN).send({ email })).status).toBe(400);
    }
  });

  it("gates routes: no session is a 401, not anonymous", async () => {
    const res = await request(await app({ AUTH_MODE: "dev" })).get("/api/boards");
    expect(res.status).toBe(401);
  });

  it("never sends a bearer token to Google", async () => {
    const res = await request(await app({ AUTH_MODE: "dev" })).get("/api/boards").set("Authorization", "Bearer not-ours");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("token_invalid");
  });

  it("refuses to start when deployed", async () => {
    await expect(app({ AUTH_MODE: "dev", K_SERVICE: "gcos-backend" })).rejects.toThrow(/AUTH_MODE=dev/);
  });
});

describe("other modes", () => {
  it("have no dev sign-in route", async () => {
    const modes: Record<string, string>[] = [{}, { GOOGLE_OAUTH_CLIENT_ID: "client", SESSION_SECRET: "s" }];
    for (const env of modes) {
      const res = await request(await app(env)).post("/api/session/dev-sign-in").set("Origin", APP_ORIGIN).send({ email: "dev.user@accenture.com" });
      expect(res.status).toBe(404);
    }
  });
});
