# NJS-03 — Opaque sessions, expiry, logout, disable


> **Claude Code implementation task — approved functional scope.** Work in the existing repository; do not create a parallel application. First inspect `CLAUDE.md`, package config, related routes/services/models/tests, and relevant checked-in architecture docs. Follow `../01_FROZEN_ARCHITECTURE_RULES.md` and `../02_SHARED_CONTRACTS.md` when supplied. Latest November HLD/LLD is authoritative. Implement **only this task**; use typed interfaces/stubs for out-of-scope dependencies. No deploy, no production IAM/data change, no auto-commit/push.
>
> **Final response requirement:** Report (1) what already existed, (2) changed files, (3) precise behavior, (4) tests run and results, (5) follow-on dependencies or decisions. Do not claim tests passed unless run.

## Goal and architectural location

Implement the BFF's revocable browser session after NJS-01 + NJS-02. Current reference: hashed login sessions in Firestore; same-origin cookie sent via Next.js proxy; owner key resolved exclusively server-side.

## Scope to implement
1. Securely generate a high-entropy opaque session ID (use cryptographic RNG, at least 256 bits), hash it (SHA-256) for the Firestore document key, and set only the **raw** ID in an HttpOnly, Secure, host-only browser cookie (`gcos_session` in previous decisions). Never persist raw cookie values.
2. Include session hash, owner key, creation, last activity, idle deadline, absolute deadline, revoked state and required audit timestamps. Configurable timeout constants must be validated. The uploaded sequence references short session lookup caching (10 seconds), but never allow caching to defeat logout/disable guarantees; invalidate cache on revoke or document its bounded propagation.
3. Write login/session establishment after verifying identity and user status. On each protected request resolve the cookie, verify both deadlines and revocation, and recheck disabled user status. Sliding idle renewal must not extend beyond absolute expiry; implement throttled writes to avoid excessive Firestore writes.
4. Create explicit logout route: revoke server-side and clear cookie with matching attributes, even if already expired. Provide a trusted server-side disable/revoke-all service function; do **not** invent an unauthenticated public admin route.
5. Use `Cache-Control: no-store` on login and session responses. Do not expose `owner_key`, cookie ID/hash, provider token or Firestore path in response/logs.
6. Confirm that Next.js `/api/proxy` passes `Cookie`, `Set-Cookie`, and Origin as required; if the proxy implementation lives in a separate repo, record the exact integration action rather than rewriting that repo.

## Suggested LLD storage
```text
login_sessions/{sha256(session_id)} -> owner_key, idle_expires_at,
                                     absolute_expires_at, revoked_at, expire_at
```
Firestore TTL is cleanup only; **expiry is enforced at read time**.

## Tests to add
- Successful login sets correct cookie flags; only session hash is stored.
- Valid cookie resolves correct owner; forged/missing cookie is 401.
- Idle-expired, absolute-expired and revoked sessions are rejected.
- Logout invalidates server record and browser cookie; replay remains blocked.
- Disabled owner access is forbidden even with a previously valid session.
- Clock and concurrent renewal tests; no refresh beyond absolute deadline.

## Acceptance / stop conditions
- Protected endpoints obtain a typed session principal and never trust browser owner key.
- No session resurrected by cache, TTL, retry or clock differences.
- **Out of scope:** new login UI, cross-provider linking, generic admin portal, ADK/Vertex session handling (separate concept).
