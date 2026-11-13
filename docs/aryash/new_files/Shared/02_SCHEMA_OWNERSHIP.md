# Exact schema / collection ownership (v8)

This is generated from `References/GCOS_Modular_DAM_Data_Model_v8.md`. Task files MUST use these names; do not create alternate pluralizations, cloud datastores or shadow tables. The full source v8 file remains the authority for data types and descriptions.

| Store | Entity (exact) | Nature |
|---|---|---|
| Cloud SQL | `users` | table |
| Cloud SQL | `identity_links` | table |
| Cloud SQL | `login_sessions` | table |
| Cloud SQL | `brands` | table |
| Cloud SQL | `brand_memberships` | table |
| Cloud SQL | `role_policies` | table |
| Cloud SQL | `brand_settings` | table |
| Cloud SQL | `campaign_briefs` | table |
| Cloud SQL | `boards` | table |
| Cloud SQL | `board_content` | table |
| Cloud SQL | `board_runtime` | table |
| Cloud SQL | `skill_registry_links` | table |
| Cloud SQL | `skill_grants` | table |
| Cloud SQL | `idempotency_keys` | table |
| Cloud SQL | `job_admissions` | table |
| Cloud SQL | `audit_events` | table |
| Firestore | `dam_assets` | collection |
| Firestore | `dam_asset_files` | collection |
| Firestore | `dam_asset_classification` | collection |
| Firestore | `dam_asset_lineage` | collection |
| Firestore | `dam_asset_state` | collection |
| Firestore | `dam_product_images` | collection |
| Firestore | `dam_logos` | collection |
| Firestore | `dam_adapt_from` | collection |
| Firestore | `dam_style_examples` | collection |
| Firestore | `dam_references` | collection |
| Firestore | `dam_guidelines` | collection |
| Firestore | `asset_links` | collection |
| Firestore | `asset_feedback` | collection |
| Firestore | `product_sets` | collection |
| Firestore | `dam_context` | collection |
| Firestore | `user_asset_preferences` | collection |
| Firestore | `upload_reservations` | collection |
| BigQuery | `job_events` | physical table |
| BigQuery | `slot_events` | physical table |
| BigQuery | `job_analytics` | physical table |
| BigQuery | `bq_status_views` | logical view group |
| GCS | `gcs_input` | object contract / path template |
| GCS | `gcs_output` | object contract / path template |
| GCS | `gcs_manifest` | object contract / path template |
| GCS | `gcs_object_properties` | object contract / path template |

## Field dictionary — exact names as displayed in v8

**Important:** The v8 ERD retains historical aliases such as `nodes_json` and `nodes`, and visual labels such as `user_key (PK)`, `brand_id?`, or `createdAt / updatedAt`. These are documentation labels, not literal SQL identifiers. Before migration, use an explicit mapping decision in `05_SCHEMA_REVIEW.md`; never create columns containing `?`, `/`, ` (PK)`, or duplicate semantic aliases by accident. Do not drop original documentation fields.

### Cloud SQL

**`users`** — 11 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `user_key (PK)` | `VARCHAR(64)` |
| `primary_email` | `TEXT` |
| `display_name?` | `TEXT` |
| `status` | `TEXT` |
| `default_brand_id?` | `VARCHAR(64)` |
| `created_at` | `TIMESTAMPTZ` |
| `updated_at` | `TIMESTAMPTZ` |
| `email_verified` | `BOOLEAN` |
| `primary_brand_id` | `TEXT NULL` |
| `auth_issuer` | `TEXT` |
| `last_login_at` | `TIMESTAMPTZ` |

**`identity_links`** — 9 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `identity_hash (PK)` | `TEXT` |
| `user_key (FK)` | `VARCHAR(64)` |
| `issuer` | `TEXT` |
| `status` | `TEXT` |
| `created_at` | `TIMESTAMPTZ` |
| `last_verified_at` | `TIMESTAMPTZ` |
| `issuer_sub_hash` | `TEXT` |
| `sub_hash` | `TEXT` |
| `email_at_link` | `TEXT NULL` |

