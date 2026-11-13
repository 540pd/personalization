import type { FastApiConfig } from "./config.js";
import { TransportError, type HttpResponse, type HttpTransport, type ServiceTokenProvider } from "./transport.js";
import {
  FastApiError,
  OPERATIONS,
  type CallContext,
  type FastApiClient,
  type FastApiErrorCode,
  type FastApiErrorContext,
  type Operation,
  type PublishStatus,
  type ServicePrincipal,
  type SkillRecord,
  type ValidationIssue,
} from "./types.js";

// The one client for Node → FastAPI calls (#494, PACK NJS-08; docs/aryash rule 8;
// the service in docs/aryash/GCOS-FastAPI-skills-main).
// - Authorization carries only the backend's own Google-signed service token.
//   Nothing from the browser is forwarded: the methods take typed input, not
//   a request, so a cookie or user token has no way in.
// - The owner goes in X-Owner-Key, from the ServicePrincipal (the session);
//   input that brings its own owner field is refused. The service trusts that
//   header only from the allowlisted Node service account (app/security.py).
// - Only operations idempotent by contract are retried. An uncertain
//   createJob answers "pending" for reconciliation, never a second submit.
// - Upstream failures become FastApiError with the shared error codes; no
//   URL, token or upstream text reaches the message. Answers are trimmed to
//   known fields, so the service's ownerKey never travels on.

export interface ClientDeps {
  config: FastApiConfig;
  tokens: ServiceTokenProvider;
  transport: HttpTransport;
  /** Waits between retries; tests pass an instant one. */
  sleep?: (ms: number) => Promise<void>;
}

/** One retry for an idempotent call; never more. */
const MAX_ATTEMPTS = 2;
const RETRY_BASE_MS = 250;
const RETRY_AFTER_CAP_MS = 2_000;

const OWNER_FIELDS = new Set(["ownerKey", "owner_key", "owner"]);
/** The service accepts `usr_…`, at most 128 characters (app/security.py). */
const OWNER_KEY = /^usr_[A-Za-z0-9_-]{1,124}$/;
/** The service wants 8–128 characters (app/main.py). */
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_.:-]{8,128}$/;
const PATH_ID = /^[A-Za-z0-9_.:-]{1,128}$/;

const toSnake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toCamel = (key: string) => key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

function mapKeys(value: unknown, map: (key: string) => string): unknown {
  if (Array.isArray(value)) return value.map((v) => mapKeys(v, map));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [map(k), mapKeys(v, map)]));
  }
  return value;
}

/** Refuses input that tries to say whose call this is: that is the session's to say. */
function assertNoOwnerField(value: unknown): void {
  if (Array.isArray(value)) return value.forEach(assertNoOwnerField);
  if (!value || typeof value !== "object") return;
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (OWNER_FIELDS.has(key)) throw new FastApiError(422, "validation_failed", "The owner comes from the session, not the request.", false);
    assertNoOwnerField(v);
  }
}

const unavailable = (status = 503, retryable = true, context: FastApiErrorContext = {}) =>
  new FastApiError(status, "dependency_unavailable", "The Skills and generation service is unavailable. Try again shortly.", retryable, [], context);
const malformed = () => unavailable(502, false);

const text = (v: unknown, max = 200) => String(v ?? "").slice(0, max);

/** A wire path as Node names it: `body.tool_names` → `toolNames`. */
const nodePath = (path: unknown) =>
  text(path, 100)
    .replace(/^body\./, "")
    .split(".")
    .map(toCamel)
    .join(".");

/** A tool issue's message, written here: only the tool's name (the caller's own input) comes from upstream. */
function toolIssue(code: string, tool: unknown, path: string): ValidationIssue {
  const name = text(tool, 100);
  const message = code === "tool_not_listed" ? `SKILL.md declares ${name}; add it to the tool list.` : `${name} isn't an approved tool.`;
  return { code, path, message };
}

/**
 * Validation details from the contract's `error.issues` (#512), or from the
 * older `{ detail }` answers, which are still understood during the switch.
 */
