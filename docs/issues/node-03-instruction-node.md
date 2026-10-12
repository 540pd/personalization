---
name: node > instruction — a text node backed by Gemini
labels: enhancement, area:canvas, area:panels, area:backend
---

Blocked by: `node-02`

## Screen IDs
TOOL-01 (dock entry exists already), BOARD-01, OBJ-01, IMG-02 (panel pattern).

## Why this first, before video

The instruction node is the honest test of the `node-02` registry: it is the kind that differs
most from image in the small ways, while needing none of the heavy machinery video needs. It is
synchronous, has no binary payload, and no aspect ratio — so if the registry can express it
without `SinglePanel` learning about it, the abstraction holds.

It also forces the part of the data model that image-only hid: **a text output used as a
reference downstream.** Today `ReferenceImage` is image-only and `buildContentParts` emits only
`inlineData`, so a text node feeding an image node has nowhere to go.

## Acceptance criteria

### Frontend
1. `NODE_KINDS.instruction` added. The dock's `generate-instruction` item creates one; it no
   longer falls through to `closeAllPanels()`.
2. The node renders its generated text in the placeholder, scrolling or truncating within the
   node box rather than overflowing it.
3. Default size comes from the spec and is **not** aspect-ratio driven. The advanced section
   offers temperature and nothing image-specific; no aspect ratio or quality control appears.
4. Everything shared works with no kind-specific code: drag, resize, selection takeover, ports,
   occlusion, raise-on-drag, label and rename, connections.
5. An instruction node can be connected into an image node's input, and its text reaches the
   model as context.

### Backend
6. `ReferenceImage` is generalised. Suggested shape, keeping backward compatibility with the
   bare-string and `{url, name}` forms `routes/generate.ts` already accepts:
   ```ts
   type Reference =
     | { kind: "image"; url: string; name?: string }
     | { kind: "text";  text: string; name?: string };
   ```
7. `buildContentParts` handles both. A text reference emits
   `{ text: 'Reference "<name>": <text>' }` in the same interleaved position an image reference
   occupies. Its existing tests must keep passing unchanged.
8. **`buildContentParts` moves out of `capabilities/imagen.ts`** into a shared module. Composing
   named references ahead of an instruction is identical for every model; it must not be copied
   into a second capability.
9. A text capability + `POST /api/generate/text`, following the existing route shape:
   `modelId` validated against an allowlist, `instruction` required, inline `typeof` checks, no
   Zod. Mock mode on a missing `VERTEX_PROJECT_ID` — return placeholder text, never crash.
10. Request validation shared with `/generate/image` rather than copied; the two differ only in
    their model allowlist and their optional fields.

### Tests
11. Extend `buildContentParts` tests: a text reference interleaves in order; mixed image and text
    references keep their relative order; an unnamed text reference falls back to
    `Reference N`; empty text is skipped.
12. e2e: create an instruction node, generate (mock), confirm text renders in the node; connect
    it to an image node and confirm the request carries the text reference.

## UI states to test
- [ ] Default — empty instruction, submit inert
- [ ] Generating — spinner, no double submit
- [ ] Error — message shown, recoverable
- [ ] Success — text renders inside the node box, long text does not overflow
- [ ] Resize the node — text reflows, does not spill
- [ ] Selected — label above, ports on the edges, same as an image node
- [ ] Instruction node covered by another node — its port hides, same rule
- [ ] Instruction node feeding an image node — reference reaches the backend named

## Zoom invariance
- [ ] 50% / 100% / 150%

## Out of scope
- node > video (`node-04`)
- Streaming the response token by token
- Markdown rendering inside the node
- Editing generated text in place

## Definition of done
- [ ] `cd frontend && npx tsc --noEmit` — 0 new errors
- [ ] `cd backend && npx tsc --noEmit` — 0 new errors
- [ ] `cd backend && npm test` — buildContentParts tests pass, old and new
- [ ] `cd frontend && npm run test:e2e` — passes, including the new specs
- [ ] All UI states above verified manually
- [ ] No console errors in browser DevTools
- [ ] Zoom invariance confirmed at 50%, 100%, 150%