**`login_sessions`** — 10 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `session_hash (PK)` | `TEXT` |
| `user_key (FK)` | `VARCHAR(64)` |
| `issued_at` | `TIMESTAMPTZ` |
| `last_seen_at` | `TIMESTAMPTZ` |
| `idle_expires_at` | `TIMESTAMPTZ` |
| `absolute_expires_at` | `TIMESTAMPTZ` |
| `revoked_at?` | `TIMESTAMPTZ` |
| `status` | `TEXT` |
| `ttl_at` | `TIMESTAMPTZ` |
| `user_agent_hash` | `TEXT NULL` |

**`brands`** — 11 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `brand_id (PK)` | `VARCHAR(64)` |
| `owner_user_key (FK)` | `VARCHAR(64)` |
| `name` | `TEXT` |
| `status` | `TEXT` |
| `created_at` | `TIMESTAMPTZ` |
| `slug` | `TEXT` |
| `default_settings_ref` | `TEXT` |
| `default_assets_ref` | `TEXT` |
| `updated_at` | `TIMESTAMPTZ` |
| `revision` | `BIGINT` |
| `schema_version` | `BIGINT` |

**`brand_memberships`** — 14 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `membership_id (PK)` | `VARCHAR(128)` |
| `user_key (FK)` | `VARCHAR(64)` |
| `brand_id (FK)` | `VARCHAR(64)` |
| `role_code?` | `TEXT` |
| `status` | `TEXT` |
| `created_at` | `TIMESTAMPTZ` |
| `role` | `TEXT` |
| `custom_allow` | `JSONB` |
| `custom_deny` | `JSONB` |
| `invited_by_user_key` | `TEXT NULL` |
| `joined_at` | `TIMESTAMPTZ` |
| `revoked_at` | `TIMESTAMPTZ` |
| `revision` | `BIGINT` |
| `updated_at` | `TIMESTAMPTZ` |

**`role_policies`** — 6 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `role_id` | `TEXT` |
| `policy_version` | `BIGINT` |
| `permissions` | `JSONB` |
| `description` | `TEXT` |
| `managed_by` | `TEXT` |
| `updated_at` | `TIMESTAMPTZ` |

**`brand_settings`** — 19 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `settings_id (PK)` | `VARCHAR(64)` |
| `user_key (FK)` | `VARCHAR(64)` |
| `brand_id?` | `VARCHAR(64) NULL` |
| `brand_name?` | `TEXT` |
| `industry?` | `TEXT` |
| `description?` | `TEXT` |
| `default_logo_asset_id?` | `VARCHAR(64)` |
| `guideline_asset_ids` | `JSONB` |
| `market?` | `TEXT` |
| `language?` | `TEXT` |
| `revision` | `BIGINT` |
| `updated_at` | `TIMESTAMPTZ` |
| `homepage_url` | `TEXT NULL` |
| `default_market` | `TEXT` |
| `default_language` | `TEXT` |
| `brand_description` | `TEXT NULL` |
| `default_guideline_asset_ids` | `JSONB` |
| `schema_version` | `BIGINT` |
| `updated_by_user_key` | `TEXT` |

**`campaign_briefs`** — 33 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `brief_id (PK)` | `VARCHAR(64)` |
| `user_key (FK)` | `VARCHAR(64)` |
| `brand_id?` | `VARCHAR(64) NULL` |
| `board_id?` | `VARCHAR(64)` |
| `name` | `TEXT` |
| `status` | `TEXT` |
| `brief_json` | `JSONB` |
| `persona_snapshot?` | `JSONB` |
| `reference_asset_ids` | `JSONB` |
| `revision` | `BIGINT` |
| `created_at` | `TIMESTAMPTZ` |
| `updated_at` | `TIMESTAMPTZ` |
| `created_by_user_key` | `TEXT` |
| `brief.objective` | `TEXT` |
| `brief.audience` | `TEXT` |
| `brief.insight` | `TEXT` |
| `brief.message` | `TEXT` |
| `brief.tones` | `JSONB` |
| `brief.offer` | `TEXT` |
| `brief.mandatory.product` | `BOOLEAN` |
| `brief.mandatory.logo` | `BOOLEAN` |
| `brief.mandatory.cta` | `BOOLEAN` |
| `brief.mandatory.legal` | `BOOLEAN` |
| `brief.cta_text` | `TEXT` |
| `brief.legal_text` | `TEXT` |
| `brief.dos` | `TEXT` |
| `brief.donts` | `TEXT` |
| `brief.reference_ids` | `JSONB` |
| `persona_snapshot.label` | `TEXT NULL` |
| `persona_snapshot.tags` | `JSONB` |
| `market` | `TEXT` |
| `language` | `TEXT` |
| `updated_by_user_key` | `TEXT` |