function issuesOf(detail: unknown, error: Record<string, unknown> | undefined): ValidationIssue[] {
  const list = error?.issues;
  if (Array.isArray(list)) {
    let tool = 0;
    return list.slice(0, 50).map((i) => {
      const e = (i ?? {}) as Record<string, unknown>;
      const code = text(e.code, 60) || "invalid";
      if (e.tool !== undefined && (code === "tool_not_approved" || code === "tool_not_listed")) return toolIssue(code, e.tool, `toolNames[${tool++}]`);
      return { code, path: nodePath(e.path), message: text(e.message, 500) };
    });
  }
  // Older: Pydantic's [{ loc: ["body", "slug"], msg, type }]
  if (Array.isArray(detail)) {
    return detail.slice(0, 50).map((d) => {
      const e = (d ?? {}) as Record<string, unknown>;
      const loc = Array.isArray(e.loc) ? e.loc.filter((p) => p !== "body").map(String) : [];
      return { code: text(e.type, 60) || "invalid", path: loc.map(toCamel).join("."), message: text(e.msg) };
    });
  }
  const d = (detail ?? {}) as Record<string, unknown>;
  // Older: the service's tool checks, { invalid_tools } and { tools_not_listed }.
  for (const [key, code] of [["invalid_tools", "tool_not_approved"], ["tools_not_listed", "tool_not_listed"]] as const) {
    if (Array.isArray(d[key])) return (d[key] as unknown[]).slice(0, 50).map((n, i) => toolIssue(code, n, `toolNames[${i}]`));
  }
  // Older: { tool_declaration_errors: [{ path, message }] }
  if (Array.isArray(d.tool_declaration_errors)) {
    return (d.tool_declaration_errors as unknown[]).slice(0, 50).map((x) => {
      const e = (x ?? {}) as Record<string, unknown>;
      return { code: "tool_declaration", path: text(e.path, 100), message: text(e.message, 500) };
    });
  }
  return [];
}

/** A FastAPI error answer, as our contract. Upstream text is never the message. */
function errorFrom(res: HttpResponse): FastApiError {
  let parsed: { detail?: unknown; error?: Record<string, unknown> } = {};
  try {
    parsed = JSON.parse(res.body) ?? {};
  } catch {
    parsed = {};
  }
  const error = parsed.error && typeof parsed.error === "object" ? parsed.error : undefined;
  const code = typeof error?.code === "string" ? (error.code as FastApiErrorCode) : undefined;
  const issues = issuesOf(parsed.detail, error);
  const context: FastApiErrorContext = {};
  const requestId = requestIdOf(res);
  if (requestId) context.requestId = requestId;
  const revision = error?.catalogRevision ?? (parsed.detail as { catalog_revision?: unknown } | undefined)?.catalog_revision;
  if (typeof revision === "string" && revision) context.catalogRevision = text(revision, 100);

  if (res.status === 404) return new FastApiError(404, "resource_not_accessible", "Not found.", false, [], context);
  if (res.status === 409) {
    if (code === "playspace_busy") return new FastApiError(409, code, "A run is already active for this Playspace.", false, [], context);
    if (code === "idempotency_conflict") return new FastApiError(409, code, "This request conflicts with an earlier one using the same key.", false, [], context);
    if (code === "publish_in_progress") return new FastApiError(409, code, "This Skill is already being published. Try again shortly.", true, [], context);
    return new FastApiError(409, "conflict", "That Skill is busy, or this conflicts with an earlier request. Try again shortly.", false, [], context);
  }
  if (res.status === 422 || res.status === 400 || res.status === 413) {
    if (code === "quota_exceeded") return new FastApiError(422, code, "You've reached the limit for your Skills.", false, [], context);
    if (code === "tool_not_approved" || issues.some((i) => i.code === "tool_not_approved")) {
      return new FastApiError(422, "tool_not_approved", "A tool in this Skill isn't approved.", false, issues, context);
    }
    return new FastApiError(422, "validation_failed", "The request didn't pass validation.", false, issues, context);
  }
  // Our service identity was refused: a deployment problem, not the user's.
  if (res.status === 401 || res.status === 403) return unavailable(502, false, context);
  if (res.status === 429) {
    if (code === "rate_limited") return new FastApiError(429, code, "Too many requests. Try again later.", true, [], context);
    return unavailable(503, true, context);
  }
  return unavailable(502, true, context);
}

/** The service's request ID (#512): from its error body or its header, only if it looks like one. */
function requestIdOf(res: HttpResponse): string | undefined {
  let fromBody: unknown;
  try {
    fromBody = (JSON.parse(res.body) as { error?: { requestId?: unknown } })?.error?.requestId;
  } catch {
    fromBody = undefined;
  }
  const value = typeof fromBody === "string" ? fromBody : res.headers["x-request-id"];
  return typeof value === "string" && REQUEST_ID.test(value) ? value : undefined;
}

const REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

const retryableStatus = (status: number) => status === 429 || status === 502 || status === 503 || status === 504;

function retryAfterMs(res: HttpResponse | undefined, attempt: number): number {
  const header = Number(res?.headers["retry-after"]);
  if (Number.isFinite(header) && header >= 0) return Math.min(header * 1000, RETRY_AFTER_CAP_MS);
  return RETRY_BASE_MS * attempt;
}

const str = (v: unknown) => (typeof v === "string" ? v : null);

