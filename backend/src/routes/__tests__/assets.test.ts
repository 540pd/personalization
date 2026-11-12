import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import type { Express } from "express";
import { DEV_ORIGINS } from "../../lib/allowedOrigins.js";

// What the browser sends through the proxy; the CSRF guard needs it on changes (#490).
const APP_ORIGIN = DEV_ORIGINS[0];

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
  request(a).post("/api/assets").set("Origin", APP_ORIGIN).set("Cookie", cookie).set("Content-Type", type).send(body);

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
    expect((await request(a).delete(`/api/assets/${first.id}`).set("Origin", APP_ORIGIN).set("Cookie", BEN)).status).toBe(204);
    expect((await request(a).get("/api/assets").set("Cookie", ANA)).body).toHaveLength(2);

    expect((await request(a).delete(`/api/assets/${first.id}`).set("Origin", APP_ORIGIN).set("Cookie", ANA)).status).toBe(204);
    const after = await request(a).get("/api/assets").set("Cookie", ANA);
    expect(after.body.map((x: { id: string }) => x.id)).toEqual([second.id]);
    expect((await request(a).get(`/api/assets/${first.id}/content`).set("Cookie", ANA)).status).toBe(404);
  });
});

// What each asset is, for the Assets page (#412).
describe("asset kinds and details", () => {
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const uploadAs = (a: Express, query: string, body: Buffer = PNG, type = "image/png") =>
    request(a).post(`/api/assets?${query}`).set("Origin", APP_ORIGIN).set("Cookie", ANA).set("Content-Type", type).send(body);
  const patch = (a: Express, id: string, body: unknown, cookie = ANA) =>
    request(a).patch(`/api/assets/${id}`).set("Origin", APP_ORIGIN).set("Cookie", cookie).send(body as object);

  it("takes a kind and file name with the upload, and answers the info", async () => {
    const res = await uploadAs(await app(), "kind=productImage&name=" + encodeURIComponent("../shoes/side view.png"));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ kind: "productImage", name: "side view.png", description: "", details: {} });
  });

  it("answers empty info for an upload without any, as board uploads send", async () => {
    const res = await upload(await app(), ANA);
    expect(res.body).toMatchObject({ kind: null, name: "", description: "", details: {} });
  });

  it("refuses an unknown kind", async () => {
    const res = await uploadAs(await app(), "kind=font");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/kind must be one of/);
  });

  it("takes a logo only as a PNG", async () => {
    const a = await app();
    const jpeg = await uploadAs(a, "kind=logo", JPEG, "image/jpeg");
    expect(jpeg.status).toBe(415);
    expect(jpeg.body.message).toBe("The logo must be a PNG.");
    expect((await uploadAs(a, "kind=logo")).status).toBe(201);
    // A JPEG product image is fine.
    expect((await uploadAs(a, "kind=productImage", JPEG, "image/jpeg")).status).toBe(201);
  });

  it("lists one kind on request", async () => {
    const a = await app();
    const logo = (await uploadAs(a, "kind=logo")).body;
    await uploadAs(a, "kind=productImage");
    await upload(a, ANA);
    const res = await request(a).get("/api/assets?kind=logo").set("Cookie", ANA);
    expect(res.body.map((x: { id: string }) => x.id)).toEqual([logo.id]);
    expect((await request(a).get("/api/assets").set("Cookie", ANA)).body).toHaveLength(3);
    expect((await request(a).get("/api/assets?kind=nope").set("Cookie", ANA)).status).toBe(400);
  });

  it("updates the description and details, keeping the rest", async () => {
    const a = await app();
    const shoe = (await uploadAs(a, "kind=productImage&name=shoe.png")).body;
    const res = await patch(a, shoe.id, { description: "White trail shoe, side view", details: { imageType: "Packshot", view: "Side" } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: shoe.id, kind: "productImage", name: "shoe.png", description: "White trail shoe, side view", details: { imageType: "Packshot", view: "Side" } });
    const listed = (await request(a).get("/api/assets").set("Cookie", ANA)).body[0];
    expect(listed.details).toEqual({ imageType: "Packshot", view: "Side" });
  });

  it("refuses details that do not fit the kind, and bad descriptions", async () => {
    const a = await app();
    const shoe = (await uploadAs(a, "kind=productImage")).body;
    expect((await patch(a, shoe.id, { details: { usage: "By default" } })).status).toBe(400);
    expect((await patch(a, shoe.id, { details: { view: "Underneath" } })).status).toBe(400);
    expect((await patch(a, shoe.id, { description: 5 })).status).toBe(400);
    expect((await patch(a, shoe.id, { description: "x".repeat(2001) })).status).toBe(400);
    expect((await patch(a, shoe.id, { kind: "font" })).status).toBe(400);
    expect((await patch(a, shoe.id, [1])).status).toBe(400);
  });

  it("starts a new kind with no details, unless they come with it", async () => {
    const a = await app();
    const img = (await uploadAs(a, "kind=productImage")).body;
    await patch(a, img.id, { details: { view: "Side" } });
    const moved = await patch(a, img.id, { kind: "reference" });
    expect(moved.body).toMatchObject({ kind: "reference", details: {} });
    const withDetails = await patch(a, img.id, { kind: "styleExample", details: { exampleType: "Social creative" } });
    expect(withDetails.body).toMatchObject({ kind: "styleExample", details: { exampleType: "Social creative" } });
  });

  it("will not make a non-PNG into a logo", async () => {
    const a = await app();
    const jpeg = (await uploadAs(a, "kind=productImage", JPEG, "image/jpeg")).body;
    const res = await patch(a, jpeg.id, { kind: "logo" });
    expect(res.status).toBe(415);
    expect(res.body.message).toBe("The logo must be a PNG.");
  });

  it("is a 404 for another user's asset or none at all", async () => {
    const a = await app();
    const mine = (await uploadAs(a, "kind=logo")).body;
    expect((await patch(a, mine.id, { description: "theirs now" }, BEN)).status).toBe(404);
    expect((await patch(a, "no-such-id", { description: "x" })).status).toBe(404);
    const listed = (await request(a).get("/api/assets").set("Cookie", ANA)).body[0];
    expect(listed.description).toBe("");
  });
});
