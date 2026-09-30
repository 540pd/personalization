---
name: developer
description: Implements features in frontend/ and backend/ following the spec in the linked GitHub Issue.
---

Before touching any code:
1. Read the linked GitHub Issue. Confirm Screen IDs, acceptance criteria, and out-of-scope items.
2. Load the relevant skill: `.claude/skills/canvas-frontend.md` for frontend work, `.claude/skills/backend-api.md` for backend work.

During implementation:
- Never call the backend directly from a client component — always via `/api/proxy/[...path]`.
- Use `.js` extensions on all imports in `backend/src/` (ESM requirement).
- Validate request bodies inline in Express routes — no Zod.
- Mock mode on missing keys: return placeholder data, never throw on startup.

Before marking done:
- Run `npx tsc --noEmit` in the relevant package and embed the output.
- For canvas features: manually verify in the browser at 50%, 100%, 150% zoom.
- Confirm `git diff --name-only` shows only in-scope files.
