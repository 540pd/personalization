// What each service is running on (#333): a real one, or its placeholder
// while nobody has GCP or Google access. One summary for the startup log
// and /api/health, so whoever sets the GCP variables can see at a glance
// that each switch took -- and a deployed backend refuses placeholders.
// docs/switching-to-gcp.md is the checklist behind every "to switch" line.

import { getAuthMode } from "../middleware/requireIdentity.js";
import { describeStorageModes, isCloud, isDeployed, storageModes, type StorageModes } from "./storageMode.js";

export interface ServiceModes {
  auth: ReturnType<typeof getAuthMode>;
  storage: StorageModes;
  ai: "vertex" | "placeholder";
}

export function serviceModes(): ServiceModes {
  return {
    auth: getAuthMode(),
    storage: storageModes(),
    ai: process.env.VERTEX_PROJECT_ID?.trim() ? "vertex" : "placeholder",
  };
}

/** The startup summary: each service, and how to move it to GCP. */
export function describeServiceModes(modes: ServiceModes = serviceModes()): string {
  const cloud = isCloud(modes.storage.firestore) && isCloud(modes.storage.storage);
  const lines = [
    `sign-in: ${modes.auth === "required" ? "Google" : "anonymous (placeholder) -- to switch: GOOGLE_OAUTH_CLIENT_ID, SESSION_SECRET"}`,
    `storage: ${describeStorageModes(modes.storage)}${cloud ? "" : " -- to switch: FIRESTORE_PROJECT_ID, GCS_BUCKET_NAME"}`,
    `AI:      ${modes.ai === "vertex" ? "Vertex AI" : "offline placeholders -- to switch: VERTEX_PROJECT_ID"}`,
  ];
  return lines.map((l) => `  ${l}`).join("\n") + "\n  (docs/switching-to-gcp.md)";
}

/**
 * Throws when a deployed backend would run on a storage placeholder: data
 * on a Cloud Run instance's disk or in its memory is gone with the
 * instance. Placeholder AI is allowed (it costs nothing) but warned of.
 * Sign-in has its own refusal, in requireIdentity.
 */
export function assertDeployable(modes: ServiceModes = serviceModes()): void {
  if (!isDeployed()) return;
  const { firestore, storage } = modes.storage;
  if (!isCloud(firestore) || !isCloud(storage)) {
    throw new Error(
      `Refusing to start: deployed, but storage is not GCP (Firestore: ${firestore}, Storage: ${storage}). ` +
        "Set FIRESTORE_PROJECT_ID and GCS_BUCKET_NAME (docs/switching-to-gcp.md)."
    );
  }
  if (modes.ai === "placeholder") {
    console.warn("[startup] Deployed with placeholder AI images: set VERTEX_PROJECT_ID for Vertex AI.");
  }
}
