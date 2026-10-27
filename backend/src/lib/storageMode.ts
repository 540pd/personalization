// Where the backend keeps its data (#322): in memory, in the local
// emulators, or in GCP -- per service, from env, so neither local dev nor CI
// needs a project or a key (CLAUDE.md non-negotiable 3).
//
//   Firestore  FIRESTORE_PROJECT_ID unset            → memory
//              … set, FIRESTORE_EMULATOR_HOST set    → emulator
//              … set                                 → gcp
//   Storage    GCS_BUCKET_NAME unset                 → memory
//              … set, STORAGE_EMULATOR_HOST set      → emulator
//              … set                                 → gcp
//
// The emulator variables are the client libraries' own: @google-cloud/
// firestore and @google-cloud/storage read them and skip credentials.

export type StorageMode = "memory" | "emulator" | "gcp";

export interface StorageModes {
  firestore: StorageMode;
  storage: StorageMode;
}

const env = (name: string) => process.env[name]?.trim() || undefined;

export function firestoreMode(): StorageMode {
  if (!env("FIRESTORE_PROJECT_ID")) return "memory";
  return env("FIRESTORE_EMULATOR_HOST") ? "emulator" : "gcp";
}

export function gcsMode(): StorageMode {
  if (!env("GCS_BUCKET_NAME")) return "memory";
  return env("STORAGE_EMULATOR_HOST") ? "emulator" : "gcp";
}

export function storageModes(): StorageModes {
  return { firestore: firestoreMode(), storage: gcsMode() };
}

/** One line at startup, so nobody wonders where their data went. */
export function describeStorageModes({ firestore, storage }: StorageModes = storageModes()): string {
  const where = (mode: StorageMode, target: string | undefined, host: string | undefined) =>
    mode === "memory" ? "memory (lost on restart)" : mode === "emulator" ? `emulator at ${host} (${target})` : `GCP (${target})`;
  return (
    `[storage] Firestore: ${where(firestore, env("FIRESTORE_PROJECT_ID"), env("FIRESTORE_EMULATOR_HOST"))}; ` +
    `Storage: ${where(storage, env("GCS_BUCKET_NAME"), env("STORAGE_EMULATOR_HOST"))}`
  );
}