**`boards`** — 12 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `board_id (PK)` | `VARCHAR(64)` |
| `user_key (FK)` | `VARCHAR(64)` |
| `brand_id?` | `VARCHAR(64) NULL` |
| `title` | `TEXT` |
| `active_brief_id?` | `VARCHAR(64)` |
| `content_revision` | `BIGINT` |
| `status` | `TEXT` |
| `created_at` | `TIMESTAMPTZ` |
| `updated_at` | `TIMESTAMPTZ` |
| `created_by_user_key` | `TEXT` |
| `execution_mode` | `TEXT` |
| `last_opened_at` | `TIMESTAMPTZ` |

**`board_content`** — 15 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `board_id (PK,FK)` | `VARCHAR(64)` |
| `user_key (FK)` | `VARCHAR(64)` |
| `nodes_json` | `JSONB` |
| `edges_json` | `JSONB` |
| `viewport_json?` | `JSONB` |
| `revision` | `BIGINT` |
| `large_snapshot_gcs_ref?` | `TEXT` |
| `updated_at` | `TIMESTAMPTZ` |
| `brand_id` | `VARCHAR(64) NULL` |
| `nodes` | `JSONB` |
| `edges` | `JSONB` |
| `viewport` | `JSONB` |
| `node_input_asset_ids` | `JSONB` |
| `last_saved_by_user_key` | `TEXT` |
| `schema_version` | `BIGINT` |

**`board_runtime`** — 13 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `board_id (PK,FK)` | `VARCHAR(64)` |
| `user_key (FK)` | `VARCHAR(64)` |
| `adk_session_id?` | `TEXT` |
| `session_generation` | `BIGINT` |
| `current_job_id?` | `VARCHAR(64)` |
| `lock_owner_job_id?` | `VARCHAR(64)` |
| `lock_fence` | `BIGINT` |
| `lock_expires_at?` | `TIMESTAMPTZ` |
| `updated_at` | `TIMESTAMPTZ` |
| `brand_id` | `VARCHAR(64) NULL` |
| `adk_session_generation` | `BIGINT` |
| `session_bound_at` | `TIMESTAMPTZ` |
| `session_expires_at` | `TIMESTAMPTZ` |

**`skill_registry_links`** — 19 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `skill_id (PK)` | `VARCHAR(64)` |
| `user_key (FK)` | `VARCHAR(64)` |
| `brand_id?` | `VARCHAR(64) NULL` |
| `registry_resource?` | `TEXT` |
| `approved_revision_ref?` | `TEXT` |
| `display_name` | `TEXT` |
| `status` | `TEXT` |
| `created_at` | `TIMESTAMPTZ` |
| `updated_at` | `TIMESTAMPTZ` |
| `created_by_user_key` | `TEXT` |
| `slug` | `TEXT` |
| `description` | `TEXT` |
| `latest_approved_revision` | `TEXT NULL` |
| `allowed_tool_ids` | `JSONB` |
| `revision` | `BIGINT` |
| `skill_instructions_summary` | `TEXT` |
| `skill_type` | `TEXT` |
| `registry_revision` | `TEXT` |
| `tool_catalog_refs` | `JSONB` |

**`skill_grants`** — 10 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `grant_id` | `TEXT` |
| `brand_id` | `VARCHAR(64) NULL` |
| `skill_id` | `TEXT` |
| `user_key` | `TEXT` |
| `can_use` | `BOOLEAN` |
| `can_edit` | `BOOLEAN` |
| `can_publish` | `BOOLEAN` |
| `status` | `TEXT` |
| `granted_by_user_key` | `TEXT` |
| `updated_at` | `TIMESTAMPTZ` |

