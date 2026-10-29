import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import type { Express } from "express";

// The saved Assets page (#413) on the memory stores: load, save by
// revision, validation, detaching on save and clearing unsaved uploads.

const SECRET = "test-secret";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff]);

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

const upload = async (a: Express, kind?: string, cookie = ANA): Promise<string> => {
  const res = await request(a).post(`/api/assets${kind ? `?kind=${kind}` : ""}`).set("Cookie", cookie).set("Content-Type", "image/png").send(PNG);
  return res.body.id;
};
const page = (over: Record<string, unknown> = {}) => ({
  revision: 0,
  productName: "Trail running shoe",
  sku: "TRS-001",
  masterId: "",
  colours: { primary: "#111111", secondary: "", accent: "" },
  assetIds: [],
  ...over,
});
const put = (a: Express, body: unknown, cookie = ANA) => request(a).put("/api/brand-assets").set("Cookie", cookie).send(body as object);
const get = (a: Express, cookie = ANA) => request(a).get("/api/brand-assets").set("Cookie", cookie);
const ids = async (a: Express, cookie = ANA) => (await request(a).get("/api/assets").set("Cookie", cookie)).body.map((x: { id: string }) => x.id);

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET and PUT /api/brand-assets", () => {
  it("starts empty at revision 0", async () => {
    const res = await get(await app());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      revision: 0,
      updatedAt: null,
      record: { productName: "", sku: "", masterId: "", colours: { primary: "", secondary: "", accent: "" }, assetIds: [] },
      assets: [],
    });
  });

  it("saves the page and loads it back with its assets, in order", async () => {
    const a = await app();
    const side = await upload(a, "productImage");
    const logo = await upload(a, "logo");
    const saved = await put(a, page({ masterId: side, assetIds: [logo, side], colours: { primary: "#111111", secondary: "#ffffff", accent: "" } }));
    expect(saved.status).toBe(200);
    expect(saved.body.revision).toBe(1);
    const res = await get(a);
    expect(res.body.revision).toBe(1);
    expect(res.body.record).toMatchObject({ productName: "Trail running shoe", sku: "TRS-001", masterId: side, assetIds: [logo, side] });
    // Hex is stored in capitals.
    expect(res.body.record.colours).toEqual({ primary: "#111111", secondary: "#FFFFFF", accent: "" });
    expect(res.body.assets.map((x: { id: string; kind: string }) => [x.id, x.kind])).toEqual([[logo, "logo"], [side, "productImage"]]);
  });

  it("saves a partial page: the master and product name are the page's to require", async () => {
    const res = await put(await app(), page({ productName: "", masterId: "" }));
    expect(res.status).toBe(200);
  });

  it("refuses a stale revision with 409 and the latest", async () => {
    const a = await app();
    await put(a, page());
    await put(a, page({ revision: 1, sku: "B" }));
    const stale = await put(a, page({ revision: 1, sku: "C" }));
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ error: "conflict", revision: 2 });
    expect((await get(a)).body.record.sku).toBe("B");
  });

  it("checks the shape: revision, text, hex, ids", async () => {
    const a = await app();
    for (const body of [
      page({ revision: -1 }),
      page({ revision: "1" }),
      page({ productName: 5 }),
      page({ productName: "x".repeat(201) }),
      page({ colours: { primary: "red" } }),
      page({ colours: "#111111" }),
      page({ assetIds: "a" }),
      page({ assetIds: ["a", "a"] }),
      [1],
    ]) {
      expect((await put(a, body)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it("checks the assets: the user's own, with a kind, and a product image as master", async () => {
    const a = await app();
    const side = await upload(a, "productImage");
    const logo = await upload(a, "logo");
    const plain = await upload(a);
    const bens = await upload(a, "productImage", BEN);
    const problem = async (body: Record<string, unknown>) => (await put(a, page(body))).body.message as string;
    expect(await problem({ assetIds: [bens] })).toMatch(/not found/);
    expect(await problem({ assetIds: ["no-such-id"] })).toMatch(/not found/);
    expect(await problem({ assetIds: [plain] })).toMatch(/no kind/);
    expect(await problem({ assetIds: [side], masterId: logo })).toMatch(/one of the page's assets/);
    expect(await problem({ assetIds: [side, logo], masterId: logo })).toMatch(/must be a product image/);
    expect((await get(a)).body.revision).toBe(0);
  });

  it("deletes an asset taken off the page when saved, never a board upload", async () => {
    const a = await app();
    const side = await upload(a, "productImage");
    const back = await upload(a, "productImage");
    const plain = await upload(a);
    await put(a, page({ masterId: side, assetIds: [side, back] }));
    await put(a, page({ revision: 1, masterId: side, assetIds: [side] }));
    expect(await ids(a)).not.toContain(back);
    expect(await ids(a)).toEqual(expect.arrayContaining([side, plain]));
  });

  it("is each user's own", async () => {
    const a = await app();
    await put(a, page({ productName: "Ana's" }));
    expect((await get(a, BEN)).body.revision).toBe(0);
    expect((await request(a).get("/api/brand-assets")).status).toBe(401);
  });
});

describe("DELETE /api/brand-assets/pending", () => {
  it("removes the page's unsaved uploads only", async () => {
    const a = await app();
    const saved = await upload(a, "productImage");
    await put(a, page({ masterId: saved, assetIds: [saved] }));
    const pendingLogo = await upload(a, "logo");
    const pendingRef = await upload(a, "reference");
    const boardUpload = await upload(a);
    const bensPending = await upload(a, "logo", BEN);

    const res = await request(a).delete("/api/brand-assets/pending").set("Cookie", ANA);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: 2 });
    const left = await ids(a);
    expect(left).toEqual(expect.arrayContaining([saved, boardUpload]));
    expect(left).not.toContain(pendingLogo);
    expect(left).not.toContain(pendingRef);
    expect(await ids(a, BEN)).toEqual([bensPending]);
  });
});
