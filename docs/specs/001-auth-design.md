# ADR 001 — Auth Design: Google OAuth + 30-day Session JWT

## Decision

Use a two-layer auth model:
1. **Google ID token** — short-lived (~1 hour), verified server-side by `google-auth-library`
2. **App session JWT** — 30-day, signed with `SESSION_SECRET`, stored as an HttpOnly cookie

## Why

Google caps their own tokens at ~1 hour. Without a session layer, every page reload (once the
in-memory token is gone) requires a fresh interactive Google sign-in, which is disruptive on a
canvas product where users may have a board open for hours.

A sliding 30-day session token lets users stay authenticated across a work session without
re-prompting. The token renews on every successful request (`POST /api/session/refresh`).

## Two-layer composition

`requireIdentity` middleware checks tokens in this order:
1. Session JWT (local HMAC verify — no network call, fast)
2. Google ID token (network call to Google's cert endpoint)

This means an active user rarely hits Google's certs on every request.

## Cloud Run service-to-service header split

When both frontend and backend are Cloud Run services, there is a header collision problem:
Cloud Run's IAM invoker check requires an OIDC infra token in `Authorization`. But that is
the same header the user's Google ID token would normally occupy.

Solution (borrowed from brand-play-space):
- Frontend proxy mints Cloud Run OIDC infra token → `Authorization: Bearer <infra-token>`
- User's real identity credential → `X-User-Identity: Bearer <user-token-or-session>`
- In local dev (no `K_SERVICE`): proxy forwards `Authorization` directly — no infra token, no collision

`requireIdentity.ts` reads `X-User-Identity` first, falls back to `Authorization`.

## Security properties

- Google ID token: memory-only on the frontend. Never written to localStorage, sessionStorage, or a cookie.
- Session JWT: HttpOnly cookie only. Not readable by JavaScript.
- Email domain allowlist: applied at every token verification, not just sign-in. Tightening the allowlist takes effect immediately for existing sessions.
- Anonymous mode: allowed only in local dev (no `K_SERVICE`, no `NODE_ENV=production`). Deployed without OAuth → refuse to start.

## Reference

Implementation: `backend/src/middleware/requireIdentity.ts`, `backend/src/lib/sessionToken.ts`
Pattern source: brand-play-space `requireIdentity.ts`
