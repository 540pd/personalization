# Schema / implementation decision checkpoint (do not silently resolve)

These source issues are explicitly preserved rather than silently fixed. Claude Code should resolve against **real repository migrations and owner approval**, writing down canonical column choices before running migrations.

1. `board_content` lists `nodes_json`, `edges_json`, `viewport_json` **and** `nodes`, `edges`, `viewport`; physical alias/duplication decision required. One persisted canonical form recommended, but original field dictionary remains as supplied.
2. `users` lists `default_brand_id` and `primary_brand_id`; `brand_settings` lists `description` and `brand_description`; `skill_registry_links` has `approved_revision_ref`, `latest_approved_revision`, `registry_revision`; preserve all source definitions, choose canonical mapping explicitly.
3. `login_sessions.ttl_at` and `idempotency_keys.ttl_at` say Firestore TTL in inherited description, yet now live in Cloud SQL; must implement app-enforced expiry and choose SQL cleanup mechanism separately. Never claim Cloud SQL supports Firestore TTL.
4. Several rows are legacy labels rather than valid physical identifiers: `createdAt / updatedAt`, `width? / height?`, `toneTags / styleTags`, `nodeId? / slotIndex?`, `brief.*` subkeys. Keep semantic mapping but don't generate malformed SQL/Firestore field names from labels.
5. `dam_assets.details` stays in preserved v8 dictionary, but details moved to six typed collections. Do not repopulate a large details map; record legacy migration/read compatibility only if real old documents exist.
6. `brandId` is nullable **user-owned metadata** in v8. Do not convert to shared Brand authorization, although older GCOS notes might discuss Brand-level sharing.
7. `board_runtime` ADK session fields are kept as nullable schema-only placeholders. Do not implement creation/refresh/cleanup until ADK phase.
8. v8 `gcs_output.writer` says Artifact MCP; this phase explicitly excludes MCP, so direct Python GCS client is a temporary drop-in adapter using the **same object contract**.
9. `slot_index=0` for single output is a proposed integration convention in this task pack, not a field default stated in v8. Confirm with existing client convention; if one-based already approved, alter only integration contract consistently.
10. The provided environment inventory describes a checkout with Node JWT sessions and Node Vertex calls, while the team reports NJS-01..08 and PY-01..04 completed. Do not assume that inventory proves the current branch state; inspect actual repo before editing.
11. Cloud Tasks-only: no scheduler/reconciler. Identify manual operational handling for enqueue-orphaned or retry-exhausted jobs; Cloud Tasks cannot recover a job after successful 2xx ack.
12. Exact Python image model ID/region and published Skills direct prompt merging behavior must be verified in running project; do not invent an available model name.
13. `role_policies`, `brand_memberships.role_code`, `skill_grants`, `approval.*` stored only; no RBAC/approval gating.
14. `bq_status_views` is **logical views**, not a fourth physical table. Any view dedup/fence logic must be compared against authoritative SQL attempt and valid existing events.

When a decision blocks a task, complete the safe scaffolding/tests, document the precise unresolved contract, and STOP before destructive schema changes or a guessed security policy.
