import { readRunEnvelope, type InlineSkill, type RunEnvelope, type RunMode } from "./envelope.js";
import { REFERENCE_MIME_TYPES, type RunLimits } from "./limits.js";

// The Run admission verifier (#493, PACK NJS-07; docs/aryash rule 7). Before a
// Run goes anywhere, prove every Playspace, asset, Skill revision and parent
// job it names is the signed-in owner's and fit for this Run, and hand on only
// what was proven: an AuthorizedRunContext. NJS-05/06 (#491, #492) reserve it,
// NJS-08 (#494) sends it. Nothing from the browser reaches the context
// unchecked, and the owner comes only from the session.

/** Who is running: from the verified session (req.identity), never the body. */
export interface RunPrincipal {
  /** What stores are keyed by until the owner-key migration. */
  email: string;
  ownerKey?: string;
}

export type AssetState = "uploading" | "ready" | "failed";

/** An asset, as admission sees it. */
export interface AdmissionAsset {
  assetId: string;
  mimeType: string;
  bytes: number;
  state: AssetState;
  /** Where its bytes are, internally: resolved here, never taken from the browser. */
  storagePath: string;
}

export type ParentState = "finished" | "running" | "failed";

/** A parent job, as admission sees it. Unknown fields stay undefined. */
export interface AdmissionJob {
  jobId: string;
  state: ParentState;
  playspaceId?: string;
  nodeId?: string;
}

/** A Skill the Run will use. `pinned` is false for today's inline text. */
export type ResolvedSkill =
  | { pinned: true; revisionRef: string; contentSha256: string }
  | { pinned: false; name: string; content: string };

export interface AdmissionDeps {
  /** True when `playspaceId` is the principal's. */
  ownsPlayspace(principal: RunPrincipal, playspaceId: string): Promise<boolean>;
  /** The principal's asset, or null when it isn't theirs or doesn't exist. */
  getAsset(principal: RunPrincipal, assetId: string): Promise<AdmissionAsset | null>;
  /** The principal's job, or null when it isn't theirs or doesn't exist. */
  getJob(principal: RunPrincipal, jobId: string): Promise<AdmissionJob | null>;
  /** Registry revisions the principal may use, by ref; null for any it may not. */
  resolveSkillRevision(principal: RunPrincipal, revisionRef: string): Promise<ResolvedSkill | null>;
  /** Inline Skill text (today's), as unpinned Skills. */
  resolveInlineSkills(principal: RunPrincipal, skills: InlineSkill[]): Promise<ResolvedSkill[]>;
  /** Per-user and per-run cost limits; refuses with a reason. */
  checkCost(principal: RunPrincipal, envelope: RunEnvelope): Promise<{ ok: true } | { ok: false; message: string }>;
}

export interface AuthorizedRunContext {
  principal: RunPrincipal;
  playspaceId: string;
  nodeId: string;
  mode: RunMode;
  requestedCount: number;
  instruction?: string;
  assets: AdmissionAsset[];
  skills: ResolvedSkill[];
  /** Verified parents: the owner's, this Playspace's, finished. */
  parents: { jobId: string; nodeId: string }[];
}

export type RunDenial = {
  ok: false;
  status: 403 | 404 | 422 | 429 | 503;
  code: "validation_failed" | "resource_not_accessible" | "cost_limit" | "dependency_unavailable";
  message: string;
  /** Which request field: what the caller sent, so naming it reveals nothing new. */
  field?: string;
};

export type RunVerification = { ok: true; context: AuthorizedRunContext } | RunDenial;

const invalid = (field: string, message: string): RunDenial => ({ ok: false, status: 422, code: "validation_failed", message, field });

// One answer for "not yours" and "doesn't exist", so a denial never tells
// another user's resources from missing ones.
const notAccessible = (field: string): RunDenial => ({
  ok: false,
  status: 404,
  code: "resource_not_accessible",
  message: "Something this Run uses isn't available.",
  field,
});

