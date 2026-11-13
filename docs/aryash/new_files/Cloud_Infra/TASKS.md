# Cloud_Infra — granular MVP task index

26 tasks. Open and give Claude Code **one file at a time**. See `../00_START_HERE.md` before executing.

| ID | Task | Depends on | Exact schema blocks |
|---|---|---|---|
| INF-01 | [Inventory existing GCP resources and required APIs](tasks/INF-01_inventory_existing_gcp_resources_and_required_apis.md) | none | n/a |
| INF-02 | [Create separate runtime service accounts](tasks/INF-02_create_separate_runtime_service_accounts.md) | INF-01 | n/a |
| INF-03 | [Define minimum IAM bindings for Node, Python and tasks](tasks/INF-03_define_minimum_iam_bindings_for_node_python_and_tasks.md) | INF-02 | n/a |
| INF-04 | [Provision PostgreSQL Cloud SQL and private connectivity](tasks/INF-04_provision_postgresql_cloud_sql_and_private_connectivity.md) | INF-01,02 | `users`, `job_admissions` |
| INF-05 | [Set up versioned Cloud SQL migration runner and alias mapping](tasks/INF-05_set_up_versioned_cloud_sql_migration_runner_and_alias_mapping.md) | INF-04 | `users` |
| INF-06 | [Enable Cloud SQL backups, monitoring and credentials](tasks/INF-06_enable_cloud_sql_backups_monitoring_and_credentials.md) | INF-04 | `users`, `job_admissions` |
| INF-07 | [Create Firestore native database and DAM indexes](tasks/INF-07_create_firestore_native_database_and_dam_indexes.md) | INF-01 | `dam_assets`, `dam_asset_files`, `dam_asset_classification`, `dam_asset_lineage`, `dam_asset_state`, `dam_product_images`, `dam_logos`, `dam_adapt_from`, `dam_style_examples`, `dam_references`, `dam_guidelines`, `asset_links`, `asset_feedback`, `product_sets`, `dam_context`, `user_asset_preferences`, `upload_reservations` |
| INF-08 | [Configure one private GCS bucket with input/ and output/ paths](tasks/INF-08_configure_one_private_gcs_bucket_with_input_and_output_paths.md) | INF-01,03 | `gcs_input`, `gcs_output`, `gcs_object_properties` |
| INF-09 | [Create BigQuery dataset and three partitioned event tables](tasks/INF-09_create_bigquery_dataset_and_three_partitioned_event_tables.md) | INF-01 | `job_events`, `slot_events`, `job_analytics` |
| INF-10 | [Create bounded BigQuery latest status logical views](tasks/INF-10_create_bounded_bigquery_latest_status_logical_views.md) | INF-09 | `bq_status_views`, `job_events`, `slot_events` |
| INF-11 | [Create Cloud Tasks queue for one-image HTTP jobs](tasks/INF-11_create_cloud_tasks_queue_for_one_image_http_jobs.md) | INF-01,02 | n/a |
| INF-12 | [Grant Cloud Run invocation and OIDC task creation rights](tasks/INF-12_grant_cloud_run_invocation_and_oidc_task_creation_rights.md) | INF-02,03,11 | n/a |
| INF-13 | [Deploy Node BFF with Cloud SQL, Firestore, BigQuery and GCS](tasks/INF-13_deploy_node_bff_with_cloud_sql_firestore_bigquery_and_gcs.md) | INF-03,04,07,08,09,26 | n/a |
| INF-14 | [Deploy FastAPI private service with Python Vertex access](tasks/INF-14_deploy_fastapi_private_service_with_python_vertex_access.md) | INF-03,04,08,09,12,26 | n/a |
| INF-15 | [Create Secret Manager bindings and sanitized deployment variable map](tasks/INF-15_create_secret_manager_bindings_and_sanitized_deployment_variable_map.md) | INF-02,13,14 | n/a |
| INF-16 | [Configure Artifact Registry and build/deploy pipeline](tasks/INF-16_configure_artifact_registry_and_build_deploy_pipeline.md) | INF-13,14 | n/a |
| INF-17 | [Observability, budget alerting and worker failure visibility](tasks/INF-17_observability_budget_alerting_and_worker_failure_visibility.md) | INF-09,11,13,14 | `job_events`, `job_analytics` |
| INF-18 | [Staging smoke tests, schema drift checks and rollback plan](tasks/INF-18_staging_smoke_tests_schema_drift_checks_and_rollback_plan.md) | INF-05..17,19..26; NJS-54; PY-28 | `job_admissions`, `dam_assets`, `slot_events` |
| INF-19 | [Migrate identity SQL tables: users, identity_links, login_sessions](tasks/INF-19_migrate_identity_sql_tables_users_identity_links_login_sessions.md) | INF-05 | `users`, `identity_links`, `login_sessions` |
| INF-20 | [Migrate future Brand and role schema only](tasks/INF-20_migrate_future_brand_and_role_schema_only.md) | INF-05,19 | `brands`, `brand_memberships`, `role_policies` |
| INF-21 | [Migrate brand_settings and campaign_briefs tables](tasks/INF-21_migrate_brand_settings_and_campaign_briefs_tables.md) | INF-05,19 | `brand_settings`, `campaign_briefs` |
| INF-22 | [Migrate Playspace boards, board_content and board_runtime](tasks/INF-22_migrate_playspace_boards_board_content_and_board_runtime.md) | INF-05,19 | `boards`, `board_content`, `board_runtime` |
| INF-23 | [Migrate published Skill metadata links and grants schema](tasks/INF-23_migrate_published_skill_metadata_links_and_grants_schema.md) | INF-05,19 | `skill_registry_links`, `skill_grants` |
| INF-24 | [Migrate idempotency_keys and job_admissions transaction tables](tasks/INF-24_migrate_idempotency_keys_and_job_admissions_transaction_tables.md) | INF-05,19,22 | `idempotency_keys`, `job_admissions` |
| INF-25 | [Migrate append-only audit_events SQL table](tasks/INF-25_migrate_append_only_audit_events_sql_table.md) | INF-05,19 | `audit_events` |
| INF-26 | [Verify all 16 Cloud SQL migrations, keys and concurrency indexes](tasks/INF-26_verify_all_16_cloud_sql_migrations_keys_and_concurrency_indexes.md) | INF-19..25 | `users`, `identity_links`, `login_sessions`, `brands`, `brand_memberships`, `role_policies`, `brand_settings`, `campaign_briefs`, `boards`, `board_content`, `board_runtime`, `skill_registry_links`, `skill_grants`, `idempotency_keys`, `job_admissions`, `audit_events` |

## Running a task

Start Claude Code with this task file, frozen scope, schema map, API contracts and actual repository. After completion record tests and artifacts; move to the next task only when its dependencies are satisfied. No agent/ADK work in this pack.
