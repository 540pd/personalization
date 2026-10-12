---
name: Make the node panel kind-driven (registry + generic GenerateForm)
labels: refactor, canvas, area:panels
---

Blocked by: `node-01`
Blocks: `node-03`, `node-04`
**Supersedes `canvas-03`** — see below.

## Screen IDs
IMG-01, IMG-02, IMG-03 — **no visible change** for image nodes.

## Why this exists

Three node kinds share almost everything and differ in a small, enumerable way:

| Shared | Per-kind |
|---|---|
| placement, drag, resize, selection, z-order | model list |
| ports, connections, label, rename | advanced fields |
| panel shell: header, model picker, instruction box, submit | empty-state copy |
| the 3-state lifecycle | output rendering (`img` / `video` / text) |
| occlusion, raise-on-drag, undo | default size |
| | what it contributes as a downstream reference |

Writing a second and third panel component would duplicate every behaviour fixed in #40 and #41.
Instead, `SinglePanel` becomes kind-agnostic and each kind supplies a spec.

## Relationship to `canvas-03`

`canvas-03` proposes extracting a `CreateImageForm` from `NodePanel.tsx`. **Do that extraction
here instead, generalised.** Same 254 lines leave `NodePanel.tsx`; they land as a spec-driven
`GenerateForm` rather than an image-specific component. `canvas-03` should be closed as superseded
rather than done first and redone.

## Proposed shape

```ts
export interface NodeKindSpec {
  kind: NodeKind;
  title: string;                                  // "Create Image"
  models: { id: string; label: string }[];
  defaultSize(): { w: number; h: number };
  EmptyState: React.FC;                           // "Image will appear here"
  Output: React.FC<{ value: string }>;
  AdvancedFields: React.FC<AdvancedProps>;
  generate(params: GenerateParams): Promise<PanelOutput>;
  asReference(output: PanelOutput, name?: string): Reference | null;
}

export const NODE_KINDS: Record<NodeKind, NodeKindSpec>;
```

## Acceptance criteria

1. `NODE_KINDS` registry added, with the `image` entry carrying today's behaviour verbatim:
   the three Nano Banana models, aspect ratio + quality + thinking + temperature + grounding,
   "Image will appear here", and `placeholderSize()` for its default size.
2. `GenerateForm` replaces the inline panel JSX in `NodePanel.tsx`, driven entirely by the spec.
   `NodePanel.tsx` drops to roughly 580 lines.
3. **`aspectRatio` stays in the parent.** It is a form control but it resets the node's size
   (`NodePanel.tsx` `prevAR` effect), so it is passed down as `{ value, onChange }`. It is the
   only one of the form's state values that crosses the boundary; the other nine move wholesale.
   A kind whose size is not ratio-driven (instruction) must be able to omit it entirely.
4. Generation splits along the concern boundary: the form owns `isGenerating` / `genError` and
   calls `onGenerate(params)`; `SinglePanel` owns reference collection and the store writes,
   including the "only seed a default label, never overwrite a user's name" rule.
5. The registry is the **only** place a kind is enumerated. Adding a fourth kind must not require
   editing `SinglePanel`, `KonvaNodePorts`, `ConnectionOverlay` or `Board`.
6. Unit tests (vitest, jsdom) for `GenerateForm`:
   - submitting calls `onGenerate` once with the current field values
   - submit is inert while the instruction is empty and while generating
   - a rejected `onGenerate` surfaces the message and clears the generating state
   - a spec with no `AdvancedFields` renders no advanced section
   - a spec with no aspect ratio does not call `onAspectRatioChange`

## UI states to test
All of these are image-node states and must be **identical** to before:
- [ ] Default, empty instruction, Create inert
- [ ] Model picker open / select / outside-click close
- [ ] Advanced collapsed and expanded
- [ ] Generating — spinner, no double submit
- [ ] Error — message shown, recoverable
- [ ] Success — preview fills the node, name seeded
- [ ] Changing aspect ratio resizes the placeholder
- [ ] Panel near the right edge still flips inboard
- [ ] Generating with upstream nodes connected still sends named references

## Zoom invariance
- [ ] 50% / 100% / 150%

## Out of scope
- Adding the instruction or video kinds (`node-03`, `node-04`) — this issue ships the registry
  with **one** entry, so the abstraction is proved against the existing kind before new ones
  are built on it
- Backend changes
- A `CanvasNode` interface covering uploaded Konva images too. Tempting, but uploads are a
  different beast (no panel, no generation); keep this to panel kinds.

## Definition of done
- [ ] `cd frontend && npx tsc --noEmit` — 0 new errors
- [ ] `cd frontend && npm test` and `npm run test:e2e` both pass
- [ ] `git diff --name-only` shows only in-scope files
- [ ] All UI states above verified manually
- [ ] No console errors in browser DevTools
- [ ] Zoom invariance confirmed at 50%, 100%, 150%
