# GCOS Personalization — Modular Firestore DAM Data Model v8

## Design decision

The existing 65-field `dam_assets` block is decomposed into an asset index, four one-to-one DAM property collections, and six type-specific collections. The **entire field inventory from v7 is preserved**: 65 source field rows, including legacy duplicates/aliases, are allocated to the new entities without dropping definitions. The six original `details.*` groups become their own typed records.

**Storage split:** Cloud SQL for identity and transactional state; Firestore for DAM and all asset-related records; BigQuery for execution events; one private GCS bucket with `input/` and `output/`. Google Agent Registry remains source of truth for published Skills.

**Identity:** userKey remains the principal for the current MVP; brandId is nullable for user-owned records. Future roles may be represented in Cloud SQL but RBAC enforcement is not implemented.

## Firestore collections: relationships

Each typed DAM detail document uses the same `assetId` as its canonical `/dam_assets/{assetId}` record. Node enforces the relationship and asset kind. Firestore does not enforce foreign keys or join documents automatically. A detail collection should have at most one record per assetId, and only the one corresponding to the asset kind.

| Collection | Purpose | Original v7 fields | Fields in new block |
|---|---|---:|---:|
| `dam_assets` | Canonical asset index: one record per input upload or captured generated image; IDs and user scope only. | 13 | 13 |
| `dam_asset_files` | One-to-one verified file locator; input/output bytes stored in the same private bucket. | 11 | 12 |
| `dam_asset_classification` | One-to-one searchable autoTags / tone / style / persona and metadata provenance. | 9 | 10 |
| `dam_asset_lineage` | One-to-one link to campaign, job, node, input assets, source references. | 7 | 8 |
| `dam_asset_state` | One-to-one capture state, approval, lifecycle and agent retrieval eligibility. | 9 | 10 |
| `dam_product_images` | Typed detail collection for productImage assets, one-to-one by assetId. | 3 | 4 |
| `dam_logos` | Typed detail collection for logo assets, one-to-one by assetId. | 2 | 3 |
| `dam_adapt_from` | Typed detail collection for adaptFrom assets, one-to-one by assetId. | 3 | 4 |
| `dam_style_examples` | Typed detail collection for styleExample assets, one-to-one by assetId. | 2 | 3 |
| `dam_references` | Typed detail collection for reference assets, one-to-one by assetId. | 3 | 4 |
| `dam_guidelines` | Typed detail collection for guidelines assets, one-to-one by assetId. | 3 | 4 |

**Field preservation check:** 65 / 65 original DAM field rows included. Added 10 `assetId` join keys; no original entries removed.

## Why a shared asset index is still useful

Searching across all asset kinds stays a single canonical user-scoped query (`/dam_assets` filtered by `userKey`). GCS bucket/object/generation live in the `dam_asset_files` one-to-one document. Type-specific information belongs only to `dam_product_images`, `dam_logos`, `dam_guidelines`, `dam_references`, `dam_style_examples`, or `dam_adapt_from`. For performance, the application can fetch the index first and lazily resolve property/detail documents; it must not perform six collection queries for every list view.

## Important write and integrity rules

1. On Playspace or Assets-page upload, Node generates `assetId`, verifies `userKey`, writes original bytes to `input/users/{userKey}/assets/{assetId}/original.{ext}`, then creates the canonical index and applicable file/metadata/type records. Partial writes must be safely retried or cleaned up.
2. `uploadOrigin=playspace` versus `assets_page` records the source. An asset saved to the Assets page reuses its existing object locator; it does not upload bytes again.
3. ADK generates an image via Artifact MCP, which writes once under `output/users/{userKey}/runs/{jobId}/attempts/{attemptNo}/nodes/{nodeId}/slots/{slotIndex}.{ext}`. Event MCP writes the accepted `slot_ready` event to BigQuery.
4. On user save/reaction/approval, Node captures the ready output into the canonical DAM index, file locator and metadata/lineage/state documents. `asset_feedback` stores per-user reaction. No GCS copy or additional image generation is required.
5. Never store an unverified GCS generation as though the object is committed. Authorize private reads using `userKey` before proxying bytes.
6. For the current MVP, do not imply that a nonnull `brandId` grants shared access. Future Brand sharing requires an explicit access policy.
7. Cloud SQL / Firestore changes are not atomic across products. Use idempotency and compensating retry logic when a workflow writes both.

## One private GCS bucket

```text
gcos-personalization-{env}/
  input/users/{userKey}/assets/{assetId}/original.{ext}
  input/users/{userKey}/guidelines/{assetId}/source.{ext}
  input/users/{userKey}/runs/{jobId}/manifest.json
  input/users/{userKey}/runs/{jobId}/plan.json
  input/users/{userKey}/boards/{boardId}/snapshots/{revision}.json
  output/users/{userKey}/runs/{jobId}/attempts/{attemptNo}/nodes/{nodeId}/slots/{slotIndex}.{ext}
```

## Full schema field dictionary

These tables show field name, field type, and description. No Required/Optional column is included. Field names from the old embedded `details.*` maps are now names within their typed collections.

### `users` — Cloud SQL

Previous schema: `users`.

| Field | Type | Description |
|---|---|---|
| `user_key (PK)` | `VARCHAR(64)` | Immutable canonical GCOS account identifier; always required |
| `primary_email` | `TEXT` | Verified email for display/contact only; never an ownership key |
| `display_name?` | `TEXT` | User display name |
| `status` | `TEXT` | active / disabled / pending |
| `default_brand_id?` | `VARCHAR(64)` | Nullable pointer for future Brand assignment |
| `created_at` | `TIMESTAMPTZ` | Created by server |
| `updated_at` | `TIMESTAMPTZ` | Last account update |
| `email_verified` | `BOOLEAN` | Google verified identity flag |
| `primary_brand_id` | `TEXT NULL` | Default Brand; not an implicit access grant |
| `auth_issuer` | `TEXT` | Trusted OIDC issuer |
| `last_login_at` | `TIMESTAMPTZ` | Last successful sign-in |

### `identity_links` — Cloud SQL

Previous schema: `identity_links`.

| Field | Type | Description |
|---|---|---|
| `identity_hash (PK)` | `TEXT` | HMAC of verified OIDC issuer and subject |
| `user_key (FK)` | `VARCHAR(64)` | References users.user_key |
| `issuer` | `TEXT` | Trusted Google OIDC issuer |
| `status` | `TEXT` | active / disabled |
| `created_at` | `TIMESTAMPTZ` | Creation time |
| `last_verified_at` | `TIMESTAMPTZ` | Most recent sign-in verification |
| `issuer_sub_hash` | `TEXT` | HMAC of OIDC issuer + stable sub; document ID |
| `sub_hash` | `TEXT` | HMAC identity handle; avoid storing full sub if unnecessary |
| `email_at_link` | `TEXT NULL` | Diagnostic only; never ownership |

