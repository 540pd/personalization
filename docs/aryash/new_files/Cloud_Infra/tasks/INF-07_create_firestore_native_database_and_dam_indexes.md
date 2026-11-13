# INF-07 — Create Firestore native database and DAM indexes

> **Claude Code — atomic implementation prompt.** The team reports `NJS-01..08` and `PY-01..04` are already done; **do not recreate them**. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/05_SCHEMA_REVIEW.md` and `../../Environment/VARIABLE_MATRIX.md`, along with real repository `CLAUDE.md`, routes, models and tests. Implement only this task; preserve existing code conventions. Never apply GCP production changes, IAM bindings or migrations without explicit approval; no auto-commit or git push.

**Status:** NEW — one-image, no-agent MVP.  **Dependencies:** INF-01.

## Goal and exact stores

Touch only: `dam_assets` (Firestore), `dam_asset_files` (Firestore), `dam_asset_classification` (Firestore), `dam_asset_lineage` (Firestore), `dam_asset_state` (Firestore), `dam_product_images` (Firestore), `dam_logos` (Firestore), `dam_adapt_from` (Firestore), `dam_style_examples` (Firestore), `dam_references` (Firestore), `dam_guidelines` (Firestore), `asset_links` (Firestore), `asset_feedback` (Firestore), `product_sets` (Firestore), `dam_context` (Firestore), `user_asset_preferences` (Firestore), `upload_reservations` (Firestore).

## Instructions to implement

- [ ] Create native Firestore DB, collection/index documentation and composite indexes for userKey+kind/source pagination and asset_links/feedback lookups.
- [ ] Document all 17 exact collection names; create documents on first write as appropriate (Firestore has no pre-created SQL tables).
- [ ] Keep one-to-one property docs keyed by assetId; no duplicate storage locator in dam_assets.

## Tests / proof of completion

- [ ] Collection inventory exactly 17.
- [ ] Example scoped list/get queries pass emulator index checks.

## Acceptance and boundaries

- Keep exact v8 entity/field names; do not add a new table/collection merely to make this task easier.
- Reject cross-user access by server-derived `userKey`; `brandId` and future roles do not authorize reads/writes in this phase.
- Do not implement ADK, MCP, agent tools, DAG execution, multi-image or RBAC enforcement. If behavior requires a future component, use a narrow interface/mocked dependency and document it.
- Report: changed files, behavior, exact schema touched, tests run (with output), and remaining blockers. Never claim tests passed without running them.
