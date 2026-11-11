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
re-prompting. The token renews itself once a day while in use (see Session cookie below).

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

`requireIdentity.ts` reads the user's bearer token from `X-User-Identity`; locally it falls back to
`Authorization`. Deployed it never does: there `Authorization` is the infra token.

## Session cookie

- `POST /api/session/refresh` (with the Google ID token as a bearer) sets `gcos_session`:
  HttpOnly, `SameSite=Lax`, `Secure` in production, path `/`, 30 days.
- A request with no bearer token is identified by that cookie, so a reload needs no Google prompt.
  A bearer token wins when both come, so a fresh sign-in is never blocked by an expired cookie.
- Sliding renewal: a cookie more than a day old is re-issued on its next request.
- `POST /api/session/sign-out` clears it. The JWT stays valid until it expires (no session store).
- The proxy forwards only this cookie to the backend, and never as a credential header.

## Security properties

- Google ID token: memory-only on the frontend. Never written to localStorage, sessionStorage, or a cookie.
- Session JWT: HttpOnly cookie only. Not readable by JavaScript.
- Email domain allowlist: applied at every token verification, not just sign-in. Tightening the allowlist takes effect immediately for existing sessions.
- Owner keys (#488): each verified Google sign-in finds or creates the account's owner: a random key in `users/{ownerKey}`, reached through `identity_links/{v<n>_HMAC(iss, sub)}` keyed with `IDENTITY_LINK_HMAC_KEY` (`backend/src/lib/identity/`). Email is profile only, so a changed email keeps the owner and accounts never merge. A disabled owner gets `403 account_disabled`; the store failing gets `503` and no session. The key stays server-side (`req.identity.ownerKey`); data is still keyed by email until the migration issue.
- CSRF (#490): a POST, PUT, PATCH or DELETE carrying the session cookie, and every `/api/session/*` call, needs an `Origin` exactly in `ALLOWED_ORIGINS` (`backend/src/middleware/requireTrustedOrigin.ts`); the proxy forwards the browser's. Missing, `null`, malformed or other origins get `403 origin_not_allowed`. Bearer-only calls and Cloud Tasks' OIDC route have no cookie to forge and pass. No header stands in for `Origin`.
- Google ID token (#487): besides signature, audience and expiry, the token must name a Google issuer and a subject, have `email_verified`, and carry a Workspace domain (`hd`) in `ALLOWED_HOSTED_DOMAINS`. The email suffix is checked too, never instead of `hd`, so a personal Google account is refused. One verifier: `backend/src/lib/googleIdToken.ts`.
- Anonymous mode: allowed only in local dev (no `K_SERVICE`, no `NODE_ENV=production`). Deployed without OAuth → refuse to start.

## Reference

Implementation: `backend/src/middleware/requireIdentity.ts`, `backend/src/lib/sessionToken.ts`
Pattern source: brand-play-space `requireIdentity.ts`