### `login_sessions` — Cloud SQL

Previous schema: `login_sessions`.

| Field | Type | Description |
|---|---|---|
| `session_hash (PK)` | `TEXT` | Hash of opaque HttpOnly session token |
| `user_key (FK)` | `VARCHAR(64)` | References users.user_key |
| `issued_at` | `TIMESTAMPTZ` | Session creation |
| `last_seen_at` | `TIMESTAMPTZ` | Throttled idle activity |
| `idle_expires_at` | `TIMESTAMPTZ` | Idle expiry checked by Node |
| `absolute_expires_at` | `TIMESTAMPTZ` | Hard expiry checked by Node |
| `revoked_at?` | `TIMESTAMPTZ` | Null until logout/disable |
| `status` | `TEXT` | active / revoked |
| `ttl_at` | `TIMESTAMPTZ` | Firestore TTL cleanup, not authorization |
| `user_agent_hash` | `TEXT NULL` | Privacy-safe diagnostics |

### `brands` — Cloud SQL

Previous schema: `brands`.

| Field | Type | Description |
|---|---|---|
| `brand_id (PK)` | `VARCHAR(64)` | Stable Brand identifier; key required only for Brand records |
| `owner_user_key (FK)` | `VARCHAR(64)` | Future Brand creator/owner reference |
| `name` | `TEXT` | Brand display name |
| `status` | `TEXT` | active / suspended / archived |
| `created_at` | `TIMESTAMPTZ` | Creation time |
| `slug` | `TEXT` | Display route identifier, never authorization |
| `default_settings_ref` | `TEXT` | brand_settings document ID |
| `default_assets_ref` | `TEXT` | brandAssets document ID |
| `updated_at` | `TIMESTAMPTZ` | Updated |
| `revision` | `BIGINT` | Tenant settings CAS |
| `schema_version` | `BIGINT` | Schema revision |

### `brand_memberships` — Cloud SQL

Previous schema: `brand_memberships`.

| Field | Type | Description |
|---|---|---|
| `membership_id (PK)` | `VARCHAR(128)` | Unique user-Brand association |
| `user_key (FK)` | `VARCHAR(64)` | References users.user_key |
| `brand_id (FK)` | `VARCHAR(64)` | References brands.brand_id; required if membership exists |
| `role_code?` | `TEXT` | Stored now / four role labels; NOT enforced in current MVP |
| `status` | `TEXT` | pending / active / revoked |
| `created_at` | `TIMESTAMPTZ` | Invitation or membership record time |
| `role` | `TEXT` | Initial role |
| `custom_allow` | `JSONB` | Explicit allow overrides, admin-controlled |
| `custom_deny` | `JSONB` | Explicit deny overrides take precedence |
| `invited_by_user_key` | `TEXT NULL` | Invitation audit |
| `joined_at` | `TIMESTAMPTZ` | Activation time |
| `revoked_at` | `TIMESTAMPTZ` | Revocation time |
| `revision` | `BIGINT` | Policy CAS |
| `updated_at` | `TIMESTAMPTZ` | Server timestamp |

### `role_policies` — Cloud SQL

Previous schema: `role_policies`.

| Field | Type | Description |
|---|---|---|
| `role_id` | `TEXT` | Role name |
| `policy_version` | `BIGINT` | Version pinned in current session authorization |
| `permissions` | `JSONB` | Server-defined allowable operations |
| `description` | `TEXT` | UI label |
| `managed_by` | `TEXT` | Governance mode |
| `updated_at` | `TIMESTAMPTZ` | Change audit |

### `brand_settings` — Cloud SQL

Previous schema: `brand_settings`.

| Field | Type | Description |
|---|---|---|
| `settings_id (PK)` | `VARCHAR(64)` | Stable settings record |
| `user_key (FK)` | `VARCHAR(64)` | Current owner; required |
| `brand_id?` | `VARCHAR(64) NULL` | Optional future Brand association; not an authorization grant. Reserved optional future Brand association |
| `brand_name?` | `TEXT` | Current working Brand name |
| `industry?` | `TEXT` | Brand industry |
| `description?` | `TEXT` | Approved Brand description |
| `default_logo_asset_id?` | `VARCHAR(64)` | Logical reference to Firestore dam_assets |
| `guideline_asset_ids` | `JSONB` | Array of logical DAM asset IDs |
| `market?` | `TEXT` | Optional market |
| `language?` | `TEXT` | Optional language |
| `revision` | `BIGINT` | Optimistic concurrency version |
| `updated_at` | `TIMESTAMPTZ` | Latest settings update |
| `homepage_url` | `TEXT NULL` | Future/disabled analysis input; never fetch without validation |
| `default_market` | `TEXT` | Current fixed Europe, editable later |
| `default_language` | `TEXT` | Current fixed English, editable later |
| `brand_description` | `TEXT NULL` | Approved Brand-level descriptor |
| `default_guideline_asset_ids` | `JSONB` | References to existing guidelines assets |
| `schema_version` | `BIGINT` | Schema revision |
| `updated_by_user_key` | `TEXT` | Last editor |

### `campaign_briefs` — Cloud SQL

Previous schema: `campaign_briefs`.

| Field | Type | Description |
|---|---|---|
| `brief_id (PK)` | `VARCHAR(64)` | Campaign/brief ID |
| `user_key (FK)` | `VARCHAR(64)` | Owner; required |
| `brand_id?` | `VARCHAR(64) NULL` | Optional future Brand association; not an authorization grant. Future Brand association |
| `board_id?` | `VARCHAR(64)` | Optional board association |
| `name` | `TEXT` | Campaign display name |
| `status` | `TEXT` | draft / active / archived |
| `brief_json` | `JSONB` | Objective, audience, messaging, tones, legal, guardrails |
| `persona_snapshot?` | `JSONB` | Campaign target audience context (not personal identity) |
| `reference_asset_ids` | `JSONB` | References to DAM asset IDs only |
| `revision` | `BIGINT` | CAS of saved brief |
| `created_at` | `TIMESTAMPTZ` | Creation time |
| `updated_at` | `TIMESTAMPTZ` | Last edit |
| `created_by_user_key` | `TEXT` | Creator |
| `brief.objective` | `TEXT` | Campaign objective |
| `brief.audience` | `TEXT` | Current free text target audience |
| `brief.insight` | `TEXT` | Audience insight |
| `brief.message` | `TEXT` | Key message |
| `brief.tones` | `JSONB` | Up to 3 selected via UI |
| `brief.offer` | `TEXT` | Offer text |
| `brief.mandatory.product` | `BOOLEAN` | Product must appear |
| `brief.mandatory.logo` | `BOOLEAN` | Logo must appear |
| `brief.mandatory.cta` | `BOOLEAN` | CTA required |
| `brief.mandatory.legal` | `BOOLEAN` | Legal copy required |
| `brief.cta_text` | `TEXT` | Call to action |
| `brief.legal_text` | `TEXT` | Legal copy |
| `brief.dos` | `TEXT` | Do guardrails |
| `brief.donts` | `TEXT` | Do not guardrails |
| `brief.reference_ids` | `JSONB` | Picked creative reference asset IDs |
| `persona_snapshot.label` | `TEXT NULL` | Target campaign persona, not user identity |
| `persona_snapshot.tags` | `JSONB` | Derived prompt/campaign persona tags |
| `market` | `TEXT` | Current fixed Europe; future editable |
| `language` | `TEXT` | Current fixed English; future editable |
| `updated_by_user_key` | `TEXT` | Last editor |