/** The service's Skill row, trimmed to what Node may use. */
function skillRecord(row: unknown): SkillRecord {
  const r = (row ?? {}) as Record<string, unknown>;
  if (typeof r.skillId !== "string" || typeof r.status !== "string") throw malformed();
  return {
    skillId: r.skillId,
    status: r.status,
    latestPublishedRevision: str(r.latestPublishedRevision),
    registryResource: str(r.registryResource),
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
  };
}

const PUBLISH_STATES = new Set(["pending", "publishing", "pending_activation", "published", "failed"]);

function publishStatus(raw: unknown): PublishStatus {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (typeof r.operationId !== "string" || !PUBLISH_STATES.has(r.status as string)) throw malformed();
  return {
    operationId: r.operationId,
    status: r.status as PublishStatus["status"],
    revision: str(r.revision),
    error: str(r.error),
    catalogRevision: str(r.catalogRevision),
  };
}

export function createFastApiClient(deps: ClientDeps): FastApiClient {
  const { config, tokens, transport } = deps;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  /** Sends one operation; retries when the contract allows; returns the parsed answer. */
  async function call(
    op: Operation,
    path: string,
    principal: ServicePrincipal,
    input: unknown,
    ctx: CallContext = {},
    extraHeaders: Record<string, string> = {}
  ): Promise<unknown> {
    assertNoOwnerField(input);
    if (!principal?.ownerKey || !OWNER_KEY.test(principal.ownerKey)) {
      throw new FastApiError(500, "dependency_unavailable", "No signed-in owner for this call.", false);
    }
    const url = `${config.baseUrl}${path}`;
    const hasBody = op.method !== "GET" && op.method !== "DELETE" && input !== undefined;
    const body = hasBody ? JSON.stringify(mapKeys(input, toSnake)) : undefined;

    let last: HttpResponse | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let token: string;
      try {
        token = await tokens.token();
      } catch {
        console.error(`[fastapi] could not mint the service token for ${op.method} ${op.path}`);
        throw unavailable(503, true);
      }
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "X-Owner-Key": principal.ownerKey,
        ...extraHeaders,
      };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (ctx.requestId) headers["X-Request-Id"] = ctx.requestId.slice(0, 128);

      let res: HttpResponse;
      try {
        res = await transport({ method: op.method, url, headers, body, timeoutMs: config.timeoutsMs[op.timeout], maxResponseBytes: config.maxResponseBytes });
      } catch (err) {
        const kind = err instanceof TransportError ? err.kind : "network";
        console.error(`[fastapi] ${op.method} ${op.path}: ${kind} (attempt ${attempt})`);
        if (kind === "too_large") throw malformed();
        if (op.idempotent && attempt < MAX_ATTEMPTS) {
          await sleep(retryAfterMs(undefined, attempt));
          continue;
        }
        throw new UncertainOutcome(kind);
      }
      if (res.status >= 200 && res.status < 300) {
        try {
          return res.body ? mapKeys(JSON.parse(res.body), toCamel) : {};
        } catch {
          console.error(`[fastapi] ${op.method} ${op.path}: answer was not JSON`);
          throw malformed();
        }
      }
      last = res;
      const upstreamId = res.headers["x-request-id"];
      const traced = typeof upstreamId === "string" && REQUEST_ID.test(upstreamId) ? ` request ${upstreamId}` : "";
      console.error(`[fastapi] ${op.method} ${op.path}: ${res.status}${traced} (attempt ${attempt})`);
      if (op.idempotent && retryableStatus(res.status) && attempt < MAX_ATTEMPTS) {
        await sleep(retryAfterMs(res, attempt));
        continue;
      }
      break;
    }
    // A 5xx after a submit leaves its effect unknown, like a timeout.
    if (!op.idempotent && last && last.status >= 500) throw new UncertainOutcome("server_error");
    throw errorFrom(last!);
  }

  /** As `call`, mapping an unknown outcome to the right answer for the operation. */
  async function run(op: Operation, path: string, principal: ServicePrincipal, input: unknown, ctx?: CallContext, headers?: Record<string, string>) {
    try {
      return await call(op, path, principal, input, ctx, headers);
    } catch (err) {
      if (err instanceof UncertainOutcome) throw err.kind === "timeout" ? unavailable(504, true) : unavailable(503, true);
      throw err;
    }
  }

  const segment = (value: string, what: string) => {
    // Dots are allowed in IDs, but "." and ".." would walk the service's path.
    if (!PATH_ID.test(value) || value === "." || value.includes("..")) throw new FastApiError(422, "validation_failed", `That ${what} isn't valid.`, false);
    return encodeURIComponent(value);
  };
  const pathOf = (op: Operation, ids: Record<string, string>) =>
    op.path.replace(/\{(\w+)\}/g, (_, name: string) => segment(ids[name] ?? "", name === "skillId" ? "Skill ID" : "ID"));

  return {
    async createJob(principal, request, ctx) {
      try {
        const answer = (await call(OPERATIONS.createJob, OPERATIONS.createJob.path, principal, request, ctx)) as { jobId?: unknown };
        if (typeof answer.jobId !== "string" || !answer.jobId) throw malformed();
        return { status: "accepted", jobId: answer.jobId };
      } catch (err) {
        // Maybe created, maybe not: the caller keeps its reservation and reconciles
        // by the same idempotency key (#491); resubmitting could start a second job.
        if (err instanceof UncertainOutcome) return { status: "pending", idempotencyKey: request.idempotencyKey };
        throw err;
      }
    },
    async createSkill(principal, request, ctx) {
      return skillRecord(await run(OPERATIONS.createSkill, OPERATIONS.createSkill.path, principal, request, ctx));
    },
    async listSkills(principal, ctx) {
      const answer = (await run(OPERATIONS.listSkills, OPERATIONS.listSkills.path, principal, undefined, ctx)) as { skills?: unknown };
      if (!Array.isArray(answer.skills)) throw malformed();
      return { skills: answer.skills.map(skillRecord) };
    },
    async getSkill(principal, skillId, ctx) {
      return skillRecord(await run(OPERATIONS.getSkill, pathOf(OPERATIONS.getSkill, { skillId }), principal, undefined, ctx));
    },
    async updateSkill(principal, skillId, change, ctx) {
      const answer = (await run(OPERATIONS.updateSkill, pathOf(OPERATIONS.updateSkill, { skillId }), principal, change, ctx)) as Record<string, unknown>;
      return { status: text(answer.status, 60), operation: str(answer.operation) };
    },
    async disableSkill(principal, skillId, ctx) {
      const answer = (await run(OPERATIONS.disableSkill, pathOf(OPERATIONS.disableSkill, { skillId }), principal, undefined, ctx)) as Record<string, unknown>;
      return { status: text(answer.status, 60), operation: str(answer.operation) };
    },
    async listRevisions(principal, skillId, ctx) {
      return run(OPERATIONS.listRevisions, pathOf(OPERATIONS.listRevisions, { skillId }), principal, undefined, ctx);
    },
    async getRevision(principal, skillId, revisionId, ctx) {
      return run(OPERATIONS.getRevision, pathOf(OPERATIONS.getRevision, { skillId, revisionId }), principal, undefined, ctx);
    },
    async publishSkill(principal, skillId, publish, ctx) {
      if (!IDEMPOTENCY_KEY.test(publish.idempotencyKey)) throw new FastApiError(422, "validation_failed", "The publish key isn't valid.", false);
      const { idempotencyKey, ...body } = publish;
      return publishStatus(
        await run(OPERATIONS.publishSkill, pathOf(OPERATIONS.publishSkill, { skillId }), principal, body, ctx, { "Idempotency-Key": idempotencyKey })
      );
    },
    async getPublishStatus(principal, skillId, operationId, ctx) {
      return publishStatus(await run(OPERATIONS.getPublishStatus, pathOf(OPERATIONS.getPublishStatus, { skillId, operationId }), principal, undefined, ctx));
    },
    async validateTools(principal, toolNames, ctx) {
      const answer = (await run(OPERATIONS.validateTools, OPERATIONS.validateTools.path, principal, { toolNames }, ctx)) as Record<string, unknown>;
      if (typeof answer.valid !== "boolean" || !Array.isArray(answer.results)) throw malformed();
      return {
        valid: answer.valid,
        results: answer.results.map((r) => {
          const e = (r ?? {}) as Record<string, unknown>;
          return { name: text(e.name, 100), approved: e.approved === true, reason: text(e.reason) };
        }),
        catalogRevision: str(answer.catalogRevision),
      };
    },
    async draftSkill(principal, request, ctx) {
      const answer = (await run(OPERATIONS.draftSkill, OPERATIONS.draftSkill.path, principal, request, ctx)) as Record<string, unknown>;
      if (typeof answer.markdown !== "string") throw malformed();
      return {
        markdown: answer.markdown,
        approvedTools: Array.isArray(answer.approvedTools) ? answer.approvedTools.map((t) => text(t, 100)) : [],
        warning: text(answer.warning, 300),
      };
    },
  };
}

/** The call may or may not have taken effect: no answer, or a 5xx to a submit. */
class UncertainOutcome extends Error {
  constructor(readonly kind: "timeout" | "network" | "server_error") {
    super(`uncertain: ${kind}`);
  }
}
