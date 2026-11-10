# Frozen development rules — scope approved in this task pack

## Architecture boundaries
- **Browser:** Next.js Playspace / Skills Studio calls the **Node.js BFF** via same-origin `/api/proxy`; browser stores only the BFF session cookie after sign-in. The diagram calls for the Google sign-in ID token to be discarded after login.
- **Node.js BFF on Cloud Run:** Google Sign-In verification; owner identity and session; CSRF Origin checks; request admission, run idempotency, Playspace lock, ownership/lineage; private FastAPI service client. The BFF is the browser's trust boundary.
- **FastAPI control plane on Cloud Run:** Direct synchronous Skills CRUD, idempotent publishing, approved-tool validator, and AI Skill creation helper. Accept internal service-authenticated requests only.
- **Agent Registry:** Canonical source of published `SKILL.md` content and immutable Skill revisions; pinned agent definitions; approved MCP catalog. **Never maintain a second published Skill/version history in GCS.**
- **Firestore in the current diagrams:** Operational transactional data: users, identity links, hashed sessions, per-owner/Playspace lock and session mapping, idempotency, asset records. The previous GCS-only primary-state proposal is superseded for this task pack by the uploaded November architecture.
- **GCS:** Private input assets, immutable manifests, and create-only output slots; **not** the canonical Registry content store.
- **BigQuery:** Append-only job and slot status events; **not** a transactional lock service.
- **Cloud Tasks, LRO dispatcher, Agent Engine:** Shown as later stages and **not authorized for implementation by these files**.

## Approved security invariants
1. Verify **Google ID token** signature, issuer, audience, expiry, `email_verified` where relevant, and `hd` against configured Workspace domain allowlist. Never trust email suffix in place of `hd`.
2. Create a non-reusable random **owner key** linked to the verified Google issuer and `sub` (not email). Never accept an owner key from a browser as authorization evidence.
3. Use an opaque, high-entropy, **revocable** cookie session. Persist only a session hash. Enforce idle and absolute expiry on every authorization decision, including after refresh. Logout and disable must invalidate access.
4. Use CSRF Origin verification on unsafe cookie-authenticated browser requests, with explicit approved origins; the proxy forwards the original Origin.
5. One idempotency key per Run click; exact replays return the same in-flight/accepted job; same key with a different payload fails. The prior finalized 7-day window is available as a candidate policy; treat any mismatch with current repo/config as a review item.
6. One active run per Playspace admission. A **worker heartbeat lease expiry is not the same thing as terminal job completion**; do not let a second run in simply because the worker lease expired.
7. Check ownership of asset IDs, Skill IDs, Playspace, parent jobs, lineage and selected reference revisions before submitting execution. Do not accept arbitrary GCS paths from the browser.
8. Node-to-FastAPI uses a Google-signed **service identity / OIDC ID token** with FastAPI service URL as audience; no browser Google tokens are forwarded. The trusted, session-derived owner key is passed in the internal request body.
9. No unauthenticated real generation. Never log plaintext cookies, Google tokens, user prompts, sensitive asset contents or unredacted Skills.

## Existing reference limits (verify against checked-in policy before coding)
- Up to 5 reference images total (1 main plus up to 4 others); PNG/JPEG/WebP, max 10 MiB/image and 16 megapixels.
- Up to 5 selected Skills per generation request; 100 KiB per Skill, 300 KiB raw combined, 30,000-character effective instruction budget.
- Prior approved overall image-output count: 1–10; session-level and global resource constraints are separate from the one-job-per-Playspace lock.
- 15 s job acceptance, 240 s model call, 25 min max job; **these are not implemented by the current task pack**.
- The current reference depicts 60 s runtime claim leases with 15 s heartbeat, and a 90-day ADK session TTL; these are owned by the future runtime team.

## Mandatory implementation behavior for Claude Code
- Search the repository first; integrate into existing Node Express/TypeScript and Python FastAPI conventions, tests, auth libraries, middleware, validation and logging. Do not scaffold a new app if one exists.
- Prefer explicit layers: routes, validators, domain services, typed repositories, adapters. Write small interfaces so the future orchestration runtime can integrate without rewriting these modules.
- Implement only what the assigned task authorizes. Where another task will provide a dependency, use a minimal typed interface or test double, not an unapproved production implementation.
- Confirm transaction semantics, uniqueness, retries, cleanup, and failure recovery. Fail closed on identity or ownership ambiguity.
- Any API paths, status codes, error names, data store collection layouts, or SDK calls not frozen in the source diagrams are **proposals**: reuse established repo contracts first; document proposed changes before integration.
