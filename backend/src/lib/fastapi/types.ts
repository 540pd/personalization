// The Node BFF → FastAPI internal contract (#494, PACK NJS-08). The Skills
// calls follow the FastAPI service in docs/aryash/GCOS-FastAPI-skills-main
// (app/main.py, app/models.py, app/security.py): routes under /v1, snake_case
// bodies, the owner in an X-Owner-Key header, publish keyed by an
// Idempotency-Key header. createJob is still a PROPOSAL: that service has no
// jobs; the dispatcher that takes them comes later. Node speaks camelCase; the
// wire mapping is in client.ts.

/** Who the call is for: always derived from the verified session, never the browser. */
export interface ServicePrincipal {
  /** Session-derived owner key (#488): `usr_…`, the form the service requires. */
  ownerKey: string;
}

/** Optional, non-secret metadata carried as headers. */
export interface CallContext {
  /** Correlates the call across services (X-Request-Id). */
  requestId?: string;
}

// ── Jobs (the Run create interface; PROPOSAL) ──────────────────────────

export interface CreateJobRequest {
  playspaceId: string;
  nodeId: string;
  mode: "run" | "rerun" | "refine";
  parentJobIds: string[];
  assetIds: string[];
  skillRevisionRefs: string[];
  requestedCount: number;
  /** One per Run click (#491); the dispatcher dedupes on it. */
  idempotencyKey: string;
}

export type CreateJobResult =
  | { status: "accepted"; jobId: string }
  /** The call's outcome is unknown (timeout, dropped connection, 5xx). The job
   * may exist: reconcile by idempotency key, never resubmit blindly. */
  | { status: "pending"; idempotencyKey: string };

// ── Skills (the service's /v1/skills) ──────────────────────────────────

/** A Skill as Node may use it: the service's row, with only these fields kept
 * (its ownerKey and internal hashes are dropped, never passed on). */
export interface SkillRecord {
  skillId: string;
  /** creating, draft, disable_requested, …: the service's own states. */
  status: string;
  latestPublishedRevision: string | null;
  registryResource: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface SkillList {
  skills: SkillRecord[];
}

export interface CreateSkillRequest {
  /** 4–34 chars: lowercase letters, digits, hyphens; starts with a letter. */
  slug: string;
  displayName: string;
  description: string;
}

export interface SkillOperation {
  /** pending, updated, disable_requested, …: the service's own states. */
  status: string;
  operation: string | null;
}

export type PublishState = "pending" | "publishing" | "pending_activation" | "published" | "failed";

/** Published only once the Registry revision is active; poll until then. */
export interface PublishStatus {
  operationId: string;
  status: PublishState;
  revision: string | null;
  error: string | null;
  /** The tool catalog revision this publish was checked against (#510). */
  catalogRevision: string | null;
}

export interface ToolCheck {
  valid: boolean;
  results: { name: string; approved: boolean; reason: string }[];
  /** Which catalog the names were checked against (#510). */
  catalogRevision: string | null;
}

export interface DraftSkillRequest {
  name: string;
  goal: string;
  constraints?: string[];
  approvedTools?: string[];
}

export interface SkillDraft {
  markdown: string;
  approvedTools: string[];
  warning: string;
}

export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
}

// ── Errors (02_SHARED_CONTRACTS.md §5) ─────────────────────────────────

export type FastApiErrorCode =
  | "validation_failed"
  | "resource_not_accessible"
  | "tool_not_approved"
  | "conflict"
  | "idempotency_conflict"
  | "playspace_busy"
  | "dependency_unavailable"
  // The service's codes beyond the §5 table (#512).
  | "publish_in_progress"
  | "quota_exceeded"
  | "rate_limited";

/** Non-secret context from the service's error answer (#512). */
export interface FastApiErrorContext {
  /** The service's request ID, for tracing the call in its logs. */
  requestId?: string;
  /** The catalog revision a tool refusal was checked against. */
  catalogRevision?: string;
}

/**
 * What a route can answer the browser with. `message` is safe to show: it never
 * holds the FastAPI URL, a token or the upstream body.
 */