### `boards` — Cloud SQL

Previous schema: `boards`.

| Field | Type | Description |
|---|---|---|
| `board_id (PK)` | `VARCHAR(64)` | Playspace ID |
| `user_key (FK)` | `VARCHAR(64)` | Current owner; required |
| `brand_id?` | `VARCHAR(64) NULL` | Optional future Brand association; not an authorization grant. Future Brand association |
| `title` | `TEXT` | Board name |
| `active_brief_id?` | `VARCHAR(64)` | References campaign_briefs.brief_id |
| `content_revision` | `BIGINT` | Current board content CAS version |
| `status` | `TEXT` | active / archived |
| `created_at` | `TIMESTAMPTZ` | Creation time |
| `updated_at` | `TIMESTAMPTZ` | Last edit |
| `created_by_user_key` | `TEXT` | Creator |
| `execution_mode` | `TEXT` | Default board run mode |
| `last_opened_at` | `TIMESTAMPTZ` | User activity |

### `board_content` — Cloud SQL

Previous schema: `board_content`.

| Field | Type | Description |
|---|---|---|
| `board_id (PK,FK)` | `VARCHAR(64)` | One content record per boards.board_id |
| `user_key (FK)` | `VARCHAR(64)` | Current owner; required |
| `nodes_json` | `JSONB` | Node types, asset IDs, coordinates, node data |
| `edges_json` | `JSONB` | Canvas connections, handles |
| `viewport_json?` | `JSONB` | Pan and zoom |
| `revision` | `BIGINT` | CAS version |
| `large_snapshot_gcs_ref?` | `TEXT` | Optional GCS board snapshot if JSON becomes large |
| `updated_at` | `TIMESTAMPTZ` | Last board save |
| `brand_id` | `VARCHAR(64) NULL` | Optional future Brand association; not an authorization grant. Tenant guard in subdoc |
| `nodes` | `JSONB` | Types and serialized coordinates/content; keep bounded |
| `edges` | `JSONB` | Connections and handles |
| `viewport` | `JSONB` | Pan/zoom |
| `node_input_asset_ids` | `JSONB` | Derived stable IDs for link checks |
| `last_saved_by_user_key` | `TEXT` | Editor |
| `schema_version` | `BIGINT` | Serialization version |

### `board_runtime` — Cloud SQL

Previous schema: `board_runtime`.

| Field | Type | Description |
|---|---|---|
| `board_id (PK,FK)` | `VARCHAR(64)` | One runtime mapping per board |
| `user_key (FK)` | `VARCHAR(64)` | Owner of execution context |
| `adk_session_id?` | `TEXT` | One ADK session per Playspace; lazy bind |
| `session_generation` | `BIGINT` | Session mapping CAS version |
| `current_job_id?` | `VARCHAR(64)` | Current accepted Run |
| `lock_owner_job_id?` | `VARCHAR(64)` | Run holding board lock |
| `lock_fence` | `BIGINT` | Monotonic lock fencing token |
| `lock_expires_at?` | `TIMESTAMPTZ` | Lock expiry checked by app |
| `updated_at` | `TIMESTAMPTZ` | Last lock/session update |
| `brand_id` | `VARCHAR(64) NULL` | Optional future Brand association; not an authorization grant. Tenant |
| `adk_session_generation` | `BIGINT` | CAS generation on create/recreate |
| `session_bound_at` | `TIMESTAMPTZ` | Last successful bind |
| `session_expires_at` | `TIMESTAMPTZ` | Proposed 90-day TTL target |

### `skill_registry_links` — Cloud SQL

Previous schema: `skill_ownership`.

| Field | Type | Description |
|---|---|---|
| `skill_id (PK)` | `VARCHAR(64)` | GCOS Skill ID |
| `user_key (FK)` | `VARCHAR(64)` | Current creator/owner |
| `brand_id?` | `VARCHAR(64) NULL` | Optional future Brand association; not an authorization grant. Future Brand association |
| `registry_resource?` | `TEXT` | Google Agent Registry resource (null for unregistered drafts) |
| `approved_revision_ref?` | `TEXT` | Immutable published Registry revision |
| `display_name` | `TEXT` | Skill display label |
| `status` | `TEXT` | draft / published / disabled / archived |
| `created_at` | `TIMESTAMPTZ` | Creation time |
| `updated_at` | `TIMESTAMPTZ` | Last update |
| `created_by_user_key` | `TEXT` | Original author |
| `slug` | `TEXT` | Validated name |
| `description` | `TEXT` | Small metadata description |
| `latest_approved_revision` | `TEXT NULL` | Published immutable revision reference |
| `allowed_tool_ids` | `JSONB` | Approved tools pointers, no content |
| `revision` | `BIGINT` | Metadata CAS |
| `skill_instructions_summary` | `TEXT` | Short human-readable summary of what the Skill does and does not do; published instructions remain in Agent Registry. |
| `skill_type` | `TEXT` | e.g. background_swap, product_swap, recolor, guardrail, creative generation. |
| `registry_revision` | `TEXT` | Pinned immutable published Agent Registry revision reference. |
| `tool_catalog_refs` | `JSONB` | Approved MCP tool references associated with Skill, not duplicated tool implementations. |

### `skill_grants` — Cloud SQL

Previous schema: `skill_grants`.

| Field | Type | Description |
|---|---|---|
| `grant_id` | `TEXT` | Skill + user grant ID |
| `brand_id` | `VARCHAR(64) NULL` | Optional future Brand association; not an authorization grant. Brand |
| `skill_id` | `TEXT` | Owned Skill |
| `user_key` | `TEXT` | Grantee |
| `can_use` | `BOOLEAN` | Use capability |
| `can_edit` | `BOOLEAN` | Edit capability |
| `can_publish` | `BOOLEAN` | Publish capability, still subject to role policy |
| `status` | `TEXT` | Revocation |
| `granted_by_user_key` | `TEXT` | Authorizer |
| `updated_at` | `TIMESTAMPTZ` | Updated |