**`idempotency_keys`** — 10 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `key_hash (PK)` | `TEXT` |
| `user_key (FK)` | `VARCHAR(64)` |
| `brand_id?` | `VARCHAR(64) NULL` |
| `operation` | `TEXT` |
| `request_hash` | `TEXT` |
| `result_id?` | `VARCHAR(64)` |
| `state` | `TEXT` |
| `expires_at` | `TIMESTAMPTZ` |
| `created_at` | `TIMESTAMPTZ` |
| `ttl_at` | `TIMESTAMPTZ` |

**`job_admissions`** — 21 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `job_id (PK)` | `VARCHAR(64)` |
| `user_key (FK)` | `VARCHAR(64)` |
| `brand_id?` | `VARCHAR(64) NULL` |
| `board_id (FK)` | `VARCHAR(64)` |
| `brief_id?` | `VARCHAR(64)` |
| `idempotency_key_hash` | `TEXT` |
| `request_hash` | `TEXT` |
| `manifest_gcs_ref` | `TEXT` |
| `dispatch_state` | `TEXT` |
| `task_name?` | `TEXT` |
| `attempt_no` | `BIGINT` |
| `lease_fence` | `BIGINT` |
| `lease_expires_at?` | `TIMESTAMPTZ` |
| `job_deadline_at` | `TIMESTAMPTZ` |
| `created_at` | `TIMESTAMPTZ` |
| `updated_at` | `TIMESTAMPTZ` |
| `manifest_bucket` | `TEXT` |
| `manifest_object` | `TEXT` |
| `manifest_generation` | `TEXT NULL` |
| `heartbeat_at` | `TIMESTAMPTZ` |
| `accept_deadline_at` | `TIMESTAMPTZ` |

**`audit_events`** — 12 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `audit_event_id (PK)` | `VARCHAR(64)` |
| `user_key (FK)` | `VARCHAR(64)` |
| `brand_id?` | `VARCHAR(64) NULL` |
| `action` | `TEXT` |
| `resource_type` | `TEXT` |
| `resource_id` | `VARCHAR(128)` |
| `result` | `TEXT` |
| `request_id?` | `VARCHAR(128)` |
| `created_at` | `TIMESTAMPTZ` |
| `before_revision` | `BIGINT` |
| `after_revision` | `BIGINT` |
| `timestamp` | `TIMESTAMPTZ` |

### Firestore

