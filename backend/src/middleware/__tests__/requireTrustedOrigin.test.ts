import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { originRefusal, requireTrustedOrigin } from "../requireTrustedOrigin.js";
import { allowedOrigins, asOrigin } from "../../lib/allowedOrigins.js";

// The CSRF Origin guard (#490, PACK NJS-04), on a bare app so only the guard
// decides: every route answers 200 once past it.

const APP = "https://app.example.com";
const COOKIE = "gcos_session=abc";

function app(allowed = [APP]) {
  const a = express();
  a.use(requireTrustedOrigin(allowed));
  a.all("*", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return a;
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("requireTrustedOrigin", () => {
  it.each(["post", "put", "patch", "delete"] as const)("lets a cookie %s from an allowed origin through", async (method) => {
    const res = await request(app())[method]("/api/boards/current").set("Cookie", COOKIE).set("Origin", APP);
    expect(res.status).toBe(200);
  });

  it.each(["post", "put", "patch", "delete"] as const)("refuses a cookie %s with no Origin", async (method) => {
    const res = await request(app())[method]("/api/boards/current").set("Cookie", COOKIE);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("origin_not_allowed");
  });

  it.each([
    ["null", "null"],
    ["another site", "https://evil.example.com"],
    ["a prefix trick", "https://app.example.com.evil.com"],
    ["a suffix trick", "https://evilapp.example.com"],
    ["plain HTTP", "http://app.example.com"],
    ["another port", "https://app.example.com:8443"],
    ["a path after the origin", "https://app.example.com/x"],
    ["a trailing slash", "https://app.example.com/"],
    ["not a URL", "app.example.com"],
    ["another scheme", "ftp://app.example.com"],
  ])("refuses a cookie POST from %s", async (_label, origin) => {
    const res = await request(app()).post("/api/assets").set("Cookie", COOKIE).set("Origin", origin);
    expect(res.status).toBe(403);
  });

  it("doesn't take Referer or X-Forwarded-Host in place of Origin", async () => {
    const res = await request(app())
      .post("/api/assets")
      .set("Cookie", COOKIE)
      .set("Referer", `${APP}/board`)
      .set("X-Forwarded-Host", "app.example.com")
      .set("X-Forwarded-Proto", "https");
    expect(res.status).toBe(403);
  });

  it("checks the session routes even without a cookie: sign-in, sign-out, dev sign-in", async () => {
    for (const path of ["/api/session/refresh", "/api/session/sign-out", "/api/session/dev-sign-in"]) {
      expect((await request(app()).post(path)).status).toBe(403);
      expect((await request(app()).post(path).set("Origin", APP)).status).toBe(200);
    }
  });

  it("leaves GET, HEAD and OPTIONS alone, cookie or not", async () => {
    const a = app();
    expect((await request(a).get("/api/boards").set("Cookie", COOKIE)).status).toBe(200);
    expect((await request(a).head("/api/boards").set("Cookie", COOKIE)).status).toBe(200);
    expect((await request(a).options("/api/boards").set("Cookie", COOKIE)).status).toBe(200);
    expect((await request(a).get("/api/session").set("Cookie", COOKIE)).status).toBe(200);
  });

  it("leaves a change with no session cookie alone outside the session routes (Bearer, or Cloud Tasks' own OIDC)", async () => {
    const a = app();
    expect((await request(a).post("/api/generate/image").set("Authorization", "Bearer token")).status).toBe(200);
    expect((await request(a).post("/internal/jobs/j1/run").set("Authorization", "Bearer oidc")).status).toBe(200);
    expect((await request(a).post("/api/assets").set("Cookie", "theme=dark")).status).toBe(200);
  });

  it("can't be skipped by a header claiming to be a service", async () => {
    const res = await request(app())
      .post("/api/assets")
      .set("Cookie", COOKIE)
      .set("X-User-Identity", "Bearer something")
      .set("Authorization", "Bearer infra-token");
    expect(res.status).toBe(403);
  });

  it("refuses everything when no origin is allowed", async () => {
    expect((await request(app([])).post("/api/assets").set("Cookie", COOKIE).set("Origin", APP)).status).toBe(403);
  });

  it("logs the method, path, origin and reason; never the cookie or the body", async () => {
    await request(app())
      .post("/api/assets")
      .set("Cookie", "gcos_session=very-secret-session")
      .set("Origin", "https://evil.example.com")
      .send({ secret: "body-secret" });
    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).toContain("POST /api/assets");
    expect(logged).toContain("https://evil.example.com");
    expect(logged).toContain("not allowed");
    expect(logged).not.toContain("very-secret-session");
    expect(logged).not.toContain("body-secret");
  });
});

describe("originRefusal", () => {
  it.each([
    [undefined, "missing"],
    ["", "missing"],
    ["null", "null"],
    ["https://app.example.com/", "malformed"],
    ["https://user@app.example.com", "malformed"],
    ["https://app.example.com?x=1", "malformed"],
    ["https://evil.example.com", "not allowed"],
    ["https://app.example.com", null],
    ["https://APP.example.com", null],
  ] as const)("%s → %s", (origin, expected) => {
    expect(originRefusal(origin, [APP])).toBe(expected);
  });
});

describe("allowedOrigins", () => {
  it("normalizes entries to bare origins and drops a default port", () => {
    expect(allowedOrigins({ ALLOWED_ORIGINS: "https://a.example.com/, https://b.example.com:443" }, true)).toEqual([
      "https://a.example.com",
      "https://b.example.com",
    ]);
  });

  it("falls back to the dev frontend locally, and to nothing when deployed", () => {
    expect(allowedOrigins({}, false)).toEqual(["http://localhost:3000", "http://127.0.0.1:3000"]);
    expect(allowedOrigins({}, true)).toEqual([]);
  });

  it("allows HTTP locally only", () => {
    expect(allowedOrigins({ ALLOWED_ORIGINS: "http://localhost:3100" }, false)).toEqual(["http://localhost:3100"]);
    expect(() => allowedOrigins({ ALLOWED_ORIGINS: "http://app.example.com" }, true)).toThrow(/HTTPS/);
  });

  it.each(["app.example.com", "https://app.example.com/board", "ftp://app.example.com"])("refuses to start with %s", (entry) => {
    expect(() => allowedOrigins({ ALLOWED_ORIGINS: entry }, false)).toThrow(/not an origin/);
  });

  it("reads K_SERVICE or NODE_ENV=production as deployed", () => {
    expect(() => allowedOrigins({ ALLOWED_ORIGINS: "http://x.example.com", K_SERVICE: "svc" })).toThrow(/HTTPS/);
    expect(() => allowedOrigins({ ALLOWED_ORIGINS: "http://x.example.com", NODE_ENV: "production" })).toThrow(/HTTPS/);
  });

  it("asOrigin keeps a non-default port", () => {
    expect(asOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  });
});
