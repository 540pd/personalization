---
name: Canvas Feature
about: Spec for a canvas feature — screen IDs, ACs, UI states, out of scope
labels: canvas, spec
---

## Screen IDs
<!-- Reference IDs from docs/luma-reference/Luma_UI_UX_Screen.docx -->
<!-- e.g. BOARD-01, TOOL-01, IMG-01 -->

## User story
<!-- One sentence: As a [user], when I [action], I see [result] -->

## Acceptance criteria
<!-- Numbered, each independently verifiable -->
1. 
2. 
3. 

## UI states to test
<!-- Every visual state that must be checked manually before closing this issue -->
- [ ] Default
- [ ] Hover
- [ ] Active / selected
- [ ] Loading
- [ ] Error
- [ ] Empty

## Zoom invariance
<!-- Canvas features must be tested at these zoom levels -->
- [ ] 50%
- [ ] 100%
- [ ] 150%

## Out of scope
<!-- What is deliberately NOT in this issue -->
- 

## Definition of done
- [ ] `cd frontend && npx tsc --noEmit` passes with 0 new errors
- [ ] `cd backend && npx tsc --noEmit` passes with 0 new errors (if backend changed)
- [ ] `git diff --name-only` shows only in-scope files
- [ ] All UI states above verified manually
- [ ] No console errors in browser DevTools
- [ ] Zoom invariance confirmed at 50%, 100%, 150%
