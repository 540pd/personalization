import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import type { Express } from "express";

// The asset routes (#323) on the memory store: upload, list, serve, delete,
// each scoped to the signed-in user.

const SECRET = "test-secret";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff]);

/** Auth on, so two users can be told apart; env is read on import. */
async function app(): Promise<Express> {
  vi.resetModules();
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-id");
  vi.stubEnv("SESSION_SECRET", SECRET);
  for (const k of ["FIRESTORE_PROJECT_ID", "GCS_BUCKET_NAME"]) vi.stubEnv(k, "");
  const { createApp } = await import("../../server.js");
  return createApp();
}

const as = (email: string) => `gcos_session=${jwt.sign({ email }, SECRET, { expiresIn: 3600 })}`;
const ANA = as("ana@accenture.com");
const BEN = as("ben@accenture.com");

const upload = (a: Express, cookie: string, body: Buffer = PNG, type = "image/png") =>
  request(a).post("/api/assets").set("Cookie", cookie).set("Content-Type", type).send(body);

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/assets", () => {
  it("stores the bytes and answers the asset's URL", async () => {
    const res = await upload(await app(), ANA);
    expect(res.status).toBe(201);
    // In memory: not durable, so the board keeps its own copy.
    expect(res.body).toMatchObject({ mimeType: "image/png", bytes: PNG.length, source: "upload", durable: false });
    expect(res.body.url).toBe(`/api/proxy/assets/${res.body.id}/content`);
    expect(res.body).not.toHaveProperty("userId");
  });

  it("refuses a type it does not store, SVG included", async () => {
    const a = await app();
    for (const type of ["image/svg+xml", "text/html", "application/octet-stream"]) {
      const res = await upload(a, ANA, Buffer.from("<svg/>"), type);
      expect(res.status).toBe(415);
      expect(res.body.error).toBe("unsupported_type");
    }
  });

  it("refuses an empty file", async () => {
    const res = await upload(await app(), ANA, Buffer.alloc(0));
    expect(res.status).toBe(400);
  });

  it("answers 413 over 25 MB, not 500", async () => {
    const res = await upload(await app(), ANA, Buffer.alloc(25 * 1024 * 1024 + 1));
    expect(res.status).toBe(413);
    expect(res.body.error).toBe("too_large");
  });

  it("needs a signed-in user", async () => {
    const res = await upload(await app(), "");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/assets/:id/content", () => {
  it("serves the bytes, cacheable for good", async () => {
    const a = await app();
    const { body: asset } = await upload(a, ANA);
    const res = await request(a).get(`/api/assets/${asset.id}/content`).set("Cookie", ANA).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(Buffer.compare(res.body as Buffer, PNG)).toBe(0);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["content-length"]).toBe(String(PNG.length));
    expect(res.headers["cache-control"]).toBe("private, max-age=31536000, immutable");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("answers 404 for another user's asset, as for a missing one", async () => {
    const a = await app();
    const { body: asset } = await upload(a, ANA);
    expect((await request(a).get(`/api/assets/${asset.id}/content`).set("Cookie", BEN)).status).toBe(404);
    expect((await request(a).get("/api/assets/no-such-id/content").set("Cookie", ANA)).status).toBe(404);
  });
});

describe("GET /api/assets and DELETE /api/assets/:id", () => {
  it("lists only the user's assets, newest first; delete removes one", async () => {
    const a = await app();
    const first = (await upload(a, ANA)).body;
    await new Promise((r) => setTimeout(r, 5));
    const second = (await upload(a, ANA)).body;
    await upload(a, BEN);

    const list = await request(a).get("/api/assets").set("Cookie", ANA);
    expect(list.body.map((x: { id: string }) => x.id)).toEqual([second.id, first.id]);

    // Ben's delete of Ana's asset does nothing.
    expect((await request(a).delete(`/api/assets/${first.id}`).set("Cookie", BEN)).status).toBe(204);
    expect((await request(a).get("/api/assets").set("Cookie", ANA)).body).toHaveLength(2);

    expect((await request(a).delete(`/api/assets/${first.id}`).set("Cookie", ANA)).status).toBe(204);
    const after = await request(a).get("/api/assets").set("Cookie", ANA);
    expect(after.body.map((x: { id: string }) => x.id)).toEqual([second.id]);
    expect((await request(a).get(`/api/assets/${first.id}/content`).set("Cookie", ANA)).status).toBe(404);
  });
});
