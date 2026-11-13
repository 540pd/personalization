import type { HttpResponse } from "./transport.js";
import { FastApiError, type FastApiErrorCode, type FastApiErrorContext, type ValidationIssue } from "./types.js";
import { text, toCamel } from "./wire.js";

// The FastAPI service's error answers, as our contract (#494, #512, #532):
// { error: { code, message, requestId, retryable, issues } }, and the older
// { detail } answers during the switch. Upstream text is never the message;
// only a tool's name (the caller's own input) is carried into one.

export const unavailable = (status = 503, retryable = true, context: FastApiErrorContext = {}) =>
  new FastApiError(status, "dependency_unavailable", "The Skills and generation service is unavailable. Try again shortly.", retryable, [], context);

/** The service answered something that isn't its contract. */
export const malformed = () => unavailable(502, false);

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
export function errorFrom(res: HttpResponse): FastApiError {
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
  const requestId = requestIdOf(res, error);
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

/** The service's request ID (#512): from its error body, else its header; only if it looks like one. */
export function requestIdOf(res: HttpResponse, error?: Record<string, unknown>): string | undefined {
  const value = typeof error?.requestId === "string" ? error.requestId : res.headers["x-request-id"];
  return typeof value === "string" && REQUEST_ID.test(value) ? value : undefined;
}

const REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;
