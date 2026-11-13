# v9 environment configuration matrix — proposed names are NOT verified implemented settings

Names below are intentionally sanitized and must be reconciled with actual code. Do not copy real secrets, static tokens or service-account JSON into the repository. On Cloud Run/Agent Runtime use service identities and ADC. See `References/Existing_Environment_Inventory.md` for historical Node/frontend variables, which are not guaranteed to be current.

| Key | Component | Purpose | Status | Secret? |
|---|---|---|---|---|
| `BACKEND_URL`, `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` | frontend | current backend proxy + user Google Sign-in | existing in previous checkout | no |
| `GOOGLE_OAUTH_CLIENT_ID`, `SESSION_SECRET` | Node | session and Google ID verification | existing | `SESSION_SECRET` yes |
| `FIRESTORE_PROJECT_ID`, `GCS_BUCKET_NAME` | Node | modular DAM and one asset bucket | existing, values environment-dependent | no |
| `FASTAPI_BASE_URL` | Node | private control plane target | proposed | no |
| `CLOUD_SQL_INSTANCE_CONNECTION_NAME`, `CLOUD_SQL_DATABASE`, `CLOUD_SQL_USER` | Node, FastAPI and fenced MCP gateway | SQL PostgreSQL connection | proposed | no |
| `CLOUD_SQL_PASSWORD` | SQL services when password auth is used | credential from Secret Manager only | proposed | YES |
| `CLOUD_TASKS_QUEUE`, `CLOUD_TASKS_SERVICE_ACCOUNT`, `JOBS_WORKER_URL` | FastAPI dispatcher | task enqueue / OIDC / worker target | proposed for Python; current Node repo may use keys for other jobs | no |
| `WORKER_OIDC_AUDIENCE` | FastAPI | validate Cloud Tasks identity | proposed | no |
| `ADK_AGENT_RUNTIME_RESOURCE`, `ADK_RUNTIME_LOCATION` | FastAPI + ADK deploy | locate managed deployed runtime | proposed | no |
| `ADK_INVOKE_AUDIENCE`, `ADK_REQUEST_TIMEOUT_SECONDS`, `MOCK_ADK` | FastAPI | authorized ADK invocation and local mock | proposed | no |
| `ADK_SESSION_SERVICE_RESOURCE` | ADK | managed Playspace session service | proposed | no |
| `VERTEX_PLAN_MODEL_ID`, `VERTEX_IMAGE_MODEL_ID`, `VERTEX_LOCATION` | **ADK only** | model selection and region | proposed, verify model availability | no |
| `MCP_TOOL_SERVER_URL`, `MCP_TOOL_AUDIENCE` | ADK | private artifact/event tools | proposed | no |
| `MCP_ALLOWED_TOOLS` | MCP server | allowlisted three tool operations; NO DAM-search | proposed | no |
| `BIGQUERY_PROJECT_ID`, `BIGQUERY_DATASET` | BFF/read, MCP/write | status/events analytics | proposed | no |
| `WORKER_LEASE_SECONDS`, `WORKER_HEARTBEAT_SECONDS` | FastAPI | SQL attempts/fencing | proposed | no |
| `MODEL_TIMEOUT_SECONDS`, `ADK_IMAGE_MAX_CALLS`, `ADK_PLAN_MAX_CALLS` | ADK | cap cost, latency and retries | proposed | no |

**Separation invariant:** ADK is the **only** caller of image-generation APIs for the new Run flow. FastAPI has no `VERTEX_IMAGE_MODEL_ID` requirement. Existing legacy Node model keys in source may be preserved only for unrelated preexisting features, never used by new Run endpoint.
