# NodeJS — granular MVP task index

52 tasks. Open and give Claude Code **one file at a time**. See `../00_START_HERE.md` before executing.

| ID | Task | Depends on | Exact schema blocks |
|---|---|---|---|
| NJS-09 | [Inventory completed BFF code and identify Cloud SQL migration seams](tasks/NJS-09_inventory_completed_bff_code_and_identify_cloud_sql_migration_seams.md) | NJS-01..08 completed | `users`, `identity_links`, `login_sessions`, `idempotency_keys`, `board_runtime`, `job_admissions` |
| NJS-10 | [Add Cloud SQL PostgreSQL connection pool and transaction helper](tasks/NJS-10_add_cloud_sql_postgresql_connection_pool_and_transaction_helper.md) | NJS-09; INF-04 | `users` |
| NJS-11 | [Adapt existing user and identity-link persistence to Cloud SQL](tasks/NJS-11_adapt_existing_user_and_identity_link_persistence_to_cloud_sql.md) | NJS-10; NJS-01,02 done | `users`, `identity_links` |
| NJS-12 | [Adapt existing opaque session persistence to Cloud SQL](tasks/NJS-12_adapt_existing_opaque_session_persistence_to_cloud_sql.md) | NJS-10; NJS-03 done | `login_sessions`, `users` |
| NJS-13 | [Move existing idempotency repository to SQL without changing API](tasks/NJS-13_move_existing_idempotency_repository_to_sql_without_changing_api.md) | NJS-10; NJS-05 done | `idempotency_keys`, `job_admissions` |
| NJS-14 | [Move Playspace concurrency lock into board_runtime SQL transaction](tasks/NJS-14_move_playspace_concurrency_lock_into_board_runtime_sql_transaction.md) | NJS-10; NJS-06 done | `board_runtime`, `job_admissions` |
| NJS-15 | [Centralize authenticated userKey, nullable brandId and API validation](tasks/NJS-15_centralize_authenticated_userkey_nullable_brandid_and_api_validation.md) | NJS-11,12 | `users`, `boards` |
| NJS-16 | [Implement Playspace board create/list/get endpoints](tasks/NJS-16_implement_playspace_board_create_list_get_endpoints.md) | NJS-10,15 | `boards` |
| NJS-17 | [Read board_content and normalize legacy canvas snapshot aliases](tasks/NJS-17_read_board_content_and_normalize_legacy_canvas_snapshot_aliases.md) | NJS-16 | `board_content`, `boards` |
| NJS-18 | [Save canvas content with optimistic revision CAS](tasks/NJS-18_save_canvas_content_with_optimistic_revision_cas.md) | NJS-17 | `board_content`, `boards` |
| NJS-19 | [Support board archive, reopen activity and active brief association](tasks/NJS-19_support_board_archive_reopen_activity_and_active_brief_association.md) | NJS-16,21 | `boards`, `campaign_briefs` |
| NJS-20 | [Brand settings CRUD with exact SQL fields and revisions](tasks/NJS-20_brand_settings_crud_with_exact_sql_fields_and_revisions.md) | NJS-10,15 | `brand_settings` |
| NJS-21 | [Campaign brief create/list/get/update with snapshot-safe schema](tasks/NJS-21_campaign_brief_create_list_get_update_with_snapshot_safe_schema.md) | NJS-10,15 | `campaign_briefs` |
| NJS-22 | [Validate campaign referenceAssetIds and board links](tasks/NJS-22_validate_campaign_referenceassetids_and_board_links.md) | NJS-21,27 | `campaign_briefs`, `asset_links`, `dam_assets` |
| NJS-23 | [Persist Skill Registry metadata links in Cloud SQL](tasks/NJS-23_persist_skill_registry_metadata_links_in_cloud_sql.md) | NJS-10; PY-01..04 done | `skill_registry_links` |
| NJS-24 | [Create append-only SQL audit_events helper for BFF mutations](tasks/NJS-24_create_append_only_sql_audit_events_helper_for_bff_mutations.md) | NJS-10,15 | `audit_events` |
| NJS-25 | [Create typed Firestore DAM repository for canonical dam_assets](tasks/NJS-25_create_typed_firestore_dam_repository_for_canonical_dam_assets.md) | NJS-15; INF-07 | `dam_assets` |
| NJS-26 | [Add one-to-one dam_asset_files GCS locator repository](tasks/NJS-26_add_one_to_one_dam_asset_files_gcs_locator_repository.md) | NJS-25 | `dam_asset_files`, `dam_assets` |
| NJS-27 | [Add one-to-one DAM classification repository](tasks/NJS-27_add_one_to_one_dam_classification_repository.md) | NJS-25 | `dam_asset_classification`, `dam_assets` |
| NJS-28 | [Add DAM lineage repository and controlled input provenance](tasks/NJS-28_add_dam_lineage_repository_and_controlled_input_provenance.md) | NJS-25 | `dam_asset_lineage`, `dam_assets` |
| NJS-29 | [Add DAM state repository with revision protection](tasks/NJS-29_add_dam_state_repository_with_revision_protection.md) | NJS-25 | `dam_asset_state`, `dam_assets` |
| NJS-30 | [Define shared typed DAM detail validation and repository interface](tasks/NJS-30_define_shared_typed_dam_detail_validation_and_repository_interface.md) | NJS-25 | `dam_assets` |
| NJS-31 | [Implement canonical one-bucket input GCS path utility](tasks/NJS-31_implement_canonical_one_bucket_input_gcs_path_utility.md) | INF-08; NJS-15 | `gcs_input`, `gcs_object_properties` |
| NJS-32 | [Implement Firestore upload_reservations lifecycle](tasks/NJS-32_implement_firestore_upload_reservations_lifecycle.md) | NJS-25,31 | `upload_reservations` |
| NJS-33 | [Finalize GCS upload to modular Firestore asset records](tasks/NJS-33_finalize_gcs_upload_to_modular_firestore_asset_records.md) | NJS-26,29,32 | `dam_assets`, `dam_asset_files`, `dam_asset_state`, `upload_reservations` |
| NJS-34 | [Expose generic Playspace image upload route](tasks/NJS-34_expose_generic_playspace_image_upload_route.md) | NJS-33 | `dam_assets`, `upload_reservations` |
| NJS-35 | [Expose typed Assets-page upload route](tasks/NJS-35_expose_typed_assets_page_upload_route.md) | NJS-33,55..60 | `dam_assets`, `dam_product_images`, `dam_logos`, `dam_guidelines` |
| NJS-36 | [DAM listing API with pagination and user scope](tasks/NJS-36_dam_listing_api_with_pagination_and_user_scope.md) | NJS-25,29 | `dam_assets`, `dam_asset_state` |
| NJS-37 | [DAM detail GET including modular joins](tasks/NJS-37_dam_detail_get_including_modular_joins.md) | NJS-26,27,28,29,55..60 | `dam_assets`, `dam_asset_files`, `dam_asset_classification`, `dam_asset_lineage`, `dam_asset_state` |
| NJS-38 | [DAM metadata edit with CAS and no GCS rewrite](tasks/NJS-38_dam_metadata_edit_with_cas_and_no_gcs_rewrite.md) | NJS-37 | `dam_assets`, `dam_asset_classification`, `dam_asset_state` |
| NJS-39 | [Asset-to-consumer link creation/removal](tasks/NJS-39_asset_to_consumer_link_creation_removal.md) | NJS-25 | `asset_links`, `dam_assets` |
| NJS-40 | [Product sets create/update/read with master image membership](tasks/NJS-40_product_sets_create_update_read_with_master_image_membership.md) | NJS-30,39 | `product_sets`, `dam_assets`, `asset_links` |
| NJS-41 | [Authorized input-image binary proxy](tasks/NJS-41_authorized_input_image_binary_proxy.md) | NJS-26,36 | `dam_asset_files`, `dam_assets` |
| NJS-42 | [Validate single-image Run request DTO at BFF](tasks/NJS-42_validate_single_image_run_request_dto_at_bff.md) | NJS-15,18 | `boards`, `job_admissions` |
| NJS-43 | [Preflight Run image handles, campaign and Skill revisions](tasks/NJS-43_preflight_run_image_handles_campaign_and_skill_revisions.md) | NJS-42,23,26 | `dam_assets`, `dam_asset_files`, `campaign_briefs`, `skill_registry_links` |
| NJS-44 | [Build immutable one-node, one-slot Run manifest](tasks/NJS-44_build_immutable_one_node_one_slot_run_manifest.md) | NJS-43 | `gcs_manifest`, `gcs_output` |
| NJS-45 | [Write Run manifest create-only to input/ GCS](tasks/NJS-45_write_run_manifest_create_only_to_input_gcs.md) | NJS-44,31 | `gcs_manifest`, `gcs_input` |
| NJS-46 | [Complete SQL job_admissions reservation lifecycle](tasks/NJS-46_complete_sql_job_admissions_reservation_lifecycle.md) | NJS-13,14,45 | `job_admissions`, `idempotency_keys`, `board_runtime` |
| NJS-47 | [Connect existing Node signed service client to single-run FastAPI dispatcher](tasks/NJS-47_connect_existing_node_signed_service_client_to_single_run_fastapi_dispatcher.md) | NJS-46; NJS-08 done; PY-08 | `job_admissions` |
| NJS-48 | [BigQuery latest-status read API (user-scoped)](tasks/NJS-48_bigquery_latest_status_read_api_user_scoped.md) | NJS-46; INF-09,10 | `job_events`, `slot_events`, `bq_status_views` |
| NJS-49 | [Binary output delivery proxy from accepted slot_ready](tasks/NJS-49_binary_output_delivery_proxy_from_accepted_slot_ready.md) | NJS-48,41 | `slot_events`, `gcs_output` |
| NJS-50 | [Capture a ready generated output into modular DAM once](tasks/NJS-50_capture_a_ready_generated_output_into_modular_dam_once.md) | NJS-37,48,49 | `dam_assets`, `dam_asset_files`, `dam_asset_classification`, `dam_asset_lineage`, `dam_asset_state`, `slot_events` |
| NJS-51 | [Persist user Like/Dislike and favorite in asset_feedback](tasks/NJS-51_persist_user_like_dislike_and_favorite_in_asset_feedback.md) | NJS-50 | `asset_feedback`, `dam_assets` |
| NJS-52 | [Make save, feedback and DAM capture retry-safe across BQ/Firestore](tasks/NJS-52_make_save_feedback_and_dam_capture_retry_safe_across_bq_firestore.md) | NJS-50,51 | `asset_feedback`, `dam_asset_state`, `dam_asset_files` |
| NJS-53 | [Normalize API errors, correlation IDs and no-secret logging](tasks/NJS-53_normalize_api_errors_correlation_ids_and_no_secret_logging.md) | NJS-24,47,48 | `audit_events`, `job_admissions` |
| NJS-54 | [Node end-to-end tests for upload → Run → output → feedback](tasks/NJS-54_node_end_to_end_tests_for_upload_run_output_feedback.md) | NJS-34..53 | `boards`, `job_admissions`, `dam_assets`, `asset_feedback` |
| NJS-55 | [Typed DAM details for productImage only](tasks/NJS-55_typed_dam_details_for_productimage_only.md) | NJS-30 | `dam_product_images`, `dam_assets` |
| NJS-56 | [Typed DAM details for logo only](tasks/NJS-56_typed_dam_details_for_logo_only.md) | NJS-30 | `dam_logos`, `dam_assets` |
| NJS-57 | [Typed DAM details for adaptFrom creative only](tasks/NJS-57_typed_dam_details_for_adaptfrom_creative_only.md) | NJS-30 | `dam_adapt_from`, `dam_assets` |
| NJS-58 | [Typed DAM details for styleExample only](tasks/NJS-58_typed_dam_details_for_styleexample_only.md) | NJS-30 | `dam_style_examples`, `dam_assets` |
| NJS-59 | [Typed DAM details for reference only](tasks/NJS-59_typed_dam_details_for_reference_only.md) | NJS-30 | `dam_references`, `dam_assets` |
| NJS-60 | [Typed DAM details for guidelines only](tasks/NJS-60_typed_dam_details_for_guidelines_only.md) | NJS-30 | `dam_guidelines`, `dam_assets` |

## Running a task

Start Claude Code with this task file, frozen scope, schema map, API contracts and actual repository. After completion record tests and artifacts; move to the next task only when its dependencies are satisfied. ADK runtime work is in `../ADK/TASKS.md`; FastAPI dispatches but never generates image bytes directly.
