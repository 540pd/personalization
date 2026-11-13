# NJS-08 — Secure BFF service client for FastAPI


> **Claude Code implementation task — approved functional scope.** Work in the existing repository; do not create a parallel application. First inspect `CLAUDE.md`, package config, related routes/services/models/tests, and relevant checked-in architecture docs. Follow `../01_FROZEN_ARCHITECTURE_RULES.md` and `../02_SHARED_CONTRACTS.md` when supplied. Latest November HLD/LLD is authoritative. Implement **only this task**; use typed interfaces/stubs for out-of-scope dependencies. No deploy, no production IAM/data change, no auto-commit/push.
>
> **Final response requirement:** Report (1) what already existed, (2) changed files, (3) precise behavior, (4) tests run and results, (5) follow-on dependencies or decisions. Do not claim tests passed unless run.

## Goal and architectural location

All browser actions go to Node BFF; Node calls the private FastAPI Cloud Run service with a **Google-signed service-to-service ID token**, not the user's Google Sign-In token. The owner key passed in the FastAPI JSON body is derived only from the verified BFF session.

## Scope to implement
1. Inspect existing Node-to-Python HTTP client and schema. Build one typed client for approved internal operations (e.g., Skills CRUD, catalog validation, helper and future Run create interface). Do not duplicate fetch wrappers across routes.
2. Use Google auth libraries / Application Default Credentials on Cloud Run to mint a **service identity token** with the FastAPI Cloud Run URL or configured custom audience, as appropriate. Use the official ID-token client; **not** a user OAuth client ID token or an API key. Support local ADC plus explicit mock test mode without disabling production auth.
3. Set `Authorization: Bearer <service-id-token>` only for private FastAPI requests. Never forward browser ID token, browser `Cookie`, arbitrary browser Authorization header or user supplied owner key.
4. Serialize a validated internal schema with session-derived `owner_key`, the resource identifiers and pinned revision references. Preserve request/trace IDs as nonsecret metadata. Agree camelCase/snake_case mapping with the existing FastAPI API type.
5. Configure bounded connect/request timeouts and response size. Retry **only** requests proven idempotent by API contract; when submission result is uncertain, propagate pending/reconciliation state rather than unconditionally resubmitting.
6. Map upstream auth/rejection/timeouts/5xx to the established structured error contract without leaking endpoints or tokens. Mask all transport secrets in logs.
7. On the **FastAPI side**, verify incoming service identity and permitted service account via existing infrastructure and request auth middleware. If there is no such middleware, add a minimal secure interface/test under the existing FastAPI auth convention and explicitly flag the integration dependency—without creating a permissive bypass.

## Tests to add
- ID-token audience is FastAPI service audience; only valid service principal is accepted.
- Outbound JSON uses server-derived owner key; browser-supplied key is ignored/rejected.
- No Google Sign-In ID token or cookie appears in outbound headers/body.
- Token acquisition failure, private service 401/403, 429, timeout, 5xx are handled safely.
- Idempotent operation retries preserve same request key; ambiguous submit is not duplicated.
- Local unit tests use fake token provider and HTTP adapter, never real cloud calls.

## Acceptance / stop conditions
- One secure, typed internal client, with clear boundary and tests.
- FastAPI rejects unauthenticated or unexpected callers; no direct browser access to internal endpoints.
- **Out of scope:** implementing LRO dispatcher/Cloud Tasks or modifying production IAM without explicit authorization.
