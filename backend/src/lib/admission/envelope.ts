import type { RunLimits } from "./limits.js";

// The Run envelope (#493; docs/aryash 02_SHARED_CONTRACTS.md §2): what the
// browser asks for. Validated for shape, length and limits here; whether the
// caller may use each thing it names is verifyRun's job. Inline: no Zod.

export type RunMode = "run" | "rerun" | "refine";

/** Today's Skill text from the browser (#239), until Registry refs (PY-01). */
export interface InlineSkill {
  name: string;
  content: string;
}

export interface RunEnvelope {
  playspaceId: string;
  nodeId: string;
  mode: RunMode;
  requestedCount: number;
  parentJobIds: string[];
  assetIds: string[];
  skillRevisionRefs: string[];
  skills: InlineSkill[];
  instruction?: string;
}

export type EnvelopeResult = { ok: true; envelope: RunEnvelope } | { ok: false; field: string; message: string };

const ID = /^[A-Za-z0-9_-]{1,128}$/;
// Asset IDs are UUIDs (utils/id.ts); nothing path-like gets through.
const ASSET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// An immutable Agent Registry revision: `registry/…/revisions/…`, plain segments only.
const REVISION_REF = /^registry\/(?:[A-Za-z0-9_.-]+\/)+revisions\/[A-Za-z0-9_.-]+$/;
const MODES: readonly RunMode[] = ["run", "rerun", "refine"];
// Only the session says whose request this is.
const OWNER_FIELDS = ["ownerKey", "owner_key", "owner", "userId", "user_id", "email"];

const fail = (field: string, message: string): EnvelopeResult => ({ ok: false, field, message });
const bytes = (text: string) => Buffer.byteLength(text, "utf8");

function idList(raw: unknown, field: string, max: number, pattern: RegExp): string[] | EnvelopeResult {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return fail(field, `${field} must be a list.`);
  if (raw.length > max) return fail(field, `${field} can list at most ${max}.`);
  const seen = new Set<string>();
  for (const [i, v] of raw.entries()) {
    if (typeof v !== "string" || !pattern.test(v) || v.includes("..")) return fail(`${field}[${i}]`, `${field}[${i}] isn't a valid ID.`);
    if (seen.has(v)) return fail(`${field}[${i}]`, `${field} lists ${v} twice.`);
    seen.add(v);
  }
  return raw as string[];
}

/** The validated envelope from a request body, or which field is wrong. */
export function readRunEnvelope(body: unknown, limits: RunLimits): EnvelopeResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("body", "The request must be a JSON object.");
  const b = body as Record<string, unknown>;
  for (const key of OWNER_FIELDS) if (key in b) return fail(key, "The owner comes from the session, not the request.");

  if (typeof b.playspaceId !== "string" || !ID.test(b.playspaceId)) return fail("playspaceId", "playspaceId isn't a valid ID.");
  if (typeof b.nodeId !== "string" || !ID.test(b.nodeId)) return fail("nodeId", "nodeId isn't a valid ID.");
  const mode = b.mode ?? "run";
  if (!MODES.includes(mode as RunMode)) return fail("mode", `mode must be one of: ${MODES.join(", ")}.`);
  const count = b.requestedCount ?? 1;
  if (!Number.isInteger(count) || (count as number) < 1 || (count as number) > limits.maxCount) {
    return fail("requestedCount", `requestedCount must be a whole number from 1 to ${limits.maxCount}.`);
  }

  const parentJobIds = idList(b.parentJobIds, "parentJobIds", limits.maxParents, ID);
  if (!Array.isArray(parentJobIds)) return parentJobIds;
  const assetIds = idList(b.assetIds, "assetIds", limits.maxAssets, ASSET_ID);
  if (!Array.isArray(assetIds)) return assetIds;
  const skillRevisionRefs = idList(b.skillRevisionRefs, "skillRevisionRefs", limits.maxSkills, REVISION_REF);
  if (!Array.isArray(skillRevisionRefs)) return skillRevisionRefs;

  const skills: InlineSkill[] = [];
  if (b.skills !== undefined && b.skills !== null) {
    if (!Array.isArray(b.skills)) return fail("skills", "skills must be a list.");
    for (const [i, raw] of (b.skills as unknown[]).entries()) {
      const s = raw as Record<string, unknown>;
      if (!raw || typeof raw !== "object" || typeof s.name !== "string" || typeof s.content !== "string" || !s.name.trim()) {
        return fail(`skills[${i}]`, `skills[${i}] must be { name, content }.`);
      }
      if (bytes(s.content) > limits.maxSkillBytes) return fail(`skills[${i}]`, `skills[${i}] is over ${limits.maxSkillBytes / 1024} KiB.`);
      skills.push({ name: s.name.trim().slice(0, 200), content: s.content });
    }
  }
  if (skills.length + skillRevisionRefs.length > limits.maxSkills) return fail("skills", `A Run can use at most ${limits.maxSkills} Skills.`);
  if (skills.reduce((n, s) => n + bytes(s.content), 0) > limits.maxSkillsTotalBytes) {
    return fail("skills", `The Skills are over ${limits.maxSkillsTotalBytes / 1024} KiB together.`);
  }

  let instruction: string | undefined;
  if (b.instruction !== undefined && b.instruction !== null) {
    if (typeof b.instruction !== "string") return fail("instruction", "instruction must be text.");
    if (b.instruction.length > limits.maxInstructionChars) return fail("instruction", `instruction is over ${limits.maxInstructionChars} characters.`);
    instruction = b.instruction;
  }

  return {
    ok: true,
    envelope: {
      playspaceId: b.playspaceId,
      nodeId: b.nodeId,
      mode: mode as RunMode,
      requestedCount: count as number,
      parentJobIds,
      assetIds,
      skillRevisionRefs,
      skills,
      ...(instruction !== undefined ? { instruction } : {}),
    },
  };
}
