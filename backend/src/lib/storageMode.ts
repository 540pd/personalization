// Where the backend keeps its data (#322, #333): in GCP, in the local
// emulators, on local disk, or in memory -- per service, from env alone, so
// moving to GCP is setting variables, never changing code.
//
//   Firestore  FIRESTORE_PROJECT_ID set, FIRESTORE_EMULATOR_HOST set  → emulator
//              FIRESTORE_PROJECT_ID set                               → gcp
//   Storage    GCS_BUCKET_NAME set, STORAGE_EMULATOR_HOST set         → emulator
//              GCS_BUCKET_NAME set                                    → gcp
//   either,    otherwise: local disk in local dev (LOCAL_DATA_DIR,    → local
//   unset      default backend/.data), memory in tests or with        → memory
//              LOCAL_DATA_DIR=memory
//
// The emulator variables are the client libraries' own: @google-cloud/
// firestore and @google-cloud/storage read them and skip credentials.

import path from "node:path";

export type StorageMode = "memory" | "local" | "emulator" | "gcp";

export interface StorageModes {
  firestore: StorageMode;
  storage: StorageMode;
}

const env = (name: string) => process.env[name]?.trim() || undefined;

/** Cloud Run sets K_SERVICE; a production build sets NODE_ENV. */
export const isDeployed = () => process.env.NODE_ENV === "production" || !!env("K_SERVICE");

/**
 * Where local-disk mode keeps its files, or null for memory. Tests get
 * memory unless they ask (vitest sets VITEST), so a run never reads or
 * leaves files; a deployed backend gets memory, which it then refuses.
 */
export function localDataDir(): string | null {
  const dir = env("LOCAL_DATA_DIR");
  if (dir === "memory") return null;
  if (dir) return path.resolve(dir);
  if (process.env.VITEST || isDeployed()) return null;
  return path.resolve(".data");
}

const fallback = (): StorageMode => (localDataDir() ? "local" : "memory");

export function firestoreMode(): StorageMode {
  if (!env("FIRESTORE_PROJECT_ID")) return fallback();
  return env("FIRESTORE_EMULATOR_HOST") ? "emulator" : "gcp";
}

export function gcsMode(): StorageMode {
  if (!env("GCS_BUCKET_NAME")) return fallback();
  return env("STORAGE_EMULATOR_HOST") ? "emulator" : "gcp";
}

export function storageModes(): StorageModes {
  return { firestore: firestoreMode(), storage: gcsMode() };
}

/** The cloud stores: real or emulated Firestore and Cloud Storage. */
export const isCloud = (mode: StorageMode) => mode === "gcp" || mode === "emulator";

/** One line for the startup summary, so nobody wonders where their data went. */
export function describeStorageModes({ firestore, storage }: StorageModes = storageModes()): string {
  const where = (mode: StorageMode, target: string | undefined, host: string | undefined) => {
    if (mode === "memory") return "memory (lost on restart)";
    if (mode === "local") return `local disk at ${localDataDir()} (placeholder)`;
    return mode === "emulator" ? `emulator at ${host} (${target})` : `GCP (${target})`;
  };
  // Both on the placeholder (the usual local case): say it once.
  if (firestore === "local" && storage === "local") return `local disk at ${localDataDir()} (placeholder)`;
  return (
    `Firestore: ${where(firestore, env("FIRESTORE_PROJECT_ID"), env("FIRESTORE_EMULATOR_HOST"))}; ` +
    `Storage: ${where(storage, env("GCS_BUCKET_NAME"), env("STORAGE_EMULATOR_HOST"))}`
  );
}

// ── One store per process, by storage mode (#534) ──

/** How a store is made in each mode. `firestore` covers real and emulated Firestore. */
export interface StoreBackends<T> {
  firestore: () => T;
  local: (dir: string) => T;
  memory: () => T;
}

const resets = new Set<() => void>();

/**
 * The store for this process's storage mode, made on first use and kept:
 * Firestore when FIRESTORE_PROJECT_ID is set, else local disk, else memory.
 * Returns the getter a module exports.
 */
export function storeFor<T>(backends: StoreBackends<T>): () => T {
  let store: T | null = null;
  resets.add(() => {
    store = null;
  });
  return () => {
    if (store === null) {
      const dir = localDataDir();
      store = isCloud(firestoreMode()) ? backends.firestore() : dir ? backends.local(dir) : backends.memory();
    }
    return store;
  };
}

/** Tests only: forget every store made by storeFor, so the next use picks again. */
export function resetStoresForTests(): void {
  resets.forEach((reset) => reset());
}
