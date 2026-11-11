import type { PublishStatus, SkillDraft, SkillOperation, SkillRecord, ToolCheck } from "./types.js";

// The wire format (#494, #532): Node speaks camelCase, the service snake_case;
// answers are trimmed to known fields, so the service's ownerKey and hashes
// never travel on. A parser that meets something else throws MalformedAnswer.

/** The service's answer isn't the shape this client knows. */
export class MalformedAnswer extends Error {
  constructor() {
    super("malformed FastAPI answer");
    this.name = "MalformedAnswer";
  }
}

export const toSnake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
export const toCamel = (key: string) => key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

function mapKeys(value: unknown, map: (key: string) => string): unknown {
  if (Array.isArray(value)) return value.map((v) => mapKeys(v, map));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [map(k), mapKeys(v, map)]));
  }
  return value;
}

/** A request body as the service takes it. */
export const toWire = (value: unknown) => mapKeys(value, toSnake);
/** An answer as Node reads it. */
export const fromWire = (value: unknown) => mapKeys(value, toCamel);

/** An upstream value as text, clipped. */
export const text = (v: unknown, max = 200) => String(v ?? "").slice(0, max);
export const str = (v: unknown) => (typeof v === "string" ? v : null);
const record = (v: unknown) => (v ?? {}) as Record<string, unknown>;

/** The service's Skill row, trimmed to what Node may use. */
export function skillRecord(row: unknown): SkillRecord {
  const r = record(row);
  if (typeof r.skillId !== "string" || typeof r.status !== "string") throw new MalformedAnswer();
  return {
    skillId: r.skillId,
    status: r.status,
    latestPublishedRevision: str(r.latestPublishedRevision),
    registryResource: str(r.registryResource),
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
  };
}

export function skillList(answer: unknown): { skills: SkillRecord[] } {
  const skills = record(answer).skills;
  if (!Array.isArray(skills)) throw new MalformedAnswer();
  return { skills: skills.map(skillRecord) };
}

export function skillOperation(answer: unknown): SkillOperation {
  const r = record(answer);
  return { status: text(r.status, 60), operation: str(r.operation) };
}

const PUBLISH_STATES = new Set(["pending", "publishing", "pending_activation", "published", "failed"]);

export function publishStatus(answer: unknown): PublishStatus {
  const r = record(answer);
  if (typeof r.operationId !== "string" || !PUBLISH_STATES.has(r.status as string)) throw new MalformedAnswer();
  return {
    operationId: r.operationId,
    status: r.status as PublishStatus["status"],
    revision: str(r.revision),
    error: str(r.error),
    catalogRevision: str(r.catalogRevision),
  };
}

export function toolCheck(answer: unknown): ToolCheck {
  const r = record(answer);
  if (typeof r.valid !== "boolean" || !Array.isArray(r.results)) throw new MalformedAnswer();
  return {
    valid: r.valid,
    results: r.results.map((x) => {
      const e = record(x);
      return { name: text(e.name, 100), approved: e.approved === true, reason: text(e.reason) };
    }),
    catalogRevision: str(r.catalogRevision),
  };
}

export function skillDraft(answer: unknown): SkillDraft {
  const r = record(answer);
  if (typeof r.markdown !== "string") throw new MalformedAnswer();
  return {
    markdown: r.markdown,
    approvedTools: Array.isArray(r.approvedTools) ? r.approvedTools.map((t) => text(t, 100)) : [],
    warning: text(r.warning, 300),
  };
}

export function createdJobId(answer: unknown): string {
  const jobId = record(answer).jobId;
  if (typeof jobId !== "string" || !jobId) throw new MalformedAnswer();
  return jobId;
}