/** Validates the body, then verifies everything it names. Fails closed. */
export async function verifyRun(principal: RunPrincipal, body: unknown, deps: AdmissionDeps, limits: RunLimits): Promise<RunVerification> {
  if (!principal?.email) return { ok: false, status: 403, code: "resource_not_accessible", message: "No signed-in owner." };
  const read = readRunEnvelope(body, limits);
  if (!read.ok) return invalid(read.field, read.message);
  const envelope = read.envelope;
  try {
    return await verify(principal, envelope, deps, limits);
  } catch {
    // A store we needed didn't answer: refuse rather than guess.
    return { ok: false, status: 503, code: "dependency_unavailable", message: "Run checks are unavailable right now. Try again shortly." };
  }
}

async function verify(principal: RunPrincipal, envelope: RunEnvelope, deps: AdmissionDeps, limits: RunLimits): Promise<RunVerification> {
  if (!(await deps.ownsPlayspace(principal, envelope.playspaceId))) return notAccessible("playspaceId");

  const assets: AdmissionAsset[] = [];
  for (const [i, assetId] of envelope.assetIds.entries()) {
    const field = `assetIds[${i}]`;
    const asset = await deps.getAsset(principal, assetId);
    if (!asset || asset.assetId !== assetId) return notAccessible(field);
    if (asset.state !== "ready") return invalid(field, "That reference image isn't ready yet.");
    if (!REFERENCE_MIME_TYPES.has(asset.mimeType)) return invalid(field, "A reference image must be PNG, JPEG or WebP.");
    if (asset.bytes > limits.maxAssetBytes) return invalid(field, `That reference image is over ${Math.floor(limits.maxAssetBytes / (1024 * 1024))} MiB.`);
    assets.push(asset);
  }

  const skills: ResolvedSkill[] = [];
  for (const [i, ref] of envelope.skillRevisionRefs.entries()) {
    const skill = await deps.resolveSkillRevision(principal, ref);
    if (!skill || !skill.pinned || skill.revisionRef !== ref) return notAccessible(`skillRevisionRefs[${i}]`);
    skills.push(skill);
  }
  if (envelope.skills.length) skills.push(...(await deps.resolveInlineSkills(principal, envelope.skills)));

  const parents: { jobId: string; nodeId: string }[] = [];
  for (const [i, jobId] of envelope.parentJobIds.entries()) {
    const field = `parentJobIds[${i}]`;
    const job = await deps.getJob(principal, jobId);
    // A parent must be provably this Playspace's; one we can't place is refused.
    if (!job || job.jobId !== jobId || !job.playspaceId || job.playspaceId !== envelope.playspaceId || !job.nodeId) return notAccessible(field);
    if (job.state !== "finished") return invalid(field, "A parent's run hasn't finished.");
    parents.push({ jobId, nodeId: job.nodeId });
  }

  // Lineage (docs/aryash 11_LLD_Context_Assembly.mmd): re-run takes its parents'
  // outputs, refine its own node's last output, nothing else.
  const own = parents.filter((p) => p.nodeId === envelope.nodeId);
  if (envelope.mode === "refine") {
    if (parents.length !== 1 || own.length !== 1) return invalid("parentJobIds", "Refine takes exactly one input: this node's own last output.");
  } else {
    if (own.length) return invalid(`parentJobIds[${envelope.parentJobIds.indexOf(own[0].jobId)}]`, "A node can't be its own parent.");
    if (envelope.mode === "rerun" && parents.length === 0) return invalid("parentJobIds", "Re-run takes its inputs from at least one parent.");
  }

  const cost = await deps.checkCost(principal, envelope);
  if (!cost.ok) return { ok: false, status: 429, code: "cost_limit", message: cost.message };

  return {
    ok: true,
    context: {
      principal: { email: principal.email, ...(principal.ownerKey ? { ownerKey: principal.ownerKey } : {}) },
      playspaceId: envelope.playspaceId,
      nodeId: envelope.nodeId,
      mode: envelope.mode,
      requestedCount: envelope.requestedCount,
      ...(envelope.instruction !== undefined ? { instruction: envelope.instruction } : {}),
      assets,
      skills,
      parents,
    },
  };
}
