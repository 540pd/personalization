---
name: Extract CreateImageForm from NodePanel
labels: refactor, canvas
---

Blocked by: nothing. Independent of `canvas-01`/`canvas-02` and of `board-01`..`board-04`.

## Screen IDs
IMG-01 (image model picker), IMG-02 / IMG-03 (Create Image panel, basic and advanced).
Behaviour identical before and after.

## Why this exists

`NodePanel.tsx` is 838 lines, the largest file in the repo. `SinglePanel` is ~645 of those and
does two unrelated jobs:

```
126-516   the canvas node: placeholder, ports, label, drag, resize, selection chrome
517-771   the Create Image form: model picker, instruction, advanced settings, Create  <- 254 lines
```

The form is not a canvas node. It is a form that happens to be positioned next to one. It owns 10
pieces of state the node never reads, and the node owns geometry the form never reads. This is
the cleanest split available anywhere in the codebase: one prop interface, no Konva, no shared
closure.

## The two real couplings

**1. `aspectRatio` crosses the boundary.** It is a form control, but changing it resets the
node's size (`NodePanel.tsx:158-166` -> `placeholderSize(aspectRatio)` -> `setSizeW`/`setSizeH`).
So it must be **lifted to the parent** and passed down as a controlled `value` + `onChange`. It is
the only one of the 10 state values that does this; the rest move wholesale.

**2. `handleCreate` (lines 300-344) mixes three concerns:** reading form state, collecting
reference images by walking the connection and node stores, and writing results back to
`nodePanel` (`setPreview`, `setLabel`). Reference collection is graph knowledge and belongs with
the node, not the form.

## Acceptance criteria

1. New `frontend/src/app/canvas/components/NodePanel/CreateImageForm.tsx` holding the panel JSX
   and these 9 pieces of state: `model`, `isModelOpen`, `instruction`, `advancedOpen`,
   `thinking`, `temperature`, `grounding`, `quality`, plus the `modelPickerRef` outside-click
   effect.
2. `aspectRatio` stays in `SinglePanel` and is passed as `{ aspectRatio, onAspectRatioChange }`.
   Changing it from the form must still reset the node's placeholder size, and must still **not**
   reset it when the user has manually resized without touching the dropdown (the `prevAR` guard).
3. Generation splits along the concern boundary:
   - the form owns `isGenerating` / `genError` and the submit affordance
   - the form calls `onGenerate(params): Promise<void>`
   - `SinglePanel` owns reference collection and the `setPreview` / `setLabel` writes
   - the "only seed a default label, never overwrite a user's name" rule stays with the parent
4. `MODELS`, `ASPECT_RATIOS`, `QUALITIES`, `THINKING_OPTS` move with the form.
   `labelFromInstruction` and `uniqueLabel` stay with the parent (they name the node).
5. `NodePanel.tsx` drops to roughly 580 lines; `CreateImageForm.tsx` is roughly 280.
6. No change to `NodePanel.scss`; the form keeps `rounded-2xl` (it is a floating card, not a node).
7. Unit tests, jsdom, using the installed `@testing-library/react`:
   - typing an instruction then submitting calls `onGenerate` once with the current model,
     quality, thinking, temperature and grounding values
   - the Create affordance is inert while the instruction is empty, and while generating
   - a rejected `onGenerate` surfaces the error message and clears the generating state
   - changing the aspect-ratio dropdown calls `onAspectRatioChange` and does not manage the
     value itself

## UI states to test
- [ ] Default - empty instruction, Create disabled
- [ ] Model picker open, selecting a model, closing on outside click
- [ ] Advanced section collapsed and expanded
- [ ] Typing an instruction - Create becomes enabled
- [ ] Generating - spinner, Create inert, no double submit
- [ ] Error - message shown, recoverable by resubmitting
- [ ] Success - preview fills the node, name seeded from the instruction
- [ ] Changing aspect ratio - node placeholder resizes, panel follows
- [ ] Panel open on a node near the right edge - still flips inboard
- [ ] Generating with upstream nodes connected - references still sent with their names

## Zoom invariance
- [ ] 50%
- [ ] 100%
- [ ] 150%

## Out of scope
- Any change to the form's appearance, fields, defaults or validation
- The placeholder node, ports, label, drag, resize or selection chrome
- Panel placement logic (the inboard flip)
- `lib/canvas` extraction (`canvas-01`, `canvas-02`)

## Definition of done
- [ ] `cd frontend && npx tsc --noEmit` passes with 0 new errors
- [ ] `cd frontend && npm test` passes, including the new tests
- [ ] `git diff --name-only` shows only `NodePanel.tsx` and `CreateImageForm.tsx` + tests
- [ ] All UI states above verified manually
- [ ] No console errors in browser DevTools
- [ ] Zoom invariance confirmed at 50%, 100%, 150%