### `idempotency_keys` — Cloud SQL

Previous schema: `idempotency_keys`.

| Field | Type | Description |
|---|---|---|
| `key_hash (PK)` | `TEXT` | Unique per user + operation + original key |
| `user_key (FK)` | `VARCHAR(64)` | Required owner |
| `brand_id?` | `VARCHAR(64) NULL` | Optional future Brand association; not an authorization grant. Future Brand association |
| `operation` | `TEXT` | run / publish (expand only as used) |
| `request_hash` | `TEXT` | Canonical request fingerprint |
| `result_id?` | `VARCHAR(64)` | Accepted job ID or operation reference |
| `state` | `TEXT` | pending / committed / failed |
| `expires_at` | `TIMESTAMPTZ` | Application-enforced deduplication expiry |
| `created_at` | `TIMESTAMPTZ` | Created time |
| `ttl_at` | `TIMESTAMPTZ` | Background TTL; code checks expiresAt |

### `job_admissions` — Cloud SQL

Previous schema: `job_admissions`.

| Field | Type | Description |
|---|---|---|
| `job_id (PK)` | `VARCHAR(64)` | Node-issued Run ID |
| `user_key (FK)` | `VARCHAR(64)` | Initiating user; required |
| `brand_id?` | `VARCHAR(64) NULL` | Optional future Brand association; not an authorization grant. Reserved future Brand association |
| `board_id (FK)` | `VARCHAR(64)` | References boards.board_id |
| `brief_id?` | `VARCHAR(64)` | Campaign used for Run |
| `idempotency_key_hash` | `TEXT` | Reference to deduplication row |
| `request_hash` | `TEXT` | Canonical request hash |
| `manifest_gcs_ref` | `TEXT` | Immutable run manifest bucket/object/generation |
| `dispatch_state` | `TEXT` | reserved / enqueued / running / terminal |
| `task_name?` | `TEXT` | Cloud Tasks named task |
| `attempt_no` | `BIGINT` | Current accepted worker attempt |
| `lease_fence` | `BIGINT` | Current worker fencing token |
| `lease_expires_at?` | `TIMESTAMPTZ` | Worker lease expiration |
| `job_deadline_at` | `TIMESTAMPTZ` | Overall job deadline |
| `created_at` | `TIMESTAMPTZ` | Created time |
| `updated_at` | `TIMESTAMPTZ` | Last operational update |
| `manifest_bucket` | `TEXT` | Private run bucket |
| `manifest_object` | `TEXT` | Immutable manifest object name |
| `manifest_generation` | `TEXT NULL` | Confirmed manifest generation |
| `heartbeat_at` | `TIMESTAMPTZ` | Renewal time |
| `accept_deadline_at` | `TIMESTAMPTZ` | Admission budget |

### `audit_events` — Cloud SQL

Previous schema: `audit_events`.

| Field | Type | Description |
|---|---|---|
| `audit_event_id (PK)` | `VARCHAR(64)` | Immutable audit event ID |
| `user_key (FK)` | `VARCHAR(64)` | Acting user; service actions use explicit service identity |
| `brand_id?` | `VARCHAR(64) NULL` | Optional future Brand association; not an authorization grant. Optional future Brand context |
| `action` | `TEXT` | login / skill_publish / delete / approval etc. |
| `resource_type` | `TEXT` | Affected object type |
| `resource_id` | `VARCHAR(128)` | Affected object identifier |
| `result` | `TEXT` | success / denied / failed |
| `request_id?` | `VARCHAR(128)` | Trace correlation |
| `created_at` | `TIMESTAMPTZ` | Event time |
| `before_revision` | `BIGINT` | Prior version |
| `after_revision` | `BIGINT` | New version |
| `timestamp` | `TIMESTAMPTZ` | Server time |

### `dam_assets` — Firestore

Canonical asset index: one record per input upload or captured generated image; IDs and user scope only.

