import { afterEach, describe, expect, it, vi } from "vitest";
import { resetStoresForTests, storeFor } from "../storageMode.js";

// One helper picks every store by storage mode (#534).

const backends = () => {
  const made: string[] = [];
  return {
    made,
    pick: storeFor({
      firestore: () => (made.push("firestore"), { kind: "firestore" }),
      local: (dir: string) => (made.push(`local:${dir}`), { kind: "local", dir }),
      memory: () => (made.push("memory"), { kind: "memory" }),
    }),
  };
};

afterEach(() => {
  vi.unstubAllEnvs();
  resetStoresForTests();
});

describe("storeFor", () => {
  it("picks memory in tests by default", () => {
    vi.stubEnv("FIRESTORE_PROJECT_ID", "");
    vi.stubEnv("LOCAL_DATA_DIR", "");
    expect(backends().pick()).toEqual({ kind: "memory" });
  });

  it("picks local disk when LOCAL_DATA_DIR is set", () => {
    vi.stubEnv("FIRESTORE_PROJECT_ID", "");
    vi.stubEnv("LOCAL_DATA_DIR", "/tmp/gcos-data");
    expect(backends().pick()).toEqual({ kind: "local", dir: "/tmp/gcos-data" });
  });

  it("picks Firestore when FIRESTORE_PROJECT_ID is set, real or emulated", () => {
    vi.stubEnv("FIRESTORE_PROJECT_ID", "gcos-test");
    expect(backends().pick()).toEqual({ kind: "firestore" });
    resetStoresForTests();
    vi.stubEnv("FIRESTORE_EMULATOR_HOST", "localhost:8080");
    expect(backends().pick()).toEqual({ kind: "firestore" });
  });

  it("makes the store once and keeps it, until reset", () => {
    vi.stubEnv("FIRESTORE_PROJECT_ID", "");
    vi.stubEnv("LOCAL_DATA_DIR", "memory");
    const { pick, made } = backends();
    const first = pick();
    expect(pick()).toBe(first);
    vi.stubEnv("FIRESTORE_PROJECT_ID", "gcos-test"); // a later env change doesn't move a made store
    expect(pick()).toBe(first);
    expect(made).toEqual(["memory"]);
    resetStoresForTests();
    expect(pick()).toEqual({ kind: "firestore" });
    expect(made).toEqual(["memory", "firestore"]);
  });

  it("keeps each module's store apart", () => {
    vi.stubEnv("FIRESTORE_PROJECT_ID", "");
    vi.stubEnv("LOCAL_DATA_DIR", "memory");
    const a = backends();
    const b = backends();
    expect(a.pick()).not.toBe(b.pick());
  });
});

describe("the stores use it", () => {
  it("leaves no other storage-mode selection in src/lib", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const path = await import("node:path");
    const root = path.resolve(__dirname, "..");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
          if (name !== "__tests__") walk(full);
        } else if (full.endsWith(".ts")) files.push(full);
      }
    };
    walk(root);
    const offenders = files.filter((f) => /isFirestoreMode\(\)\s*\?/.test(readFileSync(f, "utf-8")));
    expect(offenders).toEqual([]);
  });
});
