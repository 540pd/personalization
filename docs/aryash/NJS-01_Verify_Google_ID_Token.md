# NJS-01 — Verify Google Sign-In ID token


> **Claude Code implementation task — approved functional scope.** Work in the existing repository; do not create a parallel application. First inspect `CLAUDE.md`, package config, related routes/services/models/tests, and relevant checked-in architecture docs. Follow `../01_FROZEN_ARCHITECTURE_RULES.md` and `../02_SHARED_CONTRACTS.md` when supplied. Latest November HLD/LLD is authoritative. Implement **only this task**; use typed interfaces/stubs for out-of-scope dependencies. No deploy, no production IAM/data change, no auto-commit/push.
>
> **Final response requirement:** Report (1) what already existed, (2) changed files, (3) precise behavior, (4) tests run and results, (5) follow-on dependencies or decisions. Do not claim tests passed unless run.

## Goal and architectural location

The **Node.js Cloud Run BFF** is the only service that accepts the browser's transient Google Sign-In ID token. Verify the token before any user/owner/session record is created; never forward this token to Python.

## Scope to implement
1. Find the existing `POST /api/auth/login` (or equivalent) and use the repository's existing Google-supported token verification library. Reject unsigned, forged, expired, malformed and wrong-audience tokens; validate **signature**, `aud`, `iss`, `exp`, `email_verified`, and `hd` against configured Google Workspace hosted-domain policy. Do not substitute checking `email.endsWith()` for `hd`.
2. Load allowed OAuth client audiences, issuer values, hosted domain(s), and clock-skew policy from validated runtime configuration/secret management, **not** from request JSON. Do not add real secrets to the repo.
3. Return a minimal typed `VerifiedGoogleIdentity` containing `issuer`, `subject (sub)`, and sanitized profile fields. No Firestore writes or session creation in this task; NJS-02/NJS-03 consume the verified identity.
4. Fail closed for absent/invalid `hd` when a Workspace domain is required, `email_verified=false`, unsupported audience, issuer, missing subject, token parse/library errors and configuration omission.
5. Ensure middleware does not log raw tokens or entire provider claims. Keep the token only in memory for login and discard after processing.

## Suggested implementation shape (adapt to repo)
- `config/googleAuthConfig.ts`: parsed env/config.
- `auth/googleIdTokenVerifier.ts`: interface and Google library adapter.
- `auth/types.ts`: verified identity type.
- Login route calls verifier before NJS-02/NJS-03; no duplicate implementation.

## Tests to add
- Valid token with configured audience/issuer/hd/verified email yields correct issuer + sub.
- Wrong `aud`, wrong `iss`, expired token, bad signature are rejected.
- Missing/mismatched `hd` and unverified email are rejected.
- Malformed token and provider-key retrieval failure return sanitized errors (no secrets).
- A request cannot submit `owner_key`, email or `sub` in the body to override verified claims.

## Acceptance / stop conditions
- One verification entry point; its output is suitable for identity linking.
- Login cannot create a session before verification succeeds.
- Tests use verifier mocks or deterministic fixtures; no real user credentials.
- **Out of scope:** account link writes, cookie issuance, Google client-side UI redesign, Cloud Run service-to-service authentication.
