---
name: Make the frontend test harness runnable
labels: chore, testing, refactor
---

## Screen IDs
None — infrastructure only, no surface changes. Prerequisite for BOARD-01 decomposition
(`board-02`..`board-04`), which touch `Board.tsx`, the component behind BOARD-01 / OBJ-01.

## Why this exists

`frontend/package.json` already ships `vitest`, `jsdom`, `@testing-library/react` and
`@testing-library/jest-dom`, with `vitest.config.ts` and `src/test-setup.ts` committed. Nobody has
written a frontend test, and two defects mean nobody could:

1. **`globals: true` is not set.** `setupFiles` loads `src/test-setup.ts`, which imports
   `@testing-library/jest-dom` and calls `expect.extend(...)` at module scope. Every test file
   therefore dies before collection with `ReferenceError: expect is not defined`.
2. **Konva resolves to its Node build.** `konva`'s `"main"` is `./lib/index-node.js`, which does
   `require("canvas")` — a native module that is not installed. Any test importing Konva fails with
   `Cannot find module 'canvas'`. The app itself ships the `"browser"` entry, `./lib/index.js`.

`"test": "vitest run --passWithNoTests"` makes `npm test` exit 0 regardless, so both defects are
invisible today.

## Acceptance criteria

1. `vitest.config.ts` sets `test.globals = true`; a test using bare `expect` collects and runs.
2. `vitest.config.ts` aliases `konva` to the browser build (`konva/lib/index.js`); a test that
   does `import Konva from "konva"` and constructs `new Konva.Group()` passes in the default
   `node` environment.
3. A deliberately failing assertion makes `npm test` exit non-zero (proves `--passWithNoTests` is
   no longer masking real failures).
4. The Playwright regression scripts used to verify canvas behaviour are committed under
   `frontend/e2e/` with a documented way to run them against a local dev server. These are
   currently ad hoc files in a temp directory and are the only safety net for `Board.tsx`.
5. `README` or `docs/` records the one non-obvious constraint found while proving this out:
   **`new Konva.Stage(...)` cannot be constructed under jsdom** — `getContext('2d')` returns
   `null` and Konva throws `Cannot read properties of null (reading 'scale')`. Container-level
   work (`find`, `moveToTop`, `getAttrs`/`setAttrs`, `remove`/`add`, `draggable`) needs no canvas
   at all. Anything needing a Stage belongs in Playwright, not vitest.

## UI states to test
No UI change. Verify nothing regressed:
- [ ] `npm run dev` still boots and the canvas renders
- [ ] `npx next lint` finding count unchanged (3 pre-existing warnings)

## Zoom invariance
- [ ] N/A — no runtime code changes

## Out of scope
- Writing tests for `Board.tsx` logic (that is `board-02`..`board-04`)
- Installing native `canvas` / `node-canvas`
- Any change to `Board.tsx` itself
- CI wiring

## Definition of done
- [ ] `cd frontend && npx tsc --noEmit` passes with 0 new errors
- [ ] `cd frontend && npm test` runs at least one real test and can fail
- [ ] `git diff --name-only` shows only `frontend/vitest.config.ts`, `frontend/e2e/**`, docs
- [ ] No console errors in browser DevTools
