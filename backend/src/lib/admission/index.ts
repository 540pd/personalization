import { assetStore } from "../assets/index.js";
import { objectName } from "../assets/cloud.js";
import { boardStore } from "../boards/index.js";
import { jobStore } from "../jobs/index.js";
import { runLimits, type RunLimits } from "./limits.js";
import { verifyRun, type AdmissionDeps, type RunPrincipal, type RunVerification } from "./verifyRun.js";

export * from "./verifyRun.js";
export { readRunEnvelope, type RunEnvelope, type RunMode, type InlineSkill } from "./envelope.js";
export { DEFAULT_RUN_LIMITS, REFERENCE_MIME_TYPES, runLimits, type RunLimits } from "./limits.js";

// Today's stores behind admission's interfaces (#493). Every one is a
// PLACEHOLDER until its real source exists; each says what replaces it.

/**
 * PLACEHOLDER: admission against what the repo has today.
 * - Playspace: the board ID stands in (#492's playspaceIdFor) until the
 *   browser mints Playspace IDs; owned = the principal has that board.
 * - Assets: the asset store, by owner. Every stored asset counts as `ready`
 *   until uploads record a state (#374).
 * - Parent jobs: the job store, by owner. Jobs record no Playspace or node
 *   yet, so any parent is refused (fail closed) until they do.
 * - Skill revisions: no Agent Registry adapter yet (PACK PY-01, #495), so every
 *   revision ref is refused; today's inline Skill text passes, unpinned.
 * - Cost: allows everything and logs the Run's size; real limits come later.
 */
export function placeholderAdmissionDeps(): AdmissionDeps {
  return {
    async ownsPlayspace(principal, playspaceId) {
      return (await boardStore().get(playspaceId, principal.email)) !== null;
    },
    async getAsset(principal, assetId) {
      const asset = await assetStore().get(assetId, principal.email);
      if (!asset) return null;
      return {
        assetId: asset.id,
        mimeType: asset.mimeType,
        bytes: asset.bytes,
        state: "ready",
        storagePath: objectName(principal.email, asset.id),
      };
    },
    async getJob(principal, jobId) {
      const job = await jobStore().get(jobId, principal.email);
      if (!job) return null;
      return { jobId: job.id, state: job.status === "done" ? "finished" : job.status === "failed" ? "failed" : "running" };
    },
    async resolveSkillRevision() {
      return null;
    },
    async resolveInlineSkills(_principal, skills) {
      return skills.map((s) => ({ pinned: false as const, name: s.name, content: s.content }));
    },
    async checkCost(_principal, envelope) {
      console.log(
        `[admission] cost check (placeholder, allows all): count=${envelope.requestedCount} assets=${envelope.assetIds.length} skills=${envelope.skills.length + envelope.skillRevisionRefs.length}`
      );
      return { ok: true };
    },
  };
}

let _limits: RunLimits | null = null;

/** verifyRun on this process's placeholder deps and limits. */
export function verifyRunRequest(principal: RunPrincipal, body: unknown): Promise<RunVerification> {
  _limits ??= runLimits();
  return verifyRun(principal, body, placeholderAdmissionDeps(), _limits);
}
