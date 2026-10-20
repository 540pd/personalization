---
name: backend-api
description: Express routes, capabilities, auth middleware, Firestore/GCS lib — everything under backend/src/.
---

## Stack snapshot

Express 4, TypeScript strict ESM (`type: "module"`), Vitest. All imports use `.js` extensions
even though source files are `.ts` — this is the NodeNext ESM requirement.

## Key files

- `src/server.ts` — `createApp()` factory + graceful shutdown. Never bind a port on import.
- `src/middleware/requireIdentity.ts` — Two-layer auth gate (session JWT → Google ID token).
- `src/middleware/requestLogger.ts` — Simple request/response logger.
- `src/capabilities/types.ts` — `ImageCapability` interface.
- `src/capabilities/imagen.ts` — Vertex AI Imagen 3. Mock fallback when `VERTEX_PROJECT_ID` unset.
- `src/capabilities/index.ts` — `getCapability()` factory.
- `src/lib/boardStore.ts` — Board CRUD. In-memory stub; TODO Firestore wiring.
- `src/lib/sessionToken.ts` — 30-day JWT sign/verify.
- `src/lib/firestore.ts`, `gcs.ts` — Lazy singletons.
- `src/routes/boards.ts`, `generate.ts`, `assets.ts`, `session.ts`, `authConfig.ts`

## Non-negotiables

- **`createApp()` factory** — export the function, never bind a port on import. Required for supertest.
- **No key → mock mode, never throw** — `VERTEX_PROJECT_ID` absent = console.warn + placeholder, not a crash.
- **`.js` extensions on all imports** — `import { foo } from "./lib/foo.js"` even though file is `foo.ts`.
- **Validate request bodies inline** — `typeof prompt !== "string"` checks, no Zod.
- **`ImageCapability` is the only generation contract** — route code goes through `services/generationService.ts` (`getCapability().generateV2()`), never Vertex AI directly.
- **Session token checked before Google token** — local HMAC verify first (no network), Google verify only as fallback.
- **Global error handler last** — 4-argument `ErrorRequestHandler` at the bottom of `createApp()`.

## Testing

```bash
cd backend && npm run dev    # tsx watch — verify endpoints
npx tsc --noEmit             # must pass before done
```

## Don't

- Add Zod or a validation library unprompted.
- Let a capability or route throw synchronously on a missing env key.
- Hardcode project IDs, bucket names, or regions — always read from env vars.
- Bind a port outside the `isEntryPoint` guard.
