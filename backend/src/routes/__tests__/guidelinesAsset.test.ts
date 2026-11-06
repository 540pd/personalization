import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import type { Express } from "express";

// Brand guidelines as Markdown (#450): the `guidelines` kind, text/markdown
// for it and it only, 100 KB, UTF-8, served as text.

const SECRET = "test-secret";
const MD = Buffer.from("# Brand rules\n\n- Logo on light backgrounds only\n- Café blue #1A2B3C\n", "utf-8");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff]);

async function app(): Promise<Express> {
  vi.resetModules();
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-id");
  vi.stubEnv("SESSION_SECRET", SECRET);
  for (const k of ["FIRESTORE_PROJECT_ID", "GCS_BUCKET_NAME"]) vi.stubEnv(k, "");
  const { createApp } = await import("../../server.js");
  return createApp();
}

const ANA = `gcos_session=${jwt.sign({ email: "ana@accenture.com" }, SECRET, { expiresIn: 3600 })}`;

const upload = (a: Express, query: string, body: Buffer, type: string) =>
  request(a).post(`/api/assets${query}`).set("Cookie", ANA).set("Content-Type", type).send(body);

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("guidelines assets", () => {
  it("stores a Markdown file as guidelines and serves it back as UTF-8 text", async () => {
    const a = await app();
    const res = await upload(a, "?kind=guidelines&name=brand.md", MD, "text/markdown");
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ kind: "guidelines", mimeType: "text/markdown", name: "brand.md", bytes: MD.length });
    const content = await request(a).get(`/api/assets/${res.body.id}/content`).set("Cookie", ANA);
    expect(content.headers["content-type"]).toBe("text/markdown; charset=utf-8");
    expect(content.headers["x-content-type-options"]).toBe("nosniff");
    expect(content.text).toBe(MD.toString("utf-8"));
  });

  it("takes a title, a document type and a note", async () => {
    const a = await app();
    const { body } = await upload(a, "?kind=guidelines&name=brand.md", MD, "text/markdown");
    const ok = await request(a).patch(`/api/assets/${body.id}`).set("Cookie", ANA)
      .send({ details: { title: "Brand book", docType: "Logo Guidelines", note: "2026 edition" } });
    expect(ok.status).toBe(200);
    expect(ok.body.details).toEqual({ title: "Brand book", docType: "Logo Guidelines", note: "2026 edition" });
    const bad = await request(a).patch(`/api/assets/${body.id}`).set("Cookie", ANA).send({ details: { docType: "Poster" } });
    expect(bad.status).toBe(400);
  });

  it("keeps Markdown and guidelines together: neither without the other", async () => {
    const a = await app();
    expect((await upload(a, "", MD, "text/markdown")).status).toBe(415);
    expect((await upload(a, "?kind=reference&name=x.md", MD, "text/markdown")).status).toBe(415);
    expect((await upload(a, "?kind=guidelines&name=x.png", PNG, "image/png")).status).toBe(415);

    const { body } = await upload(a, "?kind=guidelines&name=brand.md", MD, "text/markdown");
    expect((await request(a).patch(`/api/assets/${body.id}`).set("Cookie", ANA).send({ kind: "logo" })).status).toBe(415);
  });

  it("refuses a file over 100 KB, and one that is not UTF-8 text", async () => {
    const a = await app();
    const big = Buffer.alloc(100 * 1024 + 1, "a");
    expect((await upload(a, "?kind=guidelines&name=big.md", big, "text/markdown")).status).toBe(413);
    expect((await upload(a, "?kind=guidelines&name=exactly.md", Buffer.alloc(100 * 1024, "a"), "text/markdown")).status).toBe(201);
    const latin1 = Buffer.from([0x43, 0x61, 0x66, 0xe9]);
    const res = await upload(a, "?kind=guidelines&name=old.md", latin1, "text/markdown");
    expect(res.status).toBe(415);
    expect(res.body.message).toBe("This file isn't plain text.");
  });

  it("joins the saved Assets page", async () => {
    const a = await app();
    const { body } = await upload(a, "?kind=guidelines&name=brand.md", MD, "text/markdown");
    const current = await request(a).get("/api/brand-assets").set("Cookie", ANA);
    const put = await request(a).put("/api/brand-assets").set("Cookie", ANA).send({
      revision: current.body.revision, productName: "", sku: "", masterId: "",
      colours: { primary: "", secondary: "", accent: "" }, assetIds: [body.id],
    });
    expect(put.status).toBe(200);
    const saved = await request(a).get("/api/brand-assets").set("Cookie", ANA);
    expect(saved.body.assets.map((x: { kind: string }) => x.kind)).toEqual(["guidelines"]);
  });
});