export class FastApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: FastApiErrorCode,
    message: string,
    readonly retryable: boolean,
    /** Validation details, rebuilt from the upstream answer and UI-safe. */
    readonly issues: ValidationIssue[] = [],
    readonly context: FastApiErrorContext = {}
  ) {
    super(message);
    this.name = "FastApiError";
  }
}

// ── The client ─────────────────────────────────────────────────────────

/** Every operation Node may call on FastAPI. One client, real or fake. */
export interface FastApiClient {
  createJob(principal: ServicePrincipal, request: CreateJobRequest, ctx?: CallContext): Promise<CreateJobResult>;
  createSkill(principal: ServicePrincipal, request: CreateSkillRequest, ctx?: CallContext): Promise<SkillRecord>;
  listSkills(principal: ServicePrincipal, ctx?: CallContext): Promise<SkillList>;
  getSkill(principal: ServicePrincipal, skillId: string, ctx?: CallContext): Promise<SkillRecord>;
  updateSkill(principal: ServicePrincipal, skillId: string, change: { displayName?: string; description?: string }, ctx?: CallContext): Promise<SkillOperation>;
  disableSkill(principal: ServicePrincipal, skillId: string, ctx?: CallContext): Promise<SkillOperation>;
  listRevisions(principal: ServicePrincipal, skillId: string, ctx?: CallContext): Promise<unknown>;
  getRevision(principal: ServicePrincipal, skillId: string, revisionId: string, ctx?: CallContext): Promise<unknown>;
  publishSkill(
    principal: ServicePrincipal,
    skillId: string,
    publish: { markdown: string; toolNames: string[]; idempotencyKey: string },
    ctx?: CallContext
  ): Promise<PublishStatus>;
  getPublishStatus(principal: ServicePrincipal, skillId: string, operationId: string, ctx?: CallContext): Promise<PublishStatus>;
  validateTools(principal: ServicePrincipal, toolNames: string[], ctx?: CallContext): Promise<ToolCheck>;
  draftSkill(principal: ServicePrincipal, request: DraftSkillRequest, ctx?: CallContext): Promise<SkillDraft>;
}

export type TimeoutKind = "job" | "skills" | "helper";

/** How each operation goes over the wire. */
export interface Operation {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  /** Safe to retry by contract: a repeat has no extra effect. */
  idempotent: boolean;
  timeout: TimeoutKind;
}

export const OPERATIONS = {
  // PROPOSAL: no service takes jobs yet.
  createJob: { method: "POST", path: "/v1/jobs", idempotent: false, timeout: "job" },
  // The service makes the Skill ID from owner + slug, so a retry finds the same one.
  createSkill: { method: "POST", path: "/v1/skills", idempotent: true, timeout: "skills" },
  listSkills: { method: "GET", path: "/v1/skills", idempotent: true, timeout: "skills" },
  getSkill: { method: "GET", path: "/v1/skills/{skillId}", idempotent: true, timeout: "skills" },
  updateSkill: { method: "PATCH", path: "/v1/skills/{skillId}", idempotent: true, timeout: "skills" },
  // Disables (keeps revisions); never a purge.
  disableSkill: { method: "DELETE", path: "/v1/skills/{skillId}", idempotent: true, timeout: "skills" },
  listRevisions: { method: "GET", path: "/v1/skills/{skillId}/revisions", idempotent: true, timeout: "skills" },
  getRevision: { method: "GET", path: "/v1/skills/{skillId}/revisions/{revisionId}", idempotent: true, timeout: "skills" },
  // Idempotent by its Idempotency-Key: a retry with the same key returns the same operation.
  publishSkill: { method: "POST", path: "/v1/skills/{skillId}/publish", idempotent: true, timeout: "skills" },
  getPublishStatus: { method: "GET", path: "/v1/skills/{skillId}/publish-operations/{operationId}", idempotent: true, timeout: "skills" },
  validateTools: { method: "POST", path: "/v1/tools/validate", idempotent: true, timeout: "skills" },
  // A model call each time: never retried, it would bill twice.
  draftSkill: { method: "POST", path: "/v1/skills/ai-draft", idempotent: false, timeout: "helper" },
} satisfies Record<keyof FastApiClient, Operation>;
