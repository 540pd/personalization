# NJS-04 — CSRF Origin protection for cookie-authenticated calls


> **Claude Code implementation task — approved functional scope.** Work in the existing repository; do not create a parallel application. First inspect `CLAUDE.md`, package config, related routes/services/models/tests, and relevant checked-in architecture docs. Follow `../01_FROZEN_ARCHITECTURE_RULES.md` and `../02_SHARED_CONTRACTS.md` when supplied. Latest November HLD/LLD is authoritative. Implement **only this task**; use typed interfaces/stubs for out-of-scope dependencies. No deploy, no production IAM/data change, no auto-commit/push.
>
> **Final response requirement:** Report (1) what already existed, (2) changed files, (3) precise behavior, (4) tests run and results, (5) follow-on dependencies or decisions. Do not claim tests passed unless run.

## Goal and architectural location

The Browser → Next.js same-origin proxy → Node BFF path relies on an HttpOnly cookie. Prevent cross-site websites from triggering unsafe authenticated actions.

## Scope to implement
1. Implement a reusable middleware/guard for unsafe browser methods (`POST`, `PUT`, `PATCH`, `DELETE`) and login/logout where applicable. Verify **Origin** against a strict allowlist from configuration (scheme + host + port, not partial string matching).
2. Explicitly document behavior for **missing**, `null`, malformed, non-HTTPS (except local dev), and unexpected Origin. Default: reject unsafe cookie-authenticated browser requests with missing/untrusted Origin; if an existing approved trusted-server path omits Origin, exempt it based on verified **service identity**, not on spoofable headers.
3. Confirm `/api/proxy` preserves the browser Origin or a validated proxy-derived origin. Do not trust `X-Forwarded-Host`, `Referer`, or arbitrary forwarded origins without an authenticated proxy boundary.
4. Ensure CORS and credentialed cookie settings do not weaken the Origin protection. Read-only requests stay available, subject to session checks.
5. Centralize response codes and write safe audit events without leaking cookies or request bodies.

## Suggested implementation
- Reusable guard called before mutating route handlers, integrated with NJS-03 principal resolution.
- Integration tests covering real proxy/header behavior where test harness permits.

## Tests to add
- Trusted same-origin POST succeeds.
- Untrusted, missing, `null`, malformed Origin fails on unsafe methods.
- Prefix confusion (`good.example.evil.com`) and protocol/port mismatch fails.
- Trusted authenticated internal service-to-service call follows explicit non-browser policy, not a generic bypass.
- GET is not blocked by CSRF guard (but remains authenticated where required).

## Acceptance / stop conditions
- CSRF checks are enforced consistently on auth and state-changing endpoints.
- **Out of scope:** reworking browser sign-in, deploying WAF, creating a new CORS model outside existing approved proxy.
