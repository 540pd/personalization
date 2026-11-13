# Shared cross-service contracts — one image via ADK (v9)

Inspect existing repository routes before choosing URL names. These are semantic contracts, not assertions that endpoints already exist.

| Operation | Owning code | Input → output |
|---|---|---|
| Board + campaign + Skills selection | Node | authenticated userKey; Cloud SQL board/campaign; pinned Agent Registry refs; no agent DAM search |
| Start Run (count=1) | Node | validated boardId, nodeId, explicit input asset IDs + prompt → stable job_id, immutable manifest in `input/` |
| Private dispatch | FastAPI | Node service OIDC + job_id → validate SQL + GCS manifest, enqueue Cloud Task payload `{job_id}` |
| Cloud Tasks worker | FastAPI | task OIDC + `{job_id}` → SQL lease claim/renew, pinned attempt/fence, invoke ADK, verify receipt, terminal commit |
| ADK invocation | ADK Agent Runtime | run_id, userKey, boardId, manifest locator+generation, attempt_no, lease_fence, scoped tool claims, session ID → typed one-image result or classified error |
| ADK execution | ADK | approved single-node prompt/Skills/guardrails → Vertex AI one-image output; input/output bytes only through MCP artifact tool |
| Artifact tool | Restricted MCP | verified manifest allowlisted handle → input bytes; approved `output/users/{userKey}/runs/{jobId}/attempts/{attemptNo}/nodes/{nodeId}/slots/0.ext` → create-only image GCS receipt |
| Event tool | Restricted MCP | stable `event_id`, job/attempt/fence + validated locator/metadata → BQ job/slot/usage events; SQL attempt acceptance guard |
| Status | Node | SQL userKey authorization + bounded BigQuery `v_job_latest` and `v_slot_ready` → job JSON, one accepted slot |
| Image | Node | SQL authorization + accepted `slot_ready` (fence checked) → authenticated stream of exact GCS generation |
| DAM capture and feedback | Node | save/like/dislike on accepted slot → modular Firestore DAM docs + `asset_feedback`, never copy image bytes |

## Example minimal one-slot manifest (illustrative, not new physical table)
```json
{
  "schemaVersion":1,
  "jobId":"job_example",
  "userKey":"user_example",
  "brandId":null,
  "boardId":"board_example",
  "briefId":null,
  "promptSnapshot":"Replace the background while preserving the logo.",
  "inputAssetHandles":[{"assetId":"asset_example","role":"main_image"}],
  "outputReservations":[{"nodeId":"node_example","slotIndex":0,"objectTemplate":"output/users/user_example/runs/job_example/attempts/{attemptNo}/nodes/node_example/slots/0.png"}],
  "selectedSkillRevisions":[],
  "mcpToolAllowlist":["artifact.fetch_input","artifact.write_output","events.write"],
  "limits":{"imageCount":1},
  "createdAt":"2026-11-13T00:00:00Z"
}
```
`objectTemplate` is only an illustrative internal reservation shape: adapt to the already-approved concrete representation. `mcpToolAllowlist` is ACTIVE in this phase; `dam.search_candidates` is NOT included. User-facing authorization is always based on server-derived userKey; optional brandId is not an access grant.

## Critical commit order
1. Node creates SQL job admission and immutable manifest, validated handles; Python enqueues ID only.
2. FastAPI task handler claims *authoritative* SQL attempt/fence; calls ADK once for that attempt.
3. ADK/authorized tool validates exact current fence; writes to unique attempt-scoped GCS path with create-only precondition; verifies generation/size/MIME.
4. Deterministic event writer checks authoritative fence and publishes stable `slot_ready` ID. Store/read idempotently; no BigQuery uniqueness guarantee. BFF crosschecks current SQL attempt/fence before delivery.
5. FastAPI ensures durable completion and finalizes SQL + board lock before 2xx acknowledgement. If ADK timed out ambiguously, never auto-generate a second image.

No multi-node DAG. No autonomous DAM asset selection. No LLM-driven decision to record required state events. Cloud Tasks has up to a 30-minute HTTP dispatch deadline; keep request execution below this or explicitly approve a different durable completion protocol.
