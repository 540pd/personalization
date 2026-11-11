import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import type { Express } from "express";
import { DEV_ORIGINS } from "../../lib/allowedOrigins.js";

// What the browser sends through the proxy; the CSRF guard needs it on changes (#490).
const APP_ORIGIN = DEV_ORIGINS[0];

// The board saved to the user's account (#324): GET and PUT
// /api/boards/current, by revision, on the memory store.

const SECRET = "test-secret";

async function app(): Promise<Express> {
  vi.resetModules();
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-id");
  vi.stubEnv("SESSION_SECRET", SECRET);
  for (const k of ["FIRESTORE_PROJECT_ID", "GCS_BUCKET_NAME", "AUTH_MODE"]) vi.stubEnv(k, "");
  const { createApp } = await import("../../server.js");
  return createApp();
}

const as = (email: string) => `gcos_session=${jwt.sign({ email }, SECRET, { expiresIn: 3600 })}`;
const ANA = as("ana@accenture.com");
const BEN = as("ben@accenture.com");

const file = (extra: Record<string, unknown> = {}) => ({
  format: "gcos-playspace", version: 1, savedAt: "2026-10-21T00:00:00.000Z",
  panels: [], nodes: [{ className: "Rect", attrs: { id: "r1", x: 1 } }], frames: [], connections: [], topLayer: "canvas",
  ...extra,
});

const get = (a: Express, cookie = ANA) => request(a).get("/api/boards/current").set("Cookie", cookie);
const put = (a: Express, revision: unknown, content: unknown, cookie = ANA) =>
  request(a).put("/api/boards/current").set("Origin", APP_ORIGIN).set("Cookie", cookie).send({ revision, content });

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/boards/current", () => {
  it("makes the board on first ask, empty", async () => {
    const res = await get(await app());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ board: { name: "PlaySpace" }, revision: 0, updatedAt: null, content: null });
    expect(res.body.board.id).toMatch(/^board-[0-9a-f]{32}$/);
  });

  it("is the same board every time, and one board in the list", async () => {
    const a = await app();
    const [x, y] = await Promise.all([get(a), get(a)]);
    expect(x.body.board.id).toBe(y.body.board.id);
    expect((await request(a).get("/api/boards").set("Cookie", ANA)).body).toHaveLength(1);
  });
});

describe("PUT /api/boards/current", () => {
  it("saves, and the next read has it with its revision", async () => {
    const a = await app();
    const saved = await put(a, 0, file());
    expect(saved.status).toBe(200);
    expect(saved.body.revision).toBe(1);
    const res = await get(a);
    expect(res.body).toMatchObject({ revision: 1, content: file() });
    expect(res.body.updatedAt).toBe(saved.body.updatedAt);
  });

  it("answers 409 with the latest revision when another save landed first", async () => {
    const a = await app();
    await put(a, 0, file({ topLayer: "dom" }));
    const stale = await put(a, 0, file());
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ error: "conflict", revision: 1 });
    expect((await get(a)).body.content.topLayer).toBe("dom");
  });

  it("keeps each user's board apart", async () => {
    const a = await app();
    await put(a, 0, file({ topLayer: "dom" }));
    const ben = await get(a, BEN);
    expect(ben.body).toMatchObject({ revision: 0, content: null });
    expect(ben.body.board.id).not.toBe((await get(a)).body.board.id);
  });

  it("refuses what is not a board file, or a bad revision", async () => {
    const a = await app();
    const bad: Array<[unknown, unknown]> = [
      [-1, file()], [1.5, file()], ["0", file()], [undefined, file()],
      [0, null], [0, []], [0, file({ format: "other" })], [0, file({ version: 2 })],
      [0, file({ nodes: "x" })], [0, file({ frames: [1] })], [0, file({ topLayer: "top" })],
    ];
    for (const [revision, content] of bad) {
      const res = await put(a, revision, content);
      expect(res.status, JSON.stringify({ revision, content })).toBe(400);
    }
    expect((await get(a)).body.revision).toBe(0);
  });

  it("answers 413 for a board too large to keep", async () => {
    const res = await put(await app(), 0, file({ nodes: [{ className: "Image", imageUrl: "x".repeat(950 * 1024) }] }));
    expect(res.status).toBe(413);
    expect(res.body.error).toBe("too_large");
  });

  it("needs a signed-in user", async () => {
    expect((await put(await app(), 0, file(), "")).status).toBe(401);
  });
});

describe("DELETE /api/boards/:id", () => {
  it("takes the content with the board; the next read starts again", async () => {
    const a = await app();
    await put(a, 0, file());
    const { id } = (await get(a)).body.board;
    expect((await request(a).delete(`/api/boards/${id}`).set("Origin", APP_ORIGIN).set("Cookie", BEN)).status).toBe(204);
    expect((await get(a)).body.revision).toBe(1);
    await request(a).delete(`/api/boards/${id}`).set("Origin", APP_ORIGIN).set("Cookie", ANA);
    expect((await get(a)).body).toMatchObject({ revision: 0, content: null });
  });
});
