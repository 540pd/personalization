import { afterEach, describe, expect, it, vi } from "vitest";
import { describeStorageModes, storageModes } from "../storageMode.js";

// Where data goes (#322), per service, from env alone.

afterEach(() => vi.unstubAllEnvs());

function withEnv(env: Record<string, string>) {
  for (const k of ["FIRESTORE_PROJECT_ID", "FIRESTORE_EMULATOR_HOST", "GCS_BUCKET_NAME", "STORAGE_EMULATOR_HOST"]) {
    vi.stubEnv(k, env[k] ?? "");
  }
}

describe("storageModes", () => {
  it("memory with nothing set", () => {
    withEnv({});
    expect(storageModes()).toEqual({ firestore: "memory", storage: "memory" });
    expect(describeStorageModes()).toBe("[storage] Firestore: memory (lost on restart); Storage: memory (lost on restart)");
  });

  it("emulator when the project and the emulator host are set", () => {
    withEnv({
      FIRESTORE_PROJECT_ID: "demo-gcos",
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
      GCS_BUCKET_NAME: "demo-gcos.appspot.com",
      STORAGE_EMULATOR_HOST: "http://127.0.0.1:9199",
    });
    expect(storageModes()).toEqual({ firestore: "emulator", storage: "emulator" });
    expect(describeStorageModes()).toContain("Firestore: emulator at 127.0.0.1:8080 (demo-gcos)");
  });

  it("GCP with only the project and bucket", () => {
    withEnv({ FIRESTORE_PROJECT_ID: "gcos-prod", GCS_BUCKET_NAME: "gcos-assets" });
    expect(storageModes()).toEqual({ firestore: "gcp", storage: "gcp" });
    expect(describeStorageModes()).toBe("[storage] Firestore: GCP (gcos-prod); Storage: GCP (gcos-assets)");
  });

  it("an emulator host alone, with no project, is still memory", () => {
    withEnv({ FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", STORAGE_EMULATOR_HOST: "http://127.0.0.1:9199" });
    expect(storageModes()).toEqual({ firestore: "memory", storage: "memory" });
  });

  it("each service on its own", () => {
    withEnv({ FIRESTORE_PROJECT_ID: "gcos-prod" });
    expect(storageModes()).toEqual({ firestore: "gcp", storage: "memory" });
  });
});
