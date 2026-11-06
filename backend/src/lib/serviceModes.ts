// What each service is running on (#333): a real one, or its placeholder
// while nobody has GCP or Google access. One summary for the startup log
// and /api/health, so whoever sets the GCP variables can see at a glance
// that each switch took -- and a deployed backend refuses placeholders.
// docs/switching-to-gcp.md is the checklist behind every "to switch" line.

import { getAuthMode } from "../middleware/requireIdentity.js";
import { isEphemeralSessionSecret } from "./sessionToken.js";
import { cloudTasksConfig } from "./jobs/cloudTasks.js";
import { supportMailConfig } from "./support/mailer.js";
import { describeStorageModes, isCloud, isDeployed, storageModes, type StorageModes } from "./storageMode.js";

export interface ServiceModes {
  auth: ReturnType<typeof getAuthMode>;
  storage: StorageModes;
  ai: "vertex" | "placeholder";
  /** Who runs video jobs (#325): Cloud Tasks, or this process. */
  jobs: "cloud-tasks" | "in-process";
  /** Where support messages go (#428): emailed, or only kept and logged. */
  supportEmail: "smtp" | "placeholder";
}

export function serviceModes(): ServiceModes {
  return {
    auth: getAuthMode(),
    storage: storageModes(),
    ai: process.env.VERTEX_PROJECT_ID?.trim() ? "vertex" : "placeholder",
    jobs: cloudTasksConfig() ? "cloud-tasks" : "in-process",
    supportEmail: supportMailConfig() ? "smtp" : "placeholder",
  };
}

function signIn(mode: ServiceModes["auth"]): string {
  if (mode === "required") return "Google";
  const toGoogle = "to switch: GOOGLE_OAUTH_CLIENT_ID, SESSION_SECRET";
  if (mode === "anonymous") return `anonymous (placeholder; AUTH_MODE=dev for dev sign-in) -- ${toGoogle}`;
  const ephemeral = isEphemeralSessionSecret() ? "; sessions end on restart, no SESSION_SECRET" : "";
  return `dev sign-in (placeholder${ephemeral}) -- ${toGoogle}, unset AUTH_MODE`;
}

/** The startup summary: each service, and how to move it to GCP. */
export function describeServiceModes(modes: ServiceModes = serviceModes()): string {
  const cloud = isCloud(modes.storage.firestore) && isCloud(modes.storage.storage);
  const lines = [
    `sign-in: ${signIn(modes.auth)}`,
    `storage: ${describeStorageModes(modes.storage)}${cloud ? "" : " -- to switch: FIRESTORE_PROJECT_ID, GCS_BUCKET_NAME"}`,
    `AI:      ${modes.ai === "vertex" ? "Vertex AI" : "offline placeholders -- to switch: VERTEX_PROJECT_ID"}`,
    `jobs:    ${modes.jobs === "cloud-tasks" ? "Cloud Tasks" : "in process (placeholder) -- to switch: CLOUD_TASKS_QUEUE, CLOUD_TASKS_SERVICE_ACCOUNT, JOBS_WORKER_URL"}`,
    `support: ${modes.supportEmail === "smtp" ? "emailed over SMTP" : "kept and logged, not emailed (placeholder) -- to switch: SUPPORT_EMAIL_TO, SUPPORT_EMAIL_FROM, SMTP_HOST"}`,
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
  // Cloud Run throttles a request's CPU once it has answered, so a job run
  // in process after its 202 stalls until it times out.
  if (modes.jobs === "in-process") {
    throw new Error(
      "Refusing to start: deployed, but video jobs would run in process. " +
        "Set CLOUD_TASKS_QUEUE, CLOUD_TASKS_SERVICE_ACCOUNT and JOBS_WORKER_URL (docs/switching-to-gcp.md)."
    );
  }
  if (modes.ai === "placeholder") {
    console.warn("[startup] Deployed with placeholder AI images: set VERTEX_PROJECT_ID for Vertex AI.");
  }
  if (modes.supportEmail === "placeholder") {
    console.warn("[startup] Deployed without support email: messages are kept, not emailed. Set SUPPORT_EMAIL_TO, SUPPORT_EMAIL_FROM and SMTP_HOST.");
  }
}
