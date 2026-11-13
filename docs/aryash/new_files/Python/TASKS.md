# Python — granular MVP task index

24 tasks. Open and give Claude Code **one file at a time**. See `../00_START_HERE.md` before executing.

| ID | Task | Depends on | Exact schema blocks |
|---|---|---|---|
| PY-05 | [Attach new run router to completed FastAPI service](tasks/PY-05_attach_new_run_router_to_completed_fastapi_service.md) | PY-01..04 completed | `job_admissions` |
| PY-06 | [Add typed Python environment configuration for MVP worker](tasks/PY-06_add_typed_python_environment_configuration_for_mvp_worker.md) | PY-05; ENV templates | `job_admissions` |
| PY-07 | [Validate existing Node-to-FastAPI service identity](tasks/PY-07_validate_existing_node_to_fastapi_service_identity.md) | PY-05; NJS-08 done | `job_admissions` |
| PY-08 | [Define single-image Run dispatch request and response contracts](tasks/PY-08_define_single_image_run_dispatch_request_and_response_contracts.md) | PY-07; NJS-42,44 | `job_admissions`, `gcs_manifest` |
| PY-09 | [Read authorized job_admissions from Cloud SQL](tasks/PY-09_read_authorized_job_admissions_from_cloud_sql.md) | PY-06,08 | `job_admissions`, `boards` |
| PY-10 | [Read immutable GCS job manifest pinned to generation](tasks/PY-10_read_immutable_gcs_job_manifest_pinned_to_generation.md) | PY-09 | `gcs_manifest`, `gcs_input` |
| PY-11 | [Prepare output reservation for one slot and attempt path](tasks/PY-11_prepare_output_reservation_for_one_slot_and_attempt_path.md) | PY-10 | `gcs_output`, `gcs_manifest` |
| PY-12 | [Create Cloud Tasks job-ID-only enqueue adapter](tasks/PY-12_create_cloud_tasks_job_id_only_enqueue_adapter.md) | PY-09,10; INF-11 | `job_admissions` |
| PY-13 | [Make dispatch enqueue idempotent on duplicate task name](tasks/PY-13_make_dispatch_enqueue_idempotent_on_duplicate_task_name.md) | PY-12 | `job_admissions` |
| PY-14 | [Protect worker HTTP endpoint with Cloud Tasks OIDC identity](tasks/PY-14_protect_worker_http_endpoint_with_cloud_tasks_oidc_identity.md) | PY-05,07; INF-12 | `job_admissions` |
| PY-15 | [Claim worker lease and attempt using Cloud SQL row lock](tasks/PY-15_claim_worker_lease_and_attempt_using_cloud_sql_row_lock.md) | PY-09,14 | `job_admissions`, `board_runtime` |
| PY-16 | [Renew worker lease heartbeat while processing](tasks/PY-16_renew_worker_lease_heartbeat_while_processing.md) | PY-15 | `job_admissions` |
| PY-17 | [Resolve verified GCS input image bytes for one Run](tasks/PY-17_resolve_verified_gcs_input_image_bytes_for_one_run.md) | PY-10,16 | `gcs_input`, `dam_asset_files` |
| PY-18 | [Build deterministic prompt from promptSnapshot, brief and Skills](tasks/PY-18_build_deterministic_prompt_from_promptsnapshot_brief_and_skills.md) | PY-10,17; PY-01..04 done | `gcs_manifest`, `skill_registry_links` |
| PY-19 | [Invoke Vertex AI directly from Python for exactly one image](tasks/PY-19_invoke_vertex_ai_directly_from_python_for_exactly_one_image.md) | PY-17,18; INF-14 | `job_admissions` |
| PY-20 | [Verify model output image and metadata](tasks/PY-20_verify_model_output_image_and_metadata.md) | PY-19 | `slot_events` |
| PY-21 | [Write generated output create-only under output/ GCS](tasks/PY-21_write_generated_output_create_only_under_output_gcs.md) | PY-11,20 | `gcs_output`, `gcs_object_properties` |
| PY-22 | [Write deterministic BigQuery job lifecycle events](tasks/PY-22_write_deterministic_bigquery_job_lifecycle_events.md) | PY-15,16; INF-09 | `job_events` |
| PY-23 | [Emit one verified slot_ready event and metadata to BigQuery](tasks/PY-23_emit_one_verified_slot_ready_event_and_metadata_to_bigquery.md) | PY-20,21,22 | `slot_events` |
| PY-24 | [Atomically finalize SQL job state and release board lock](tasks/PY-24_atomically_finalize_sql_job_state_and_release_board_lock.md) | PY-15,16,22,23 | `job_admissions`, `board_runtime` |
| PY-25 | [Handle failures, retryable errors and unknown model outcomes](tasks/PY-25_handle_failures_retryable_errors_and_unknown_model_outcomes.md) | PY-19,22,24 | `job_admissions`, `job_events` |
| PY-26 | [Deduplicate redelivered job and event side effects](tasks/PY-26_deduplicate_redelivered_job_and_event_side_effects.md) | PY-13,15,22,23 | `job_events`, `slot_events`, `job_admissions` |
| PY-27 | [Record model usage and latency in job_analytics](tasks/PY-27_record_model_usage_and_latency_in_job_analytics.md) | PY-19,22 | `job_analytics` |
| PY-28 | [Test single-image dispatch and worker failure matrix](tasks/PY-28_test_single_image_dispatch_and_worker_failure_matrix.md) | PY-05..27 | `job_admissions`, `slot_events`, `job_events` |

## Running a task

Start Claude Code with this task file, frozen scope, schema map, API contracts and actual repository. After completion record tests and artifacts; move to the next task only when its dependencies are satisfied. No agent/ADK work in this pack.
