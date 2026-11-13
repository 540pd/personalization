# Shared MVP integration contracts (proposed, verify existing routes)

No externally visible URL is asserted as already implemented. Reuse existing route shape when present; these are stable semantic contracts for Claude Code to follow.

| Operation | Owner | Contract / authorization |
|---|---|---|
| Create/list/edit board | Node | `boards` + `board_content`, userKey from session, CAS revision |
| Upload input asset | Node | reserve/verify `input/` GCS; create `dam_assets` + `dam_asset_files` + matching typed detail/state |
| Start single-image Run | Node | stable job_id; userKey/boardId/nodeId; count=1; NJS-05/06 reused |
| Dispatcher API | Python | private Node service OIDC → look up `job_admissions`/GCS manifest; task payload **job_id only** |
| Worker endpoint | Python | private Cloud Tasks OIDC identity → SQL lease/fence → Python Vertex → output GCS → BQ events |
| Job progress | Node | query `v_job_latest` and `v_slot_ready` after SQL userKey ownership check; 3-5s browser polling |
| Output binary | Node | verified `slot_ready` + exact GCS generation; authenticated stream |
| Save/Like/Dislike | Node | idempotent Firestore capture + `asset_feedback`; no extra AI call or GCS image copy |

## One-image manifest example (illustrative, **not** a new physical schema)
```json
{
  "schemaVersion": 1,
  "jobId": "job_example",
  "userKey": "user_example",
  "brandId": null,
  "boardId": "board_example",
  "briefId": null,
  "promptSnapshot": "Replace the background while preserving the product label.",
  "inputAssetHandles": [{"assetId": "asset_example", "role": "main_image"}],
  "outputReservations": [{"nodeId": "node_example", "slotIndex": 0, "objectTemplate": "output/users/user_example/runs/job_example/attempts/{attemptNo}/nodes/node_example/slots/0.png"}],
  "selectedSkillRevisions": [],
  "mcpToolAllowlist": [],
  "limits": {"imageCount": 1},
  "createdAt": "2026-11-13T00:00:00Z"
}
```

**Contract clarification:** v8 does not define an `objectTemplate` name inside reservation; adapt to existing reserved-output object shape, preserving a single approved output path. Empty `mcpToolAllowlist` is a dormant compatibility field: **no MCP tools run now**. Python writes direct to GCS temporarily. The example is synthetic and contains no real identifiers.

## Cross-service invariants
- Node creates/owns stable job_id, assetId and authorized output slot. SQL job admission must exist before Python enqueues.
- FastAPI never trusts body userKey alone. It authenticates caller and verifies job_id / user_key through SQL & manifest.
- Cloud Tasks invokes worker with its own OIDC SA, NOT the browser Google ID token. 2xx only after durable terminal completion.
- Worker takes SQL attempt lease; stale attempt cannot commit SQL state or canonical BQ ready record.
- GCS output generation is written once and stored in BigQuery slot_events; only after slot_ready may Node stream.
- BigQuery is an append-only event log, not lock authority; stable event_id and dedup in query/derived state required. BFF must cross-check BQ slot attempt/fence against authoritative SQL job admission before showing ready data; a SQL precheck and BQ insert are not atomic.
- Role and approval fields may be populated but no RBAC enforcement in this iteration.
