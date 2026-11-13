# FastAPI / Python — granular task index

24 tasks. **FastAPI is the asynchronous control and worker gateway; it never generates image bytes or invokes Vertex image models directly.** PY-01..04 are already complete.

| ID | Task | Depends on | Exact schema blocks |
|---|---|---|---|
| PY-05 | [Attach single-image dispatcher router to completed FastAPI service](tasks/PY-05_attach_single_image_dispatcher_router_to_completed_fastapi_service.md) | PY-01..04 complete; INF-04 | `job_admissions` |
| PY-06 | [Define typed FastAPI, Cloud Tasks and ADK client configuration](tasks/PY-06_define_typed_fastapi_cloud_tasks_and_adk_client_configuration.md) | PY-05; Environment templates | `job_admissions` |
| PY-07 | [Validate existing Node to FastAPI service identity](tasks/PY-07_validate_existing_node_to_fastapi_service_identity.md) | PY-05; NJS-08 complete | `job_admissions` |
| PY-08 | [Define dispatcher and ADK handoff schemas for one image](tasks/PY-08_define_dispatcher_and_adk_handoff_schemas_for_one_image.md) | PY-07; NJS-42,44; ADK-03 | `job_admissions, gcs_manifest` |
| PY-09 | [Read job admission and verify caller-scoped SQL identity](tasks/PY-09_read_job_admission_and_verify_caller_scoped_sql_identity.md) | PY-06,08; INF-24 | `job_admissions, boards` |
| PY-10 | [Read immutable GCS manifest by exact generation](tasks/PY-10_read_immutable_gcs_manifest_by_exact_generation.md) | PY-09; INF-08 | `gcs_manifest, gcs_input` |
| PY-11 | [Validate approved output reservation and attempt-scoped locator](tasks/PY-11_validate_approved_output_reservation_and_attempt_scoped_locator.md) | PY-10 | `gcs_output, gcs_manifest` |
| PY-12 | [Create Cloud Tasks job-ID-only enqueue adapter](tasks/PY-12_create_cloud_tasks_job_id_only_enqueue_adapter.md) | PY-09,10; INF-11 | `job_admissions` |
| PY-13 | [Make Cloud Tasks enqueue idempotent](tasks/PY-13_make_cloud_tasks_enqueue_idempotent.md) | PY-12 | `job_admissions` |
| PY-14 | [Protect Cloud Tasks worker with OIDC identity](tasks/PY-14_protect_cloud_tasks_worker_with_oidc_identity.md) | PY-05,07; INF-12 | `job_admissions` |
| PY-15 | [Claim SQL worker lease with monotonic attempt fencing](tasks/PY-15_claim_sql_worker_lease_with_monotonic_attempt_fencing.md) | PY-09,14; INF-24 | `job_admissions, board_runtime` |
| PY-16 | [Renew and verify worker heartbeat during ADK call](tasks/PY-16_renew_and_verify_worker_heartbeat_during_adk_call.md) | PY-15 | `job_admissions` |
| PY-17 | [Create verified input asset handle package for ADK](tasks/PY-17_create_verified_input_asset_handle_package_for_adk.md) | PY-10,16; NJS-43 | `gcs_input, dam_asset_files` |
| PY-18 | [Assemble immutable ADK invocation context from manifest](tasks/PY-18_assemble_immutable_adk_invocation_context_from_manifest.md) | PY-10,17; ADK-03 | `gcs_manifest, skill_registry_links` |
| PY-19 | [Invoke deployed ADK runtime exactly once per accepted attempt](tasks/PY-19_invoke_deployed_adk_runtime_exactly_once_per_accepted_attempt.md) | PY-16,18; ADK-03,23; INF-28 | `job_admissions` |
| PY-20 | [Validate ADK one-image completion receipt](tasks/PY-20_validate_adk_one_image_completion_receipt.md) | PY-19; ADK-17,20 | `slot_events` |
| PY-21 | [Confirm accepted GCS output without writing it in FastAPI](tasks/PY-21_confirm_accepted_gcs_output_without_writing_it_in_fastapi.md) | PY-11,20; ADK-16,17 | `gcs_output, gcs_object_properties` |
| PY-22 | [Publish deterministic dispatcher lifecycle events through approved writer](tasks/PY-22_publish_deterministic_dispatcher_lifecycle_events_through_approved_writer.md) | PY-15,16; INF-09, ADK-18 | `job_events` |
| PY-23 | [Verify ADK-emitted fenced slot_ready event exists](tasks/PY-23_verify_adk_emitted_fenced_slot_ready_event_exists.md) | PY-20,21,22; ADK-20 | `slot_events` |
| PY-24 | [Finalize terminal SQL job and release board lock atomically](tasks/PY-24_finalize_terminal_sql_job_and_release_board_lock_atomically.md) | PY-15,16,22,23 | `job_admissions, board_runtime` |
| PY-25 | [Classify ADK invocation errors and unknown outcomes safely](tasks/PY-25_classify_adk_invocation_errors_and_unknown_outcomes_safely.md) | PY-19,22,24; ADK-22 | `job_admissions, job_events` |
| PY-26 | [Deduplicate task replay and fencing across ADK and MCP](tasks/PY-26_deduplicate_task_replay_and_fencing_across_adk_and_mcp.md) | PY-13,15,22,23; ADK-18,22 | `job_events, slot_events, job_admissions` |
| PY-27 | [Consume ADK usage and trace receipts for job_analytics](tasks/PY-27_consume_adk_usage_and_trace_receipts_for_job_analytics.md) | PY-19,22; ADK-21 | `job_analytics` |
| PY-28 | [Test FastAPI dispatch to ADK end-to-end failure matrix](tasks/PY-28_test_fastapi_dispatch_to_adk_end_to_end_failure_matrix.md) | PY-05..27; ADK-24; INF-28,32 | `job_admissions, slot_events, job_events` |

## Execution
Read frozen scope/contract/component boundary documents; give Claude Code one file at a time. Exact dependencies override numeric ordering. Do not implement DAG, autonomous DAM search or RBAC enforcement.
