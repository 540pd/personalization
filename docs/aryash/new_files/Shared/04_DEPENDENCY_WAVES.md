# Dependency-based implementation sequence (ADK one-image MVP)

**Do NOT execute tasks in raw numeric order.** These waves preserve SQL migrations before SQL adapters and modular DAM typed details before upload routes. Run parallel work where interfaces are frozen.

| Wave | Cloud Infra | Node | FastAPI | ADK | Exit criterion |
|---|---|---|---|---|---|
| 0. Freeze contracts | INF-01..03, INF-27 planning | NJS-09 | PY-05..08 skeleton | ADK-01..03 scaffold | v8 aliases resolved and one-image contract signed off |
| 1. Datastores and identity | INF-04..10; INF-19..26; INF-30/31 plan | NJS-10..15 AFTER INF-19/24 | PY-09..11 AFTER INF-24/08 | ADK-04..08 | SQL/Firestore/BQ/GCS created; IAM/test handles confirmed |
| 2. App features and queue | INF-11..12 | NJS-16..24, NJS-25..30 | PY-12..16 | ADK-09..13 | Cloud Tasks task-ID queue + SQL lease test; typed DAM repositories built |
| 3. Uploads/agent execution | INF-14, INF-28..31 gated | NJS-31..34 + NJS-55..60 then NJS-35..41 | PY-17..19 (delegation to ADK) | ADK-14..21 | ADK mock generates one image and MCP output/event with verified receipt |
| 4. Readiness/capture/reliability | INF-13,15..17,32 | NJS-42..53 | PY-20..27 | ADK-22..24 | End-to-end mock status+GCS stream+feedback; no second model call |
| 5. Integration/release gate | INF-18,33 | NJS-54 | PY-28 | ADK-25..26 | staged 1-image pass, rollback/observability, approvals |

## Important intra-wave dependencies
1. **INF-05,19,22,24** precede `NJS-10..14`, `PY-09,15` respectively; inspect each exact task dependency.
2. `NJS-55..60` typed DAM detail repos must finish **before `NJS-35` typed upload and `NJS-37` joined detail**. Fix prior v8 wave that placed them later.
3. `ADK-03` defines the shared typed fixture first; `PY-08` consumes it. Review both contract sides before merging.
4. **ADK-08,09,16,18** and **INF-29** must be aligned to run-scoped MCP tool claims before a real output write.
5. `ADK-14` (Vertex image call) must precede `PY-19` real end-to-end acceptance; `PY-19` can use mock ADK transport earlier. Mock can be written earlier.
6. `ADK-23` packages and implements the client adapter using mocks; then `INF-28` deploys the runtime before `PY-19` staging invocation. Use mocks until deployment is authorized.
7. `ADK-20` emits `slot_ready`, then `PY-23` verifies; `NJS-48,49,50` consume readiness/bytes/metadata.
8. `PY-24` commits SQL terminal state only after ADK success/failure is durable and safe; Cloud Tasks 2xx follows that commit.

## Parallel lanes
- SQL migration + GCS/BQ/Firestore infra can be set up while Node/Python/ADK audit and contract tasks run.
- Board/campaign CRUD and DAM typed repos can run in parallel with ADK plan/Skill tool development once shared manifest is frozen.
- Node status proxy can be developed against BQ fixture while ADK event writer is built, but acceptance must test SQL fence crosscheck.

## Safety gates
No scheduler/reconciler; Cloud Tasks retries only failures/unacknowledged task requests (30-min max HTTP target). A successfully ACKed stuck job is outside Cloud Tasks automatic recovery. No automatic model retry on ambiguous outcome. Role rows and brandId are stored but not enforced as shared access.

**Deployment order detail:** `INF-29` provisions the private MCP gateway and IAM first, `ADK-08/09/16/18` implement tool contracts, and `INF-32` deploys/validates the populated gateway. Do not make infra provisioning depend on implementation of tools that themselves depend on infra.
