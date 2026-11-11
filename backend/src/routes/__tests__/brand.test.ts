import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import type { Express } from "express";
import { readBrief } from "../../services/brandService.js";
import { DEV_ORIGINS } from "../../lib/allowedOrigins.js";

// What the browser sends through the proxy; the CSRF guard needs it on changes (#490).
const APP_ORIGIN = DEV_ORIGINS[0];

// The Brand page saved to the account (#454): GET/PUT /api/brand by revision.

const SECRET = "test-secret";
const as = (email: string) => `gcos_session=${jwt.sign({ email }, SECRET, { expiresIn: 3600 })}`;
const ANA = as("ana@accenture.com");
const BEN = as("ben@accenture.com");

async function app(): Promise<Express> {
  vi.resetModules();
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-id");
  vi.stubEnv("SESSION_SECRET", SECRET);
  for (const k of ["FIRESTORE_PROJECT_ID", "GCS_BUCKET_NAME"]) vi.stubEnv(k, "");
  const { createApp } = await import("../../server.js");
  return createApp();
}

const BRAND = {
  homepageUrl: "",
  industry: "Sportswear",
  campaign: { name: "Urban Running 2026", tones: ["Bold"], mandatory: { product: true, logo: false, cta: true, legal: false }, ctaText: "Shop now", referenceIds: ["a1"] },
};

const put = (a: Express, revision: number, brand: unknown, cookie = ANA) => request(a).put("/api/brand").set("Origin", APP_ORIGIN).set("Cookie", cookie).send({ revision, brand });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("/api/brand", () => {
  it("is empty at revision 0 until saved", async () => {
    const res = await request(await app()).get("/api/brand").set("Cookie", ANA);
    expect(res.body).toEqual({ revision: 0, updatedAt: null, brand: { homepageUrl: "", industry: "", campaign: {} } });
  });

  it("saves and reads back, one revision per save", async () => {
    const a = await app();
    const first = await put(a, 0, BRAND);
    expect(first.status).toBe(200);
    expect(first.body.revision).toBe(1);
    const got = await request(a).get("/api/brand").set("Cookie", ANA);
    expect(got.body).toMatchObject({ revision: 1, brand: BRAND });
    expect((await put(a, 1, { ...BRAND, industry: "Running" })).body.revision).toBe(2);
  });

  it("refuses a save from an older revision: a second tab", async () => {
    const a = await app();
    await put(a, 0, BRAND);
    const late = await put(a, 0, { ...BRAND, industry: "Other" });
    expect(late.status).toBe(409);
    expect(late.body.revision).toBe(1);
    expect((await request(a).get("/api/brand").set("Cookie", ANA)).body.brand.industry).toBe("Sportswear");
  });

  it("keeps each user's brand to themselves", async () => {
    const a = await app();
    await put(a, 0, BRAND);
    expect((await request(a).get("/api/brand").set("Cookie", BEN)).body.revision).toBe(0);
  });

  it("refuses what is not a brand", async () => {
    const a = await app();
    for (const bad of [null, "x", { industry: 5 }, { industry: "x".repeat(201) }, { campaign: { tones: "Bold" } }, { campaign: { name: "x".repeat(4001) } }]) {
      expect((await put(a, 0, bad)).status, JSON.stringify(bad)?.slice(0, 50)).toBe(400);
    }
    expect((await request(a).put("/api/brand").set("Origin", APP_ORIGIN).set("Cookie", ANA).send({ revision: -1, brand: BRAND })).status).toBe(400);
  });

  it("needs a signed-in user", async () => {
    expect((await request(await app()).get("/api/brand")).status).toBe(401);
  });
});

describe("readBrief", () => {
  it("keeps the fields it knows, checked", () => {
    expect(readBrief({ name: "X", tones: ["Bold"], mandatory: { product: true } })).toEqual({
      name: "X", tones: ["Bold"], mandatory: { product: true, logo: false, cta: false, legal: false },
    });
    for (const bad of [3, [1], { name: 5 }, { tones: "Bold" }, { mandatory: { product: "on" } }, { referenceIds: [1] }, { dos: "x".repeat(4001) }]) {
      expect(typeof readBrief(bad), JSON.stringify(bad).slice(0, 40)).toBe("string");
    }
  });
});
