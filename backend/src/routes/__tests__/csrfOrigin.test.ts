import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import type { Express } from "express";

// The CSRF Origin guard in the real app (#490, PACK NJS-04): a signed-in
// browser tricked into a change by another site is refused before any route
// runs, so nothing changes; the app's own origin works as before.

const SECRET = "test-secret";
const APP = "http://localhost:3100";

async function app(): Promise<Express> {
  vi.resetModules();
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-id");
  vi.stubEnv("SESSION_SECRET", SECRET);
  vi.stubEnv("ALLOWED_ORIGINS", APP);
  for (const k of ["FIRESTORE_PROJECT_ID", "GCS_BUCKET_NAME", "AUTH_MODE"]) vi.stubEnv(k, "");
  const { createApp } = await import("../../server.js");
  return createApp();
}

const ANA = `gcos_session=${jwt.sign({ email: "ana@accenture.com" }, SECRET, { expiresIn: 3600 })}`;

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("CSRF Origin guard in the app", () => {
  it("refuses another site's cookie change with 403 and changes nothing", async () => {
    const a = await app();
    const forged = await request(a)
      .post("/api/boards")
      .set("Cookie", ANA)
      .set("Origin", "https://evil.example.com")
      .send({ name: "Planted" });
    expect(forged.status).toBe(403);
    expect(forged.body.error).toBe("origin_not_allowed");
    const boards = await request(a).get("/api/boards").set("Cookie", ANA);
    expect(boards.status).toBe(200);
    expect(boards.body.map((b: { name: string }) => b.name)).not.toContain("Planted");
  });

  it("lets the same change through from ALLOWED_ORIGINS", async () => {
    const a = await app();
    const made = await request(a).post("/api/boards").set("Cookie", ANA).set("Origin", APP).send({ name: "Mine" });
    expect(made.status).toBe(201);
  });

  it("refuses a sign-out from another site, so it can't sign the user out", async () => {
    const res = await request(await app()).post("/api/session/sign-out").set("Cookie", ANA).set("Origin", "https://evil.example.com");
    expect(res.status).toBe(403);
    expect(([] as string[]).concat(res.headers["set-cookie"] ?? [])).toEqual([]);
  });

  it("answers a cross-site change before authentication, so it reveals nothing about the session", async () => {
    const res = await request(await app()).put("/api/brand").set("Cookie", "gcos_session=not-a-session").set("Origin", "https://evil.example.com");
    expect(res.status).toBe(403);
  });
});
