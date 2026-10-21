import { afterEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import { describeStorageModes, localDataDir, storageModes } from "../storageMode.js";

// Where data goes (#322, #333), per service, from env alone.

afterEach(() => vi.unstubAllEnvs());

function withEnv(env: Record<string, string>) {
  for (const k of ["FIRESTORE_PROJECT_ID", "FIRESTORE_EMULATOR_HOST", "GCS_BUCKET_NAME", "STORAGE_EMULATOR_HOST", "LOCAL_DATA_DIR", "K_SERVICE"]) {
    vi.stubEnv(k, env[k] ?? "");
  }
}

describe("storageModes", () => {
  it("memory with nothing set, in tests", () => {
    withEnv({});
    expect(storageModes()).toEqual({ firestore: "memory", storage: "memory" });
    expect(describeStorageModes()).toBe("Firestore: memory (lost on restart); Storage: memory (lost on restart)");
  });

  it("local disk with LOCAL_DATA_DIR, the placeholder for both", () => {
    withEnv({ LOCAL_DATA_DIR: "/tmp/gcos-data" });
    expect(storageModes()).toEqual({ firestore: "local", storage: "local" });
    expect(localDataDir()).toBe("/tmp/gcos-data");
    expect(describeStorageModes()).toBe("local disk at /tmp/gcos-data (placeholder)");
  });

  it("local disk by default outside tests, never when deployed; LOCAL_DATA_DIR=memory opts out", () => {
    withEnv({});
    vi.stubEnv("VITEST", "");
    expect(localDataDir()).toBe(path.resolve(".data"));
    vi.stubEnv("K_SERVICE", "gcos-backend");
    expect(localDataDir()).toBeNull();
    vi.stubEnv("K_SERVICE", "");
    vi.stubEnv("LOCAL_DATA_DIR", "memory");
    expect(localDataDir()).toBeNull();
  });

  it("GCP variables win over local disk", () => {
    withEnv({ FIRESTORE_PROJECT_ID: "gcos-prod", GCS_BUCKET_NAME: "gcos-assets", LOCAL_DATA_DIR: "/tmp/gcos-data" });
    expect(storageModes()).toEqual({ firestore: "gcp", storage: "gcp" });
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
    expect(describeStorageModes()).toBe("Firestore: GCP (gcos-prod); Storage: GCP (gcos-assets)");
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
