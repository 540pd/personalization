# Shared boundary and contract guide (implementation reference)

**Purpose:** Keep separately assigned Claude Code tasks interoperable. The examples below express required semantics, **not approval of new route naming**. If routes/types exist, keep backwards compatibility and update this reference to match the repo.

## 1. Browser → BFF login

Existing diagram: `POST /api/auth/login` through the Next.js `/api/proxy` layer.

```json
{ "idToken": "<ephemeral Google Sign-In ID token>" }
```

- Validate ID token server-side and establish session.
- Set cookie on browser-facing response (not in JSON).
- User-visible response may include a safe profile summary; **never** include `owner_key`, session ID, raw ID token, Firestore paths, or backend service credentials.
- Unsafe browser methods must include a same-origin `Origin` header.

## 2. Browser → BFF Run request (proposed shape)

```json
{
  "playspaceId": "ps_...",
  "nodeId": "node_...",
  "mode": "run",
  "parentJobIds": ["job_..."],
  "assetIds": ["asset_..."],
  "skillRevisionRefs": ["registry/.../revisions/..."],
  "requestedCount": 2
}
```

The idempotency key is a separate request header (name must follow the existing repo contract). Node derives `owner_key` from the session. Client values are syntactically and semantically validated; no direct GCS URIs, owner key, or forged provenance are trusted. `mode`/node spec must be aligned with existing DAG API.

**Idempotency outcomes:** first click reserves/admits exactly one logical job; same key + canonical same payload resolves to same job/pending admission; same key + changed payload is conflict; busy Playspace with a **different key** fails safely. Externally returned `jobId` is stable across replays.

## 3. Node → FastAPI internal request (proposed shape)

```json
{
  "owner_key": "owner_generated_by_bff",
  "playspace_id": "ps_...",
  "node_id": "node_...",
  "mode": "run",
  "parent_job_ids": ["job_..."],
  "asset_ids": ["asset_..."],
  "skill_revision_refs": ["registry/.../revisions/..."],
  "idempotency_key": "run_click_key",
  "requested_count": 2
}
```

- Request has a Google-signed **service OIDC ID token** whose audience matches the receiving private FastAPI service.
- **Never** include the user Google ID token, session cookie, or raw session ID.
- FastAPI must independently authenticate the service caller and must **not** accept arbitrary browser calls with a self-declared `owner_key`.
- Node uses camelCase externally if established; Python receives snake_case if established. Align with the existing shared schema; avoid hand-written mismatches.

## 4. Skill logical record and immutable revision

```json
{
  "skillId": "logical-skill-id",
  "ownerKey": "internal-only",
  "registryRevisionRef": "registry/.../revisions/...",
  "contentSha256": "sha256hex",
  "state": "published"
}
```

- Published content and revisions live **only in Agent Registry**.
- An ownership or revision reference may be stored transactionally in the chosen operational mapping store; which store and exactly which schema must follow the checked-in code and approved architecture. No second content/version history.
- Updating a published Skill means publishing a **new immutable revision**, never editing the old one.
- An AI helper returns a **draft** for user review; it cannot silently publish.

## 5. Structured error contract (suggested; reuse repo's canonical error type)

```json
{
  "error": {
    "code": "playspace_busy",
    "message": "A run is already active for this Playspace.",
    "requestId": "safe-request-id",
    "retryable": false
  }
}
```

| Condition | Suggested HTTP | Suggested error code |
|---|---:|---|
| Unauthenticated or expired session | 401 | `unauthenticated` |
| Disabled user or disallowed caller | 403 | `forbidden` |
| Request or Markdown validation fails | 422 | `validation_failed` |
| Idempotency key reused with a different payload | 409 | `idempotency_conflict` |
| Active different run in the Playspace | 409 | `playspace_busy` |
| Asset/Skill/parent not owned by caller | 403 or 404 | `resource_not_accessible` |
| Tool reference not in approved catalog | 422 | `tool_not_approved` |
| Upstream Registry / IAM / Vertex unavailable | 502 or 503 | `dependency_unavailable` |
| Duplicate uncertain downstream submit | 202 or existing response | `admission_pending` |

**Do not invent a permanent public API** from this table: prefer existing API response types and document any discrepancy in task handoff.

## 6. Sensitive-data handling
- Mask token/cookie, user email, prompt text, Skill source, asset object names, and full raw provider errors in logs.
- Correlate by safe request ID; use opaque IDs for audit and authorization checks.
- Never use Firestore TTL alone for access decisions; validate timestamps and revocation state on every session read.
- Firestore transactions must not perform outgoing FastAPI/Registry network calls. Use reservation/finalization patterns and document unresolved pending states.
