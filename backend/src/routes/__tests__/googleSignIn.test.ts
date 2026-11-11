import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";

// Google sign-in through the real routes (#487, PACK NJS-01): only a token
// that passes every check gets a session, and nothing in the request or the
// logs can stand in for, or leak, what the token says.

// Google's verification, stubbed: "claims:<json>" is a token whose payload is
// a valid Workspace token's claims with <json> laid over them; "throw:<msg>"
// is one the library rejects with <msg>.
vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    async verifyIdToken({ idToken }: { idToken: string }) {
      if (idToken.startsWith("throw:")) throw new Error(idToken.slice("throw:".length));
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
}));

const token = (over: Record<string, unknown> = {}) => `claims:${JSON.stringify(over)}`;

/** The app with Google sign-in on. ALLOWED_HOSTED_DOMAINS stays unset (so it
 * defaults to ALLOWED_EMAIL_DOMAINS) unless `env` sets it. */
async function app(env: Record<string, string> = {}): Promise<Express> {
  vi.resetModules();
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-id");
  vi.stubEnv("SESSION_SECRET", "test-secret");
  vi.stubEnv("ALLOWED_EMAIL_DOMAINS", "accenture.com");
  vi.stubEnv("ALLOWED_HOSTED_DOMAINS", undefined);
  for (const k of ["AUTH_MODE", "GOOGLE_ID_TOKEN_CLOCK_SKEW_SECONDS", "FIRESTORE_PROJECT_ID", "GCS_BUCKET_NAME"]) vi.stubEnv(k, "");
  vi.stubEnv("LOCAL_DATA_DIR", "memory");
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const { createApp } = await import("../../server.js");
  return createApp();
}

/** Signs in with `idToken`; returns the response. */
const signIn = (a: Express, idToken: string) =>
  request(a).post("/api/session/refresh").set("Authorization", `Bearer ${idToken}`);

const sessionCookieOf = (res: request.Response) =>
  ([] as string[]).concat(res.headers["set-cookie"] ?? []).find((c) => c.startsWith("gcos_session="));

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Google sign-in", () => {
  it("signs in a verified Workspace account and sets the session cookie", async () => {
    const res = await signIn(await app(), token());
    expect(res.status).toBe(200);
    expect(sessionCookieOf(res)).toBeDefined();
  });

  it("refuses a personal account (no hd) with domain_not_allowed and sets no cookie", async () => {
    const res = await signIn(await app(), token({ hd: null, email: "ana@gmail.com" }));
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("domain_not_allowed");
    expect(sessionCookieOf(res)).toBeUndefined();
  });

  it("refuses an allowed email whose token has no hd", async () => {
    const res = await signIn(await app(), token({ hd: null }));
    expect(res.body.error).toBe("domain_not_allowed");
  });

  it("refuses an unverified email and sets no cookie", async () => {
    const res = await signIn(await app(), token({ email_verified: false }));
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("token_invalid");
    expect(sessionCookieOf(res)).toBeUndefined();
  });

  it("refuses a token the library rejects as expired with token_expired", async () => {
    const res = await signIn(await app(), "throw:Token used too late, 1 > 0");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("token_expired");
  });

  it("checks hd against ALLOWED_HOSTED_DOMAINS when it is set", async () => {
    const a = await app({ ALLOWED_HOSTED_DOMAINS: "corp.accenture.com", ALLOWED_EMAIL_DOMAINS: "accenture.com" });
    expect((await signIn(a, token())).body.error).toBe("domain_not_allowed");
    expect((await signIn(a, token({ hd: "corp.accenture.com" }))).status).toBe(200);
  });

  it("refuses every Google token when ALLOWED_HOSTED_DOMAINS is set to nothing", async () => {
    const res = await signIn(await app({ ALLOWED_HOSTED_DOMAINS: "" }), token());
    expect(res.body.error).toBe("domain_not_allowed");
  });

  it("ignores identity fields in the request body", async () => {
    const a = await app();
    const refused = await request(a)
      .post("/api/session/refresh")
      .set("Authorization", `Bearer ${token({ hd: null, email: "ana@gmail.com" })}`)
      .send({ email: "boss@accenture.com", sub: "sub-boss", owner_key: "owner-boss", hd: "accenture.com" });
    expect(refused.status).toBe(401);

    const signedIn = await request(a)
      .post("/api/session/refresh")
      .set("Authorization", `Bearer ${token()}`)
      .send({ email: "boss@accenture.com" });
    const cookie = sessionCookieOf(signedIn)!.split(";")[0];
    const who = await request(a).get("/api/session").set("Cookie", cookie);
    expect(who.body.email).toBe("ana@accenture.com");
  });

  it("logs the refusal code and reason only, never the token or its claims", async () => {
    const secret = token({ hd: null, email: "private.person@gmail.com", sub: "sub-secret-123" });
    await signIn(await app(), secret);
    const logged = errors.mock.calls.flat().join(" ");
    expect(logged).toContain("domain_not_allowed");
    for (const leak of ["private.person", "sub-secret-123", "claims:", "gmail.com"]) expect(logged).not.toContain(leak);
  });

  it("does not pass the library's error message on to the client", async () => {
    const res = await signIn(await app(), "throw:Failed to retrieve verification certificates: ECONNRESET");
    expect(res.body.error).toBe("token_invalid");
    expect(JSON.stringify(res.body)).not.toContain("ECONNRESET");
  });

  it("refuses to start with a clock skew it can't use", async () => {
    await expect(app({ GOOGLE_ID_TOKEN_CLOCK_SKEW_SECONDS: "900" })).rejects.toThrow(/CLOCK_SKEW/);
  });
});