**`dam_assets`** — 13 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `assetId (document ID)` | `string` |
| `userKey` | `string` |
| `brandId?` | `string\\|null` |
| `createdByUserKey` | `string` |
| `source` | `upload\` |
| `kind` | `string` |
| `name?` | `string` |
| `description?` | `string` |
| `createdAt / updatedAt` | `timestamp` |
| `details` | `map<string,string>` |
| `createdAt` | `timestamp` |
| `updatedAt` | `timestamp` |
| `uploadOrigin` | `playspace\\|assets_page\\|null` |

**`dam_asset_files`** — 12 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `assetId (PK / logical FK)` | `string` |
| `storage.bucket` | `string` |
| `storage.object` | `string` |
| `storage.generation?` | `string\` |
| `mimeType` | `string` |
| `sizeBytes` | `number` |
| `width? / height?` | `number\` |
| `bytes` | `integer` |
| `storage.sha256` | `string` |
| `storage.width` | `integer\\|null` |
| `storage.height` | `integer\\|null` |
| `storage.prefix` | `input/\\|output/` |

**`dam_asset_classification`** — 10 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `assetId (PK / logical FK)` | `string` |
| `autoTags` | `string[]` |
| `toneTags / styleTags` | `string[]` |
| `personaTags` | `string[]` |
| `metadataSource` | `string` |
| `styleTags` | `array<string>` |
| `toneTags` | `array<string>` |
| `campaignType` | `string\\|null` |
| `metadataVersion` | `integer` |
| `metadataConfidence` | `number\\|null` |

**`dam_asset_lineage`** — 8 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `assetId (PK / logical FK)` | `string` |
| `campaignId?` | `string\` |
| `sourceJobId?` | `string\` |
| `nodeId? / slotIndex?` | `string / number` |
| `derivedFromAssetIds` | `string[]` |
| `referenceAssetIds` | `string[]` |
| `provenance` | `map` |
| `supersedesAssetId` | `string\\|null` |

**`dam_asset_state`** — 10 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `assetId (PK / logical FK)` | `string` |
| `approval.state` | `string` |
| `approval.approvedByUserKey?` | `string\` |
| `approval.approvedAt?` | `timestamp\` |
| `dam.saved` | `boolean` |
| `dam.contextAllowed` | `boolean` |
| `state` | `string` |
| `metadataRevision` | `integer` |
| `deletedAt` | `timestamp\\|null` |
| `captureTrigger` | `save\\|like\\|dislike\\|approve\\|null` |

**`dam_product_images`** — 4 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `assetId (PK / logical FK)` | `string` |
| `imageType` | `string` |
| `view` | `string` |
| `variant` | `string` |

**`dam_logos`** — 3 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `assetId (PK / logical FK)` | `string` |
| `logoType` | `string` |
| `usage` | `string` |

**`dam_adapt_from`** — 4 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `assetId (PK / logical FK)` | `string` |
| `name` | `string` |
| `creativeType` | `string` |
| `aspectRatio` | `string` |

**`dam_style_examples`** — 3 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `assetId (PK / logical FK)` | `string` |
| `name` | `string` |
| `exampleType` | `string` |

**`dam_references`** — 4 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `assetId (PK / logical FK)` | `string` |
| `referenceType` | `string` |
| `use` | `string` |
| `scope` | `string` |

**`dam_guidelines`** — 4 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `assetId (PK / logical FK)` | `string` |
| `title` | `string` |
| `docType` | `string` |
| `note` | `string` |

**`asset_links`** — 10 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `linkId (document ID)` | `string` |
| `userKey` | `string` |
| `brandId?` | `string\\|null` |
| `assetId` | `string` |
| `consumerType` | `string` |
| `consumerId` | `string` |
| `purpose` | `string` |
| `hardRetentionUntil?` | `timestamp\` |
| `createdAt` | `timestamp` |
| `createdByUserKey` | `string` |

**`asset_feedback`** — 15 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `feedbackId (document ID)` | `string` |
| `userKey` | `string` |
| `brandId?` | `string\\|null` |
| `assetId` | `string` |
| `reaction` | `liked\` |
| `favorite` | `boolean` |
| `allowPersonalization` | `boolean` |
| `jobId?` | `string\` |
| `createdAt / updatedAt` | `timestamp` |
| `nodeId` | `string` |
| `slotIndex` | `integer` |
| `savedToDam` | `boolean` |
| `revision` | `integer` |
| `createdAt` | `timestamp` |
| `updatedAt` | `timestamp` |

**`product_sets`** — 22 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `productSetId (document ID)` | `string` |
| `userKey` | `string` |
| `brandId?` | `string\\|null` |
| `productName` | `string` |
| `sku?` | `string` |
| `masterAssetId?` | `string\` |
| `assetIds` | `string[]` |
| `colours?` | `map` |
| `createdAt / updatedAt` | `timestamp` |
| `revision` | `integer` |
| `record.productName` | `string` |
| `record.sku` | `string` |
| `record.masterId` | `string\\|null` |
| `record.colours.primary` | `hex string\\|empty` |
| `record.colours.secondary` | `hex string\\|empty` |
| `record.colours.accent` | `hex string\\|empty` |
| `record.assetIds` | `array<string>` |
| `record.brandGuidelineIds` | `array<string>` |
| `updatedByUserKey` | `string` |
| `updatedAt` | `timestamp` |
| `schemaVersion` | `integer` |
| `kindAssignments` | `map` |

**`dam_context`** — 11 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `contextId (document ID)` | `string` |
| `userKey` | `string` |
| `brandId?` | `string\\|null` |
| `approvedCreativeTags` | `string[]` |
| `approvedStyleTags` | `string[]` |
| `blockedTags` | `string[]` |
| `evidenceAssetIds` | `string[]` |
| `revision` | `number` |
| `updatedAt` | `timestamp` |
| `lastComputedAt` | `timestamp` |
| `updatedByUserKey` | `string` |

**`user_asset_preferences`** — 15 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `userKey (document ID)` | `string` |
| `brandId?` | `string\\|null` |
| `enabled` | `boolean` |
| `preferredTags / avoidedTags` | `string[]` |
| `preferredStyles / preferredTones` | `string[]` |
| `evidenceCount` | `number` |
| `lastComputedAt?` | `timestamp\` |
| `sourceEventWatermark?` | `timestamp\` |
| `revision` | `number` |
| `brandUserId` | `string` |
| `preferredTags` | `array<string>` |
| `avoidedTags` | `array<string>` |
| `preferredStyles` | `array<string>` |
| `preferredTones` | `array<string>` |
| `modelVersion` | `string` |

**`upload_reservations`** — 11 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `uploadId (document ID)` | `string` |
| `userKey` | `string` |
| `brandId?` | `string\\|null` |
| `assetId` | `string` |
| `objectKey` | `string` |
| `state` | `string` |
| `expiresAt` | `timestamp` |
| `createdAt` | `timestamp` |
| `kind` | `string\\|null` |
| `attachedConsumerId` | `string\\|null` |
| `updatedAt` | `timestamp` |

### BigQuery

**`job_events`** — 17 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `event_id` | `STRING` |
| `event_ts` | `TIMESTAMP` |
| `event_type` | `STRING` |
| `job_id` | `STRING` |
| `user_key` | `STRING` |
| `brand_id` | `STRING NULL` |
| `board_id` | `STRING` |
| `node_id` | `STRING NULLABLE` |
| `attempt_no` | `INT64` |
| `lease_fence` | `INT64` |
| `job_status` | `STRING NULLABLE` |
| `node_status` | `STRING NULLABLE` |
| `error_code` | `STRING NULLABLE` |
| `correlation_id` | `STRING NULLABLE` |
| `trace_id` | `STRING NULLABLE` |
| `metadata` | `JSON NULLABLE` |
| `error_class` | `STRING` |

**`slot_events`** — 31 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `event_id` | `STRING` |
| `event_ts` | `TIMESTAMP` |
| `job_id` | `STRING` |
| `user_key` | `STRING` |
| `brand_id` | `STRING NULL` |
| `board_id` | `STRING` |
| `node_id` | `STRING` |
| `slot_index` | `INT64` |
| `attempt_no` | `INT64` |
| `lease_fence` | `INT64` |
| `slot_status` | `STRING` |
| `asset_id` | `STRING NULLABLE` |
| `gcs_bucket` | `STRING` |
| `gcs_object` | `STRING` |
| `gcs_generation` | `STRING` |
| `mime_type` | `STRING NULLABLE` |
| `byte_count` | `INT64 NULLABLE` |
| `image_width` | `INT64 NULLABLE` |
| `image_height` | `INT64 NULLABLE` |
| `auto_tags` | `ARRAY<STRING>` |
| `style_tags` | `ARRAY<STRING>` |
| `tone_tags` | `ARRAY<STRING>` |
| `persona_tags` | `ARRAY<STRING>` |
| `campaign_id` | `STRING NULLABLE` |
| `metadata_source` | `STRING NULLABLE` |
| `selected_dam_asset_ids` | `ARRAY<STRING>` |
| `input_asset_ids` | `ARRAY<STRING>` |
| `checksum_sha256` | `STRING NULLABLE` |
| `campaign_type` | `STRING` |
| `metadata_version` | `INT64` |
| `event_schema_version` | `INT64` |

**`job_analytics`** — 16 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `event_id` | `STRING` |
| `event_ts` | `TIMESTAMP` |
| `job_id` | `STRING` |
| `user_key` | `STRING` |
| `brand_id` | `STRING NULL` |
| `attempt_no` | `INT64` |
| `component` | `STRING` |
| `model_id` | `STRING NULLABLE` |
| `model_call_count` | `INT64` |
| `duration_ms` | `INT64` |
| `tokens_input` | `INT64 NULLABLE` |
| `tokens_output` | `INT64 NULLABLE` |
| `estimated_cost_usd` | `NUMERIC NULLABLE` |
| `trace_id` | `STRING NULLABLE` |
| `event_type` | `STRING` |
| `error_code` | `STRING` |

**`bq_status_views`** — 12 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `v_job_latest` | `LOGICAL VIEW` |
| `v_slot_ready` | `LOGICAL VIEW` |
| `source_tables` | `SQL` |
| `query_policy` | `SQL` |
| `v_job_latest.brand_id` | `STRING` |
| `v_job_latest.job_id` | `STRING` |
| `v_job_latest.job_status` | `STRING` |
| `v_job_latest.updated_at` | `TIMESTAMP` |
| `v_slot_ready.node_id` | `STRING` |
| `v_slot_ready.slot_index` | `INT64` |
| `v_slot_ready.gcs_locator` | `bucket/object/generation` |
| `v_slot_ready.auto_tags` | `ARRAY<STRING>` |

### GCS

**`gcs_input`** — 14 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `bucket` | `single private bucket` |
| `prefix` | `input/` |
| `uploads` | `input/users/{userKey}/assets/{assetId}/original.{ext}` |
| `guidelines` | `input/users/{userKey}/guidelines/{assetId}/source.{ext}` |
| `run_manifest` | `input/users/{userKey}/runs/{jobId}/manifest.json` |
| `run_plan` | `input/users/{userKey}/runs/{jobId}/plan.json` |
| `board_snapshot` | `input/users/{userKey}/boards/{boardId}/snapshots/{revision}.json` |
| `staging` | `input/users/{userKey}/staging/{uploadId}/{assetId}` |
| `input/users/{userKey}/assets/{assetId}/original.{ext}` | `GCS object path` |
| `input/users/{userKey}/guidelines/{assetId}/source.{ext}` | `GCS object path` |
| `input/users/{userKey}/runs/{jobId}/manifest.json` | `GCS object path` |
| `input/users/{userKey}/runs/{jobId}/plan.json` | `GCS object path` |
| `input/users/{userKey}/boards/{boardId}/snapshots/{revision}.json` | `GCS object path` |
| `input/users/{userKey}/staging/{uploadId}/{assetId}` | `GCS object path` |

**`gcs_output`** — 7 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `bucket` | `same private bucket` |
| `prefix` | `output/` |
| `image_path` | `output/users/{userKey}/runs/{jobId}/attempts/{attemptNo}/nodes/{nodeId}/slots/{slotIndex}.{ext}` |
| `writer` | `Artifact MCP` |
| `read` | `Node authorized proxy` |
| `dam_capture` | `Firestore metadata` |
| `output/users/{userKey}/runs/{jobId}/attempts/{attemptNo}/nodes/{nodeId}/slots/{slotIndex}.{ext}` | `GCS object path` |

**`gcs_manifest`** — 17 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `schemaVersion` | `integer` |
| `jobId` | `string` |
| `userKey` | `string` |
| `brandId` | `string\\|null` |
| `boardId` | `string` |
| `briefId` | `string\\|null` |
| `promptSnapshot` | `string` |
| `inputAssetHandles` | `array<object>` |
| `outputReservations` | `array<object>` |
| `selectedSkillRevisions` | `array<object>` |
| `mcpToolAllowlist` | `array<string>` |
| `limits` | `object` |
| `createdAt` | `timestamp` |
| `briefId / briefRevision` | `string / int` |
| `personaSnapshot` | `object` |
| `brandRevision` | `integer` |
| `damSelection` | `not here` |

**`gcs_object_properties`** — 19 source field rows

| v8 field label (exact) | Type (v8) |
|---|---|
| `bucket` | `string` |
| `object` | `string` |
| `generation` | `string` |
| `contentType` | `string` |
| `sizeBytes` | `integer` |
| `crc32c` | `string` |
| `sha256` | `string\\|null` |
| `createdAt` | `timestamp` |
| `reader` | `service policy` |
| `writer` | `service policy` |
| `dam_metadata` | `stored in Firestore` |
| `objectName` | `string` |
| `checksum` | `crc32c / sha256` |
| `retention` | `policy` |
| `metadata lookup` | `policy` |
| `metageneration` | `integer` |
| `timeCreated` | `timestamp` |
| `retentionHold` | `boolean?` |
| `objectVersion` | `immutable` |

