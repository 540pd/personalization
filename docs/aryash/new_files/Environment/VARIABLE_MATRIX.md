# Environment variable map / ownership

**Evidence:** `References/Existing_Environment_Inventory.md` reports actual names from an earlier checked-out frontend and Node service; it explicitly states no FastAPI service was in that checkout. Names below marked **PROPOSED** are a plan, not evidence of present implementation. Claude Code must inspect the real repository before writing config.

| Variable(s) | Owner | Status | Secret? | Reason |
|---|---|---|---|---|
| `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID`, `BACKEND_URL`, `NEXT_PUBLIC_UNDO_HISTORY_LIMIT` | Next.js | EXISTING | No | Sign-in/proxy/canvas |
| `GOOGLE_OAUTH_CLIENT_ID`, `ALLOWED_ORIGINS`, `ALLOWED_EMAIL_DOMAINS`, `PORT` | Node | EXISTING | No | Existing BFF auth/server |
| `SESSION_SECRET` | Node | EXISTING NAME; verify completed opaque-session implementation | **Yes** | Session protection; Secret Manager |
| `FIRESTORE_PROJECT_ID`, `GCS_BUCKET_NAME` | Node | EXISTING | No | Current client configuration; one bucket |
| `LOCAL_DATA_DIR`, `FIRESTORE_EMULATOR_HOST`, `STORAGE_EMULATOR_HOST` | Node/local | EXISTING OPTIONAL | No | Dev fallback/emulators |
| `LOCAL_STORAGE_DIR` | Node | CONFIGURED BUT UNUSED in supplied inventory | No | Do not rely on it |
| `VERTEX_PROJECT_ID`, `VERTEX_LOCATION` | Node legacy | EXISTING in old checkout; new Run must not use | No | Legacy capability only until migrated |
| `CLOUD_TASKS_QUEUE`, `CLOUD_TASKS_SERVICE_ACCOUNT`, `JOBS_WORKER_URL` | Old Node video worker | EXISTING names in old source, absent values | No | Do not repurpose blindly; new dispatcher is Python |
| `FASTAPI_BASE_URL` | Node | PROPOSED | No | OIDC service-client destination |
| `CLOUD_SQL_INSTANCE_CONNECTION_NAME`, `CLOUD_SQL_DATABASE`, `CLOUD_SQL_USER` | Node/Python | PROPOSED | No | SQL connection |
| `CLOUD_SQL_PASSWORD` | Node/Python | PROPOSED | **Yes** | Only if password auth used; Secret Manager |
| `BIGQUERY_PROJECT_ID`, `BIGQUERY_DATASET` | Node/Python | PROPOSED | No | Event reads/writes |
| `GOOGLE_CLOUD_PROJECT`, `GCP_REGION`, `VERTEX_IMAGE_MODEL_ID`, `VERTEX_LOCATION` | Python | PROPOSED | No | Vertex non-agent execution |
| `WORKER_OIDC_AUDIENCE`, `NODE_INVOKER_SERVICE_ACCOUNT`, `FASTAPI_WORKER_SERVICE_ACCOUNT` | Python | PROPOSED | No | Strict invoker service identities |
| `WORKER_LEASE_SECONDS`, `WORKER_HEARTBEAT_SECONDS`, `JOB_TIMEOUT_SECONDS`, `MODEL_TIMEOUT_SECONDS` | Python | PROPOSED | No | Worker execution budgets |
| `SINGLE_IMAGE_OUTPUT_COUNT`, `MOCK_VERTEX` | Python | PROPOSED | No | One-image limit; local mock only |
| `K_SERVICE`, `NODE_ENV`, `VITEST` | Platform/toolchain | PLATFORM MANAGED | No | Do not set as credentials |

## Rules
- Use ADC locally and attached Cloud Run service account in deployed services, no service-account JSON key in repository.
- Never place real DB password, SESSION_SECRET or access token in the `.example` files.
- Existing `SESSION_SECRET` and Google OAuth setup should not be silently overwritten just because inventory mentions an old JWT implementation.
- For production, verify runtime enforces config and disables anonymous/mock modes.
