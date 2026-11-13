# Suggested development sequencing and task ownership

## Phase A — Node identity boundary

1. **NJS-01** Verify Google ID token (no Firestore mutation). Output: verified identity type.
2. **NJS-02** Map verified issuer/subject to owner key (transactional Firestore link).
3. **NJS-03** Create/resolve/revoke session and disable user; depends on NJS-01/02.
4. **NJS-04** CSRF Origin middleware; can be developed alongside NJS-02/03, but integrated with session routes after NJS-03.

## Phase B — Node admission boundary

5. **NJS-07** Ownership, asset and lineage validation. Can progress in parallel with NJS-05/06 using repository interfaces.
6. **NJS-05 + NJS-06** Idempotency record **and** Playspace lock must share an atomic transaction/integration contract. Assign one engineer as integration owner; avoid separate concurrent commits to the same admission service.
7. **NJS-08** Private FastAPI service client. Can be developed in parallel after internal request schema is agreed; integrate after NJS-05/06/07.

## Phase C — FastAPI Skills plane

8. **PY-03** Approved tool catalog validator (independent unit testing).
9. **PY-01** Logical Skills CRUD; design a Registry adapter and owner authorization; depends on PY-03 for content validation.
10. **PY-02** Idempotent publish, revision pinning; extends PY-01 and PY-03 (must not bypass either).
11. **PY-04** AI Skill creation helper; must invoke PY-03 validation, **not** auto-publish, and use PY-02 only after explicit later user action.

## Integration points and sign-off
- **Identity:** verify that Next.js `/api/proxy` forwards Origin, cookie, and correctly delivers Set-Cookie to the browser. Proxy changes are **integration requirements**, not permission for a broader frontend redesign.
- **State:** Firestore is the transactional store per the uploaded November diagrams; enforce role/IAM without deploying new rules without authorization.
- **Service caller:** FastAPI must verify Cloud Run service-to-service identity; NJS-08 is **not secure by itself** if FastAPI does not enforce it. Include a minimal contract/security test in FastAPI's existing middleware.
- **Skills:** Registry SDK name/capabilities, approved MCP catalog lookup, and unpublished-draft persistence must be verified before selecting concrete adapters. Where absent, complete noncontroversial domain logic and clearly flag the integration dependency.
- **Admission:** A reliable run reservation requires stable request/job IDs and future dispatcher deduplication. Do not mark end-to-end dispatch complete in this pack.

## PR acceptance checklist for each task
- [ ] Existing code reused and competing implementations removed or clearly isolated
- [ ] Types/schema and domain validations covered
- [ ] Happy path and at least 3 relevant failure/race tests pass
- [ ] Dependency unavailable behavior is safe
- [ ] Observability is redacted
- [ ] Contract changes explicitly documented
- [ ] No out-of-scope system changed
- [ ] No production deployment / IAM / schema migration executed without authorization
