import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { runSmoke, type CheckResult } from "../smoke.js";

// The smoke test (#336) against a real backend on a random port, in each
// sign-in mode.

let server: Server | null = null;

/** A backend in `env`, listening; its base URL. */
async function backend(env: Record<string, string>): Promise<string> {
  vi.resetModules();
  // Local disk always: under the emulators (CI) their variables would win.
  for (const k of ["GOOGLE_OAUTH_CLIENT_ID", "SESSION_SECRET", "AUTH_MODE", "K_SERVICE", "VERTEX_PROJECT_ID",
    "FIRESTORE_PROJECT_ID", "FIRESTORE_EMULATOR_HOST", "GCS_BUCKET_NAME", "STORAGE_EMULATOR_HOST"]) vi.stubEnv(k, "");
  vi.stubEnv("LOCAL_DATA_DIR", mkdtempSync(path.join(tmpdir(), "gcos-smoke-")));
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const { createApp } = await import("../../server.js");
  server = createApp().listen(0);
  await new Promise((r) => server!.once("listening", r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const summary = (results: CheckResult[]) => Object.fromEntries(results.map((r) => [r.name, r.status]));

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(async () => {
  await new Promise((r) => (server ? server.close(r) : r(null)));
  server = null;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("runSmoke", () => {
  it("passes on the placeholders, anonymous, and reports the modes", async () => {
    const results = await runSmoke({ url: await backend({}), generate: true });
    expect(summary(results)).toEqual({
      health: "pass", "sign-in mode": "pass", session: "pass", assets: "pass", boards: "pass", generate: "pass",
    });
    expect(results[0].detail).toBe("sign-in=anonymous storage=local/local ai=placeholder jobs=in-process");
    expect(results.find((r) => r.name === "assets")!.detail).toContain("durable=true");
    expect(results.find((r) => r.name === "generate")!.detail).toBe("placeholder, stored as an asset");
  });

  it("signs in by itself in dev mode", async () => {
    const results = await runSmoke({ url: await backend({ AUTH_MODE: "dev" }), email: "smoke@accenture.com" });
    expect(results.find((r) => r.name === "session")!.detail).toBe("signed in as smoke@accenture.com");
    expect(summary(results)).toMatchObject({ assets: "pass", boards: "pass", generate: "skip" });
  });

  it("with Google and no cookie, says what it needs and skips the rest", async () => {
    const results = await runSmoke({ url: await backend({ GOOGLE_OAUTH_CLIENT_ID: "client", SESSION_SECRET: "s" }) });
    expect(summary(results)).toEqual({
      health: "pass", "sign-in mode": "pass", session: "skip", assets: "skip", boards: "skip", generate: "skip",
    });
    expect(results.find((r) => r.name === "session")!.detail).toMatch(/needs --cookie/);
  });

  it("fails a bad cookie, and does not touch the stores", async () => {
    const results = await runSmoke({ url: await backend({ GOOGLE_OAUTH_CLIENT_ID: "client", SESSION_SECRET: "s" }), cookie: "nonsense" });
    expect(summary(results)).toMatchObject({ session: "fail", assets: "skip", boards: "skip" });
  });

  it("fails at once when the backend cannot be reached", async () => {
    const results = await runSmoke({ url: "http://127.0.0.1:9" });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ name: "health", status: "fail" });
  });
});
