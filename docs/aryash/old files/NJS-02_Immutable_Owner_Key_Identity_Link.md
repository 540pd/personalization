# NJS-02 — Immutable owner key and Google identity link


> **Claude Code implementation task — approved functional scope.** Work in the existing repository; do not create a parallel application. First inspect `CLAUDE.md`, package config, related routes/services/models/tests, and relevant checked-in architecture docs. Follow `../01_FROZEN_ARCHITECTURE_RULES.md` and `../02_SHARED_CONTRACTS.md` when supplied. Latest November HLD/LLD is authoritative. Implement **only this task**; use typed interfaces/stubs for out-of-scope dependencies. No deploy, no production IAM/data change, no auto-commit/push.
>
> **Final response requirement:** Report (1) what already existed, (2) changed files, (3) precise behavior, (4) tests run and results, (5) follow-on dependencies or decisions. Do not claim tests passed unless run.

## Goal and architectural location

After NJS-01 verifies Google issuer + `sub`, map the verified Google identity to a stable, random, **never-reused owner key**. The latest diagram stores users and identity links in **Firestore**, not BigQuery or client localStorage.

## Scope to implement
1. Examine current Firestore client/repository conventions. Add typed `User` and `IdentityLink` repositories and a single `findOrCreateOwner(verifiedIdentity)` service.
2. Use Google **issuer + subject**, never email, as the stable identity. Reference design: keyed `HMAC(iss, sub)` lookup with a versioned server-side secret, equivalent to the uploaded LLD's `identity_links/{hmac(iss, sub)}`. Keep the secret out of logs and source. If the repository already uses an approved equivalent, reuse it and document rotation/migration consequences.
3. Under an atomic Firestore transaction, if an existing link is found, return its stored owner key; otherwise generate a cryptographically random opaque owner key, create a user and its identity link exactly once.
4. Check owner status (`active`, `disabled` etc.) before returning an authenticated owner; a disabled account must not silently recreate as a new owner.
5. Avoid email-based merges: if email changes, the same `iss` + `sub` still maps to one owner. No automatic merging of different Google identities/accounts.
6. No owner key is accepted from client input; downstream handlers use session-resolved principal.

## Suggested documents (as in uploaded LLD)
```text
users/{owner_key}                       -> status, non-secret profile, timestamps
identity_links/{hmac(issuer, sub)}      -> owner_key, hmac_key_version
```
Match existing collection naming and Firestore rules. Do not make production schema or IAM changes automatically.

## Tests to add
- New verified identity creates exactly one link and owner, even under two parallel requests.
- Repeat login and changed email return the same owner key.
- Different subjects create different owner keys; no reuse.
- Disabled owner is blocked; orphaned/corrupt link fails safely.
- Transaction conflict/read failure does not create a partly linked user.
- Client-supplied owner key does not affect lookup.

## Acceptance / stop conditions
- Stable verified identity-to-owner mapping with concurrency-safe first login.
- No direct account linking by email; no owner key exposure to browser JSON.
- **Out of scope:** session cookie, disabling through an admin UI, broad Firestore migration, identity linking across multiple providers.
