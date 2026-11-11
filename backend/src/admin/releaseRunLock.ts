// npm run release-run-lock -- <ownerKey> <playspaceId> <jobId>
// Clears a Playspace lock whose job is gone (#492 placeholder, until a
// reconciler exists). Fenced like every release: it does nothing unless that
// job still holds the lock, and it marks the run failed. Server-side only: run
// it with the backend's environment (the same FIRESTORE_PROJECT_ID or
// LOCAL_DATA_DIR); no route can reach it.

import "dotenv/config";
import { runs } from "../lib/runs/index.js";

const [ownerKey, playspaceId, jobId] = process.argv.slice(2);
if (!ownerKey || !playspaceId || !jobId) {
  console.error("Usage: npm run release-run-lock -- <ownerKey> <playspaceId> <jobId>");
  process.exit(2);
}
const released = await runs().finishRun(ownerKey, playspaceId, jobId, "failed");
console.log(released ? `Released Playspace ${playspaceId} (job ${jobId} marked failed).` : `Nothing released: job ${jobId} doesn't hold Playspace ${playspaceId}.`);
process.exit(released ? 0 : 1);
