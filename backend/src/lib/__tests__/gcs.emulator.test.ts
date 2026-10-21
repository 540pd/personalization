import { describe, expect, it } from "vitest";
import request from "supertest";
import { getBucket } from "../gcs.js";
import { createApp } from "../../server.js";

// Cloud Storage against its emulator (#322): the client reaches it with no
// credentials, and /api/health probes both stores. Skipped without it; run
// by `npm run test:emulators` and CI.

const EMULATED = !!process.env.STORAGE_EMULATOR_HOST && !!process.env.GCS_BUCKET_NAME;

describe.skipIf(!EMULATED)("Cloud Storage emulator", () => {
  it("writes, reads and deletes a file", async () => {
    const file = getBucket().file(`tests/${Date.now()}.txt`);
    await file.save("hello", { contentType: "text/plain" });
    const [bytes] = await file.download();
    expect(bytes.toString()).toBe("hello");
    await file.delete();
    const [exists] = await file.exists();
    expect(exists).toBe(false);
  });

  it("/api/health is ok with both stores up", async () => {
    const res = await request(createApp()).get("/api/health");
    expect(res.body).toMatchObject({ ok: true, storage: "ok" });
    expect(res.status).toBe(200);
  });
});
