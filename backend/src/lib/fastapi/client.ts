import type { FastApiConfig } from "./config.js";
import { TransportError, type HttpResponse, type HttpTransport, type ServiceTokenProvider } from "./transport.js";
import { FastApiError, OPERATIONS, type CallContext, type FastApiClient, type Operation, type ServicePrincipal } from "./types.js";
import { errorFrom, malformed, requestIdOf, unavailable } from "./errors.js";
import {
  MalformedAnswer,
  createdJobId,
  fromWire,
  publishStatus,
  skillDraft,
  skillList,
  skillOperation,
  skillRecord,
  toWire,
  toolCheck,
} from "./wire.js";

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

/** Refuses input that tries to say whose call this is: that is the session's to say. */
function assertNoOwnerField(value: unknown): void {
  if (Array.isArray(value)) return value.forEach(assertNoOwnerField);
  if (!value || typeof value !== "object") return;
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (OWNER_FIELDS.has(key)) throw new FastApiError(422, "validation_failed", "The owner comes from the session, not the request.", false);
    assertNoOwnerField(v);
  }
}

const retryableStatus = (status: number) => status === 429 || status === 502 || status === 503 || status === 504;

function retryAfterMs(res: HttpResponse | undefined, attempt: number): number {
  const header = Number(res?.headers["retry-after"]);
  if (Number.isFinite(header) && header >= 0) return Math.min(header * 1000, RETRY_AFTER_CAP_MS);
  return RETRY_BASE_MS * attempt;
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
    const body = hasBody ? JSON.stringify(toWire(input)) : undefined;

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
          return res.body ? fromWire(JSON.parse(res.body)) : {};
        } catch {
          console.error(`[fastapi] ${op.method} ${op.path}: answer was not JSON`);
          throw malformed();
        }
      }
      last = res;
      const upstreamId = requestIdOf(res);
      const traced = upstreamId ? ` request ${upstreamId}` : "";
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

  /** Reads an answer with a wire parser; one that doesn't fit is a broken service. */
  const read = <T>(parse: (answer: unknown) => T, answer: unknown): T => {
    try {
      return parse(answer);
    } catch (err) {
      if (err instanceof MalformedAnswer) throw malformed();
      throw err;
    }
  };

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
        const jobId = read(createdJobId, await call(OPERATIONS.createJob, OPERATIONS.createJob.path, principal, request, ctx));
        return { status: "accepted", jobId };
      } catch (err) {
        // Maybe created, maybe not: the caller keeps its reservation and reconciles
        // by the same idempotency key (#491); resubmitting could start a second job.
        if (err instanceof UncertainOutcome) return { status: "pending", idempotencyKey: request.idempotencyKey };
        throw err;
      }
    },
    async createSkill(principal, request, ctx) {
      return read(skillRecord, await run(OPERATIONS.createSkill, OPERATIONS.createSkill.path, principal, request, ctx));
    },
    async listSkills(principal, ctx) {
      return read(skillList, await run(OPERATIONS.listSkills, OPERATIONS.listSkills.path, principal, undefined, ctx));
    },
    async getSkill(principal, skillId, ctx) {
      return read(skillRecord, await run(OPERATIONS.getSkill, pathOf(OPERATIONS.getSkill, { skillId }), principal, undefined, ctx));
    },
    async updateSkill(principal, skillId, change, ctx) {
      return read(skillOperation, await run(OPERATIONS.updateSkill, pathOf(OPERATIONS.updateSkill, { skillId }), principal, change, ctx));
    },
    async disableSkill(principal, skillId, ctx) {
      return read(skillOperation, await run(OPERATIONS.disableSkill, pathOf(OPERATIONS.disableSkill, { skillId }), principal, undefined, ctx));
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
      return read(
        publishStatus,
        await run(OPERATIONS.publishSkill, pathOf(OPERATIONS.publishSkill, { skillId }), principal, body, ctx, { "Idempotency-Key": idempotencyKey })
      );
    },
    async getPublishStatus(principal, skillId, operationId, ctx) {
      return read(publishStatus, await run(OPERATIONS.getPublishStatus, pathOf(OPERATIONS.getPublishStatus, { skillId, operationId }), principal, undefined, ctx));
    },
    async validateTools(principal, toolNames, ctx) {
      return read(toolCheck, await run(OPERATIONS.validateTools, OPERATIONS.validateTools.path, principal, { toolNames }, ctx));
    },
    async draftSkill(principal, request, ctx) {
      return read(skillDraft, await run(OPERATIONS.draftSkill, OPERATIONS.draftSkill.path, principal, request, ctx));
    },
  };
}

/** The call may or may not have taken effect: no answer, or a 5xx to a submit. */
class UncertainOutcome extends Error {
  constructor(readonly kind: "timeout" | "network" | "server_error") {
    super(`uncertain: ${kind}`);
  }
}