| Field | Type | Description |
|---|---|---|
| `assetId (document ID)` | `string` | Stable ID of uploaded/captured generated file |
| `userKey` | `string` | Required current ownership / query scope |
| `brandId?` | `string\|null` | Optional future Brand association; not an authorization grant. null |
| `createdByUserKey` | `string` | Provenance of creator; not authorization |
| `source` | `upload\` | generated |
| `kind` | `string` | productImage, logo, adaptFrom, styleExample, reference, guidelines, generatedCreative |
| `name?` | `string` | Human-readable name |
| `description?` | `string` | Asset metadata; no image bytes |
| `createdAt / updatedAt` | `timestamp` | Creation and last update |
| `details` | `map<string,string>` | Original kind-specific map; migrated into six typed detail collections linked by assetId. Legacy field kept in dictionary. |
| `createdAt` | `timestamp` | Created |
| `updatedAt` | `timestamp` | Last metadata write |
| `uploadOrigin` | `playspace\|assets_page\|null` | Where an original input was uploaded. |

### `dam_asset_files` — Firestore

One-to-one verified file locator; input/output bytes stored in the same private bucket.

| Field | Type | Description |
|---|---|---|
| `assetId (PK / logical FK)` | `string` | Document ID equals dam_assets.assetId; join key; one-to-one, not duplicated bytes. |
| `storage.bucket` | `string` | Private GCS bucket name |
| `storage.object` | `string` | Object name; owner-scoped canonical path |
| `storage.generation?` | `string\` | null |
| `mimeType` | `string` | Validated file content type |
| `sizeBytes` | `number` | Verified byte size |
| `width? / height?` | `number\` | null |
| `bytes` | `integer` | Immutable byte length |
| `storage.sha256` | `string` | Content integrity hash |
| `storage.width` | `integer\|null` | Image pixel width, currently not persisted |
| `storage.height` | `integer\|null` | Image pixel height, currently not persisted |
| `storage.prefix` | `input/\|output/` | One bucket; indicates original upload versus generated output. |

### `dam_asset_classification` — Firestore

One-to-one searchable autoTags / tone / style / persona and metadata provenance.

| Field | Type | Description |
|---|---|---|
| `assetId (PK / logical FK)` | `string` | Document ID equals dam_assets.assetId; join key; one-to-one, not duplicated bytes. |
| `autoTags` | `string[]` | Automatically derived creative labels |
| `toneTags / styleTags` | `string[]` | Creative tone and style labels |
| `personaTags` | `string[]` | Campaign target-persona labels, not sensitive identity inference |
| `metadataSource` | `string` | prompt/campaign derived vs verified observation |
| `styleTags` | `array<string>` | Creative style labels |
| `toneTags` | `array<string>` | Creative tone labels |
| `campaignType` | `string\|null` | Coarse marketing format/category |
| `metadataVersion` | `integer` | Generator tagging rules version |
| `metadataConfidence` | `number\|null` | Only meaningful when calibrated/verified |

### `dam_asset_lineage` — Firestore

One-to-one link to campaign, job, node, input assets, source references.

| Field | Type | Description |
|---|---|---|
| `assetId (PK / logical FK)` | `string` | Document ID equals dam_assets.assetId; join key; one-to-one, not duplicated bytes. |
| `campaignId?` | `string\` | null |
| `sourceJobId?` | `string\` | null |
| `nodeId? / slotIndex?` | `string / number` | Generated-output lineage |
| `derivedFromAssetIds` | `string[]` | Lineage parent asset IDs |
| `referenceAssetIds` | `string[]` | Inputs and contextual references |
| `provenance` | `map` | job/node/slot/attempt/input IDs |
| `supersedesAssetId` | `string\|null` | Binary replacement lineage |

### `dam_asset_state` — Firestore

One-to-one capture state, approval, lifecycle and agent retrieval eligibility.

| Field | Type | Description |
|---|---|---|
| `assetId (PK / logical FK)` | `string` | Document ID equals dam_assets.assetId; join key; one-to-one, not duplicated bytes. |
| `approval.state` | `string` | pending / approved / rejected / revoked; schema now, approval enforcement later |
| `approval.approvedByUserKey?` | `string\` | null |
| `approval.approvedAt?` | `timestamp\` | null |
| `dam.saved` | `boolean` | Single source for captured/searchable DAM state |
| `dam.contextAllowed` | `boolean` | Retrieval eligibility, separate from saved status |
| `state` | `string` | staged / active / archived / deleted |
| `metadataRevision` | `integer` | CAS on metadata changes |
| `deletedAt` | `timestamp\|null` | Tombstone date |
| `captureTrigger` | `save\|like\|dislike\|approve\|null` | How generated output was captured into searchable DAM. |

### `dam_product_images` — Firestore

Typed detail collection for productImage assets, one-to-one by assetId.

| Field | Type | Description |
|---|---|---|
| `assetId (PK / logical FK)` | `string` | Document ID equals dam_assets.assetId; join key; one-to-one, not duplicated bytes. |
| `imageType` | `string` | Packshot, hero, reference, angle, detail or variant; field applies when kind=productImage. |
| `view` | `string` | Front, side, back, top, three-quarter, close-up; field applies when kind=productImage. |
| `variant` | `string` | Variant or colourway; field applies when kind=productImage. |

### `dam_logos` — Firestore

Typed detail collection for logo assets, one-to-one by assetId.

| Field | Type | Description |
|---|---|---|
| `assetId (PK / logical FK)` | `string` | Document ID equals dam_assets.assetId; join key; one-to-one, not duplicated bytes. |
| `logoType` | `string` | Primary, secondary, monochrome, symbol or other; field applies when kind=logo. |
| `usage` | `string` | Default, light, dark, reference-only; field applies when kind=logo. |

### `dam_adapt_from` — Firestore

Typed detail collection for adaptFrom assets, one-to-one by assetId.

| Field | Type | Description |
|---|---|---|
| `assetId (PK / logical FK)` | `string` | Document ID equals dam_assets.assetId; join key; one-to-one, not duplicated bytes. |
| `name` | `string` | Custom creative name; field applies when kind=adaptFrom. |
| `creativeType` | `string` | Campaign key visual, hero, social, display or other; field applies when kind=adaptFrom. |
| `aspectRatio` | `string` | 1:1, 4:5, 9:16, 16:9 or other; field applies when kind=adaptFrom. |

### `dam_style_examples` — Firestore

Typed detail collection for styleExample assets, one-to-one by assetId.

| Field | Type | Description |
|---|---|---|
| `assetId (PK / logical FK)` | `string` | Document ID equals dam_assets.assetId; join key; one-to-one, not duplicated bytes. |
| `name` | `string` | Example display name; field applies when kind=styleExample. |
| `exampleType` | `string` | Social, campaign, product, layout, typography, logo usage; field applies when kind=styleExample. |

### `dam_references` — Firestore

Typed detail collection for reference assets, one-to-one by assetId.

| Field | Type | Description |
|---|---|---|
| `assetId (PK / logical FK)` | `string` | Document ID equals dam_assets.assetId; join key; one-to-one, not duplicated bytes. |
| `referenceType` | `string` | Background, mood, lighting, composition, styling, texture; field applies when kind=reference. |
| `use` | `string` | asIs or inspiration; field applies when kind=reference. |
| `scope` | `string` | always or picked; field applies when kind=reference. |

### `dam_guidelines` — Firestore

Typed detail collection for guidelines assets, one-to-one by assetId.

| Field | Type | Description |
|---|---|---|
| `assetId (PK / logical FK)` | `string` | Document ID equals dam_assets.assetId; join key; one-to-one, not duplicated bytes. |
| `title` | `string` | Guideline document title; field applies when kind=guidelines. |
| `docType` | `string` | Brand/visual/logo/typography/campaign guideline; field applies when kind=guidelines. |
| `note` | `string` | Document note; field applies when kind=guidelines. |

### `asset_links` — Firestore

Previous schema: `asset_links`.

| Field | Type | Description |
|---|---|---|
| `linkId (document ID)` | `string` | Stable asset-to-consumer link |
| `userKey` | `string` | Current owner |
| `brandId?` | `string\|null` | Optional future Brand association; not an authorization grant. null |
| `assetId` | `string` | References dam_assets |
| `consumerType` | `string` | product_set / campaign / board / run / asset |
| `consumerId` | `string` | Consumer identifier across stores |
| `purpose` | `string` | master / input / reference / output / guideline |
| `hardRetentionUntil?` | `timestamp\` | null |
| `createdAt` | `timestamp` | Creation time |
| `createdByUserKey` | `string` | Initiator |

### `asset_feedback` — Firestore

Previous schema: `asset_feedback`.

| Field | Type | Description |
|---|---|---|
| `feedbackId (document ID)` | `string` | Derived from userKey+assetId; one latest reaction per user/asset |
| `userKey` | `string` | Required user who gave feedback |
| `brandId?` | `string\|null` | Optional future Brand association; not an authorization grant. null |
| `assetId` | `string` | References Firestore dam_assets.assetId |
| `reaction` | `liked\` | disliked\ |
| `favorite` | `boolean` | Personal bookmark flag |
| `allowPersonalization` | `boolean` | Whether reaction can be used to learn preferences |
| `jobId?` | `string\` | null |
| `createdAt / updatedAt` | `timestamp` | Feedback lifecycle |
| `nodeId` | `string` | Original output node |
| `slotIndex` | `integer` | Original slot |
| `savedToDam` | `boolean` | Explicit save or auto capture on reaction |
| `revision` | `integer` | CAS |
| `createdAt` | `timestamp` | First feedback |
| `updatedAt` | `timestamp` | Last reaction change |

### `product_sets` — Firestore

Previous schema: `brandAssets`.

| Field | Type | Description |
|---|---|---|
| `productSetId (document ID)` | `string` | Stable product group ID |
| `userKey` | `string` | Required current owner |
| `brandId?` | `string\|null` | Optional future Brand association; not an authorization grant. null |
| `productName` | `string` | Product label |
| `sku?` | `string` | Optional SKU |
| `masterAssetId?` | `string\` | null |
| `assetIds` | `string[]` | References to images, logos, style, guidelines |
| `colours?` | `map` | Primary, secondary, accent |
| `createdAt / updatedAt` | `timestamp` | Tracking and audit |
| `revision` | `integer` | Saved page compare-and-swap |
| `record.productName` | `string` | Product Name, trim max 200 current |
| `record.sku` | `string` | SKU/Product ID max 100 current |
| `record.masterId` | `string\|null` | Master product assetId, required by UI for readiness |
| `record.colours.primary` | `hex string\|empty` | Primary, normalized #RRGGBB |
| `record.colours.secondary` | `hex string\|empty` | Secondary color |
| `record.colours.accent` | `hex string\|empty` | Accent color |
| `record.assetIds` | `array<string>` | Ordered membership; current API supports max 500 |
| `record.brandGuidelineIds` | `array<string>` | Optional typed denormalization, derived from assetIds |
| `updatedByUserKey` | `string` | Editor |
| `updatedAt` | `timestamp` | Save time |
| `schemaVersion` | `integer` | Schema revision |
| `kindAssignments` | `map` | Per-asset role / kind when grouped on Assets page. |

### `dam_context` — Firestore

Previous schema: `brand_context`.

| Field | Type | Description |
|---|---|---|
| `contextId (document ID)` | `string` | One current owner context per user |
| `userKey` | `string` | Required user |
| `brandId?` | `string\|null` | Optional future Brand association; not an authorization grant. null |
| `approvedCreativeTags` | `string[]` | Derived/approved themes |
| `approvedStyleTags` | `string[]` | Approved reference-style tags |
| `blockedTags` | `string[]` | Future Brand hard guardrails when governed |
| `evidenceAssetIds` | `string[]` | Assets supporting summary |
| `revision` | `number` | Monotonic revision |
| `updatedAt` | `timestamp` | Last update |
| `lastComputedAt` | `timestamp` | Summary freshness |
| `updatedByUserKey` | `string` | Approver |

### `user_asset_preferences` — Firestore

Previous schema: `user_creative_preferences`.

| Field | Type | Description |
|---|---|---|
| `userKey (document ID)` | `string` | Required owner and preference aggregation scope |
| `brandId?` | `string\|null` | Optional future Brand association; not an authorization grant. null |
| `enabled` | `boolean` | User preference aggregation opt-in |
| `preferredTags / avoidedTags` | `string[]` | Derived signals, not mandatory hard blocks |
| `preferredStyles / preferredTones` | `string[]` | Creative preference summaries |
| `evidenceCount` | `number` | Number of eligible feedback records |
| `lastComputedAt?` | `timestamp\` | null |
| `sourceEventWatermark?` | `timestamp\` | null |
| `revision` | `number` | Computation/update version |
| `brandUserId` | `string` | Deterministic user + brand ID |
| `preferredTags` | `array<string>` | Derived positive aggregate, with provenance |
| `avoidedTags` | `array<string>` | Derived negative evidence, not global hard bans |
| `preferredStyles` | `array<string>` | Style signals |
| `preferredTones` | `array<string>` | Tone signals |
| `modelVersion` | `string` | Deterministic algorithm version |

### `upload_reservations` — Firestore

Previous schema: `upload_reservations`.

| Field | Type | Description |
|---|---|---|
| `uploadId (document ID)` | `string` | Upload request identifier |
| `userKey` | `string` | Required current owner |
| `brandId?` | `string\|null` | Optional future Brand association; not an authorization grant. null |
| `assetId` | `string` | Reserved dam_assets ID |
| `objectKey` | `string` | Server-created GCS staging key |
| `state` | `string` | reserved / uploaded / attached / expired |
| `expiresAt` | `timestamp` | Short-lived upload reservation |
| `createdAt` | `timestamp` | Reservation time |
| `kind` | `string\|null` | Valid asset kind |
| `attachedConsumerId` | `string\|null` | Brand/board after commit |
| `updatedAt` | `timestamp` | Updated |

### `job_events` — BigQuery

Previous schema: `job_events`.

| Field | Type | Description |
|---|---|---|
| `event_id` | `STRING` | Unique event identifier |
| `event_ts` | `TIMESTAMP` | Event time and partition |
| `event_type` | `STRING` | Job or node lifecycle |
| `job_id` | `STRING` | Cloud SQL job reference |
| `user_key` | `STRING` | Initiating user identity |
| `brand_id` | `STRING NULL` | Optional Brand association; Future Brand association |
| `board_id` | `STRING` | Run board |
| `node_id` | `STRING NULLABLE` | Node identifier |
| `attempt_no` | `INT64` | Worker attempt |
| `lease_fence` | `INT64` | Accepted lease fence |
| `job_status` | `STRING NULLABLE` | Lifecycle status |
| `node_status` | `STRING NULLABLE` | Node lifecycle |
| `error_code` | `STRING NULLABLE` | Error classification |
| `correlation_id` | `STRING NULLABLE` | Request correlation |
| `trace_id` | `STRING NULLABLE` | ADK trace correlation |
| `metadata` | `JSON NULLABLE` | Redacted safe context |
| `error_class` | `STRING` | Physical BigQuery column |

### `slot_events` — BigQuery

Previous schema: `slot_events`.

| Field | Type | Description |
|---|---|---|
| `event_id` | `STRING` | Unique event ID; deduplication |
| `event_ts` | `TIMESTAMP` | Event timestamp |
| `job_id` | `STRING` | Accepted job |
| `user_key` | `STRING` | Initiating account |
| `brand_id` | `STRING NULL` | Optional Brand association; Future Brand association |
| `board_id` | `STRING` | Source Playspace |
| `node_id` | `STRING` | Generating node |
| `slot_index` | `INT64` | Output index |
| `attempt_no` | `INT64` | Attempt identity |
| `lease_fence` | `INT64` | Stale-worker fencing |
| `slot_status` | `STRING` | ready / failed / other |
| `asset_id` | `STRING NULLABLE` | Captured DAM asset ID |
| `gcs_bucket` | `STRING` | Single private bucket |
| `gcs_object` | `STRING` | Must begin output/users/... |
| `gcs_generation` | `STRING` | Exact image version |
| `mime_type` | `STRING NULLABLE` | Verified image MIME |
| `byte_count` | `INT64 NULLABLE` | Verified size |
| `image_width` | `INT64 NULLABLE` | Verified width |
| `image_height` | `INT64 NULLABLE` | Verified height |
| `auto_tags` | `ARRAY<STRING>` | Prompt-derived labels |
| `style_tags` | `ARRAY<STRING>` | Style labels |
| `tone_tags` | `ARRAY<STRING>` | Tone labels |
| `persona_tags` | `ARRAY<STRING>` | Marketing audience descriptors |
| `campaign_id` | `STRING NULLABLE` | Campaign reference |
| `metadata_source` | `STRING NULLABLE` | Tags provenance |
| `selected_dam_asset_ids` | `ARRAY<STRING>` | Selected references |
| `input_asset_ids` | `ARRAY<STRING>` | Authorized run inputs |
| `checksum_sha256` | `STRING NULLABLE` | Content fingerprint |
| `campaign_type` | `STRING` | Physical BigQuery column |
| `metadata_version` | `INT64` | Physical BigQuery column |
| `event_schema_version` | `INT64` | Physical BigQuery column |

### `job_analytics` — BigQuery

Previous schema: `job_analytics`.

| Field | Type | Description |
|---|---|---|
| `event_id` | `STRING` | Unique measurement event |
| `event_ts` | `TIMESTAMP` | Measurement timestamp |
| `job_id` | `STRING` | Job identifier |
| `user_key` | `STRING` | Initiating user |
| `brand_id` | `STRING NULL` | Optional Brand association; Future Brand association |
| `attempt_no` | `INT64` | Worker attempt |
| `component` | `STRING` | Agent, model or tool |
| `model_id` | `STRING NULLABLE` | Google model |
| `model_call_count` | `INT64` | Usage count |
| `duration_ms` | `INT64` | Elapsed time |
| `tokens_input` | `INT64 NULLABLE` | Input tokens |
| `tokens_output` | `INT64 NULLABLE` | Output tokens |
| `estimated_cost_usd` | `NUMERIC NULLABLE` | Cost estimate |
| `trace_id` | `STRING NULLABLE` | Trace correlation |
| `event_type` | `STRING` | Physical BigQuery column |
| `error_code` | `STRING` | Physical BigQuery column |

### `bq_status_views` — BigQuery

Previous schema: `bq_status_views`.

| Field | Type | Description |
|---|---|---|
| `v_job_latest` | `LOGICAL VIEW` | Derived effective job status; not a table |
| `v_slot_ready` | `LOGICAL VIEW` | Derived accepted slot readiness; not a table |
| `source_tables` | `SQL` | job_events and slot_events |
| `query_policy` | `SQL` | Bounded query; verify latency/cost |
| `v_job_latest.brand_id` | `STRING` | Authorized Brand |
| `v_job_latest.job_id` | `STRING` | Accepted Run ID |
| `v_job_latest.job_status` | `STRING` | Derived job state, not a second write store |
| `v_job_latest.updated_at` | `TIMESTAMP` | Derived from accepted winning event |
| `v_slot_ready.node_id` | `STRING` | Image-generation node |
| `v_slot_ready.slot_index` | `INT64` | Output slot number |
| `v_slot_ready.gcs_locator` | `bucket/object/generation` | Exact verified image-byte version |
| `v_slot_ready.auto_tags` | `ARRAY<STRING>` | Prompt-derived compact metadata for feedback |

### `gcs_input` — GCS

Previous schema: `gcs_input`.

| Field | Type | Description |
|---|---|---|
| `bucket` | `single private bucket` | gcos-personalization-{env} |
| `prefix` | `input/` | One of only two top-level prefixes |
| `uploads` | `input/users/{userKey}/assets/{assetId}/original.{ext}` | Canvas and Assets-page original |
| `guidelines` | `input/users/{userKey}/guidelines/{assetId}/source.{ext}` | Original guideline source |
| `run_manifest` | `input/users/{userKey}/runs/{jobId}/manifest.json` | Immutable execution context |
| `run_plan` | `input/users/{userKey}/runs/{jobId}/plan.json` | Separate plan when used |
| `board_snapshot` | `input/users/{userKey}/boards/{boardId}/snapshots/{revision}.json` | Versioned board export when used |
| `staging` | `input/users/{userKey}/staging/{uploadId}/{assetId}` | Staged uploads when used |
| `input/users/{userKey}/assets/{assetId}/original.{ext}` | `GCS object path` | Playspace and Assets-page uploaded originals, one file write. |
| `input/users/{userKey}/guidelines/{assetId}/source.{ext}` | `GCS object path` | Brand guideline original bytes. |
| `input/users/{userKey}/runs/{jobId}/manifest.json` | `GCS object path` | Immutable generation request manifest. |
| `input/users/{userKey}/runs/{jobId}/plan.json` | `GCS object path` | Separate immutable execution plan if produced. |
| `input/users/{userKey}/boards/{boardId}/snapshots/{revision}.json` | `GCS object path` | Optional archived board JSON snapshot. |
| `input/users/{userKey}/staging/{uploadId}/{assetId}` | `GCS object path` | Temporary staged uploads when used. |

### `gcs_output` — GCS

Previous schema: `gcs_output`.

| Field | Type | Description |
|---|---|---|
| `bucket` | `same private bucket` | gcos-personalization-{env} |
| `prefix` | `output/` | Generated output prefix |
| `image_path` | `output/users/{userKey}/runs/{jobId}/attempts/{attemptNo}/nodes/{nodeId}/slots/{slotIndex}.{ext}` | Only generated image bytes |
| `writer` | `Artifact MCP` | Run-scoped create-only output |
| `read` | `Node authorized proxy` | Object version pinned by generation |
| `dam_capture` | `Firestore metadata` | No copy to input/ on save/feedback |
| `output/users/{userKey}/runs/{jobId}/attempts/{attemptNo}/nodes/{nodeId}/slots/{slotIndex}.{ext}` | `GCS object path` | Generated image written once through Artifact MCP, exact generation stored in BigQuery slot event. |

### `gcs_manifest` — GCS

Previous schema: `gcs_manifest`.

| Field | Type | Description |
|---|---|---|
| `schemaVersion` | `integer` | Manifest format |
| `jobId` | `string` | Accepted Run |
| `userKey` | `string` | Canonical account ID |
| `brandId` | `string\|null` | Future Brand association |
| `boardId` | `string` | Playspace reference |
| `briefId` | `string\|null` | Campaign reference |
| `promptSnapshot` | `string` | Frozen instruction |
| `inputAssetHandles` | `array<object>` | Authorized input asset IDs + roles |
| `outputReservations` | `array<object>` | Reserved output paths and slots |
| `selectedSkillRevisions` | `array<object>` | Agent Registry immutable revisions |
| `mcpToolAllowlist` | `array<string>` | Allowed tool set |
| `limits` | `object` | Budgets and deadlines |
| `createdAt` | `timestamp` | Immutable creation time |
| `briefId / briefRevision` | `string / int` | Approved Campaign Brief reference |
| `personaSnapshot` | `object` | Campaign audience context at Run time |
| `brandRevision` | `integer` | Brand settings/assets revision |
| `damSelection` | `not here` | ADK selection later in plan/events; do not mutate manifest |

### `gcs_object_properties` — GCS

Previous schema: `gcs_object_properties`.

| Field | Type | Description |
|---|---|---|
| `bucket` | `string` | Same bucket for input and output |
| `object` | `string` | Starts input/ or output/ |
| `generation` | `string` | Precise immutable object version |
| `contentType` | `string` | Verified MIME |
| `sizeBytes` | `integer` | Verified size |
| `crc32c` | `string` | GCS checksum |
| `sha256` | `string\|null` | App content hash |
| `createdAt` | `timestamp` | GCS-created timestamp |
| `reader` | `service policy` | Node proxy or scoped MCP |
| `writer` | `service policy` | Node upload or Artifact MCP |
| `dam_metadata` | `stored in Firestore` | Not stored as GCS tags |
| `objectName` | `string` | Opaque object path; not a public URL |
| `checksum` | `crc32c / sha256` | GCS CRC32C; optional app SHA256 in metadata |
| `retention` | `policy` | Keep while linked to Brand, DAM or a Run |
| `metadata lookup` | `policy` | Not a DAM tag source; tags in BQ / Firestore |
| `metageneration` | `integer` | GCS object metadata revision if needed |
| `timeCreated` | `timestamp` | GCS object creation timestamp |
| `retentionHold` | `boolean?` | Optional data-lifecycle control |
| `objectVersion` | `immutable` | Create-only or generation-pinned outputs |

## Original DAM field mapping

| Original v7 field | v8 collection | v8 field name |
|---|---|---|
| `assetId (document ID)` | `dam_assets` | `assetId (document ID)` |
| `userKey` | `dam_assets` | `userKey` |
| `brandId?` | `dam_assets` | `brandId?` |
| `createdByUserKey` | `dam_assets` | `createdByUserKey` |
| `source` | `dam_assets` | `source` |
| `kind` | `dam_assets` | `kind` |
| `name?` | `dam_assets` | `name?` |
| `description?` | `dam_assets` | `description?` |
| `createdAt / updatedAt` | `dam_assets` | `createdAt / updatedAt` |
| `details` | `dam_assets` | `details` |
| `createdAt` | `dam_assets` | `createdAt` |
| `updatedAt` | `dam_assets` | `updatedAt` |
| `uploadOrigin` | `dam_assets` | `uploadOrigin` |
| `storage.bucket` | `dam_asset_files` | `storage.bucket` |
| `storage.object` | `dam_asset_files` | `storage.object` |
| `storage.generation?` | `dam_asset_files` | `storage.generation?` |
| `mimeType` | `dam_asset_files` | `mimeType` |
| `sizeBytes` | `dam_asset_files` | `sizeBytes` |
| `width? / height?` | `dam_asset_files` | `width? / height?` |
| `bytes` | `dam_asset_files` | `bytes` |
| `storage.sha256` | `dam_asset_files` | `storage.sha256` |
| `storage.width` | `dam_asset_files` | `storage.width` |
| `storage.height` | `dam_asset_files` | `storage.height` |
| `storage.prefix` | `dam_asset_files` | `storage.prefix` |
| `autoTags` | `dam_asset_classification` | `autoTags` |
| `toneTags / styleTags` | `dam_asset_classification` | `toneTags / styleTags` |
| `personaTags` | `dam_asset_classification` | `personaTags` |
| `metadataSource` | `dam_asset_classification` | `metadataSource` |
| `styleTags` | `dam_asset_classification` | `styleTags` |
| `toneTags` | `dam_asset_classification` | `toneTags` |
| `campaignType` | `dam_asset_classification` | `campaignType` |
| `metadataVersion` | `dam_asset_classification` | `metadataVersion` |
| `metadataConfidence` | `dam_asset_classification` | `metadataConfidence` |
| `campaignId?` | `dam_asset_lineage` | `campaignId?` |
| `sourceJobId?` | `dam_asset_lineage` | `sourceJobId?` |
| `nodeId? / slotIndex?` | `dam_asset_lineage` | `nodeId? / slotIndex?` |
| `derivedFromAssetIds` | `dam_asset_lineage` | `derivedFromAssetIds` |
| `referenceAssetIds` | `dam_asset_lineage` | `referenceAssetIds` |
| `provenance` | `dam_asset_lineage` | `provenance` |
| `supersedesAssetId` | `dam_asset_lineage` | `supersedesAssetId` |
| `approval.state` | `dam_asset_state` | `approval.state` |
| `approval.approvedByUserKey?` | `dam_asset_state` | `approval.approvedByUserKey?` |
| `approval.approvedAt?` | `dam_asset_state` | `approval.approvedAt?` |
| `dam.saved` | `dam_asset_state` | `dam.saved` |
| `dam.contextAllowed` | `dam_asset_state` | `dam.contextAllowed` |
| `state` | `dam_asset_state` | `state` |
| `metadataRevision` | `dam_asset_state` | `metadataRevision` |
| `deletedAt` | `dam_asset_state` | `deletedAt` |
| `captureTrigger` | `dam_asset_state` | `captureTrigger` |
| `details.productImage.imageType` | `dam_product_images` | `imageType` |
| `details.productImage.view` | `dam_product_images` | `view` |
| `details.productImage.variant` | `dam_product_images` | `variant` |
| `details.logo.logoType` | `dam_logos` | `logoType` |
| `details.logo.usage` | `dam_logos` | `usage` |
| `details.adaptFrom.name` | `dam_adapt_from` | `name` |
| `details.adaptFrom.creativeType` | `dam_adapt_from` | `creativeType` |
| `details.adaptFrom.aspectRatio` | `dam_adapt_from` | `aspectRatio` |
| `details.styleExample.name` | `dam_style_examples` | `name` |
| `details.styleExample.exampleType` | `dam_style_examples` | `exampleType` |
| `details.reference.referenceType` | `dam_references` | `referenceType` |
| `details.reference.use` | `dam_references` | `use` |
| `details.reference.scope` | `dam_references` | `scope` |
| `details.guidelines.title` | `dam_guidelines` | `title` |
| `details.guidelines.docType` | `dam_guidelines` | `docType` |
| `details.guidelines.note` | `dam_guidelines` | `note` |