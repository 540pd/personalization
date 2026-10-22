# Pull requests and issues

Generated from GitHub for the handover. Every PR below is **open and unmerged**; each one's base is the PR before it, so they merge **in this order, bottom up**.

## Canvas features (`canvas`)

| # | PR | Branch | Issue |
|---|---|---|---|
| 1 | #200 feat(canvas): Playspace options menu with Clear board (#197) | `feat/playspace-options-clear` | #197 |
| 2 | #201 feat(canvas): Save to file from the Playspace options (#198) | `feat/playspace-save-file` | #198 |
| 3 | #202 feat(canvas): Open file from the Playspace options (#199) | `feat/playspace-open-file` | #199 |
| 4 | #205 feat(canvas): keep the whole board across reloads (#203) | `feat/persist-whole-board` | #203 |
| 5 | #207 feat(skills): Skills page with a table of skills and Upload skill (#206) | `feat/skills-page` | #206 |
| 6 | #209 feat(agents): Agents page with a table of agents and Upload agent (#208) | `feat/agents-page` | #208 |
| 7 | #212 feat(library): edit skills and agents from their table rows (#210) | `feat/edit-library-items` | #210 |
| 8 | #213 feat(library): remove skills and agents with Undo, duplicate agents (#211) | `feat/remove-library-items` | #211 |
| 9 | #216 feat(settings): Settings page with Connection style (#214) | `feat/settings-page` | #214 |
| 10 | #217 feat(settings): Always show node names setting (#215) | `feat/node-names-setting` | #215 |
| 11 | #218 feat(minimap): show the zoom bar while the rail is expanded (#204) | `feat/zoom-bar-expanded-rail` | #204 |
| 12 | #220 feat(brand): Brand as a page over the board instead of a popup (#219) | `feat/brand-page` | #219 |
| 13 | #222 fix(sidebar): keep the collapse button and nav items at the same height (#221) | `feat/rail-toggle-row` | #221 |
| 14 | #226 Frame style bar: 14px gap unless it would cover the name (#223) | `feat/frame-bar-gap` | #223 |
| 15 | #227 Frame: Auto layout and Remove auto layout (#225) | `feat/frame-auto-layout` | #225 |
| 16 | #229 Auto layout: drag to reorder, and items joining the row (#228) | `feat/auto-layout-reorder` | #228 |
| 17 | #231 Auto layout: stack items by dropping above or below (#230) | `feat/auto-layout-stacks` | #230 |
| 18 | #234 Auto layout: resize the Frame to rearrange its items (#232) | `feat/auto-layout-arrange` | #232 |
| 19 | #236 Auto layout: room for item names (#235) | `feat/auto-layout-names` | #235 |
| 20 | #238 feat(library): skill and agent names as handles (#237) | `feat/library-handles` | #237 |
| 21 | #241 feat(prompt): @ to use skills and agents in a Prompt panel (#239) | `feat/prompt-mentions` | #239 |
| 22 | #242 feat(panels): @ to use skills in Image and Video panels (#240) | `feat/media-mentions` | #240 |
| 23 | #245 feat(frames): create a frame from a selection (#243) | `feat/create-frame` | #243 |
| 24 | #246 feat(frames): remove a frame, keeping its contents (#244) | `feat/remove-frame` | #244 |

## Refactor round 1 (#247) (`r1`)

| # | PR | Branch | Issue |
|---|---|---|---|
| 25 | #256 refactor: remove dead code (#248) | `refactor/dead-code` | #248 |
| 26 | #257 refactor: one keyboard guard and listen() for board shortcuts (#249) | `refactor/keyboard-guard` | #249 |
| 27 | #258 refactor: one trackPointer() for window pointer drags (#250) | `refactor/track-pointer` | #250 |
| 28 | #259 refactor: typed canvas events (#251) | `refactor/canvas-events` | #251 |
| 29 | #260 refactor: one Library kit for Skills and Agents (#254) | `refactor/library-kit` | #254 |
| 30 | #261 refactor: shared confirm dialog, portal menu, toast and file helpers (#255) | `refactor/shared-ui` | #255 |
| 31 | #262 refactor: one validator for the backend generate routes (#252) | `refactor/backend-generate` | #252 |
| 32 | #263 fix(proxy): JSON 502/504, a timeout, byte bodies and a path check (#253) | `refactor/proxy-hardening` | #253 |
| 33 | #266 refactor: split NodePanel into hooks and small parts (#264) | `refactor/node-panel-split` | #264 |
| 34 | #267 refactor: shared node-kind controls and postJson; abort and poll-leak fixes (#265) | `refactor/node-kinds` | #265 |
| 35 | #270 refactor: split Board.tsx into board modules (#268) | `refactor/board-split` | #268 |
| 36 | #271 refactor: shared frame geometry helpers (#269) | `refactor/frame-geometry` | #269 |
| 37 | #274 refactor: dock menus on one state, shared dismiss, swatches and pickColor (#272) | `refactor/dock-menus` | #272 |
| 38 | #275 refactor: style bar controls, model and placement as parts (#273) | `refactor/style-bar-parts` | #273 |
| 39 | #277 refactor: shared storage helpers (#276) | `refactor/storage` | #276 |
| 40 | #279 refactor: shared style utilities; canvas skill doc up to date (#278) | `refactor/shared-styles` | #278 |

## Refactor round 2 (#280) (`r2`)

| # | PR | Branch | Issue |
|---|---|---|---|
| 41 | #282 test(e2e): wait for the board after a reload; pin the dev-tools button (#281) | `refactor/e2e-reliability` | #281 |
| 42 | #284 chore(deps): remove the unused zundo and @use-gesture/react (#283) | `refactor/unused-deps` | #283 |
| 43 | #288 refactor: wire geometry in lib/canvas/wires (#285) | `refactor/wires` | #285 |
| 44 | #289 refactor: the @ menu as its own part of MentionInput (#286) | `refactor/mention-menu` | #286 |
| 45 | #290 refactor: one table for the zoom shortcuts, with ⌘ on a Mac (#287) | `refactor/minimap-shortcuts` | #287 |
| 46 | #292 refactor: split the panel store into pure transitions (#291) | `refactor/panel-store` | #291 |
| 47 | #295 refactor: shapes by kind; auto layout maths apart from its sync (#293) | `refactor/shapes-layout` | #293 |
| 48 | #296 refactor: FrameLayer as a composition of board/frame modules (#294) | `refactor/frame-layer` | #294 |

## Shared selection (#280, option C) (`sel`)

| # | PR | Branch | Issue |
|---|---|---|---|
| 49 | #298 refactor: one shared selection slice for Konva nodes, wires and Frames (#297) | `refactor/selection-slice` | #297 |
| 50 | #300 refactor: panels on the shared selection slice (#299) | `refactor/panel-selection` | #299 |

## Tooltips (#280, option C) (`tip`)

| # | PR | Branch | Issue |
|---|---|---|---|
| 51 | #302 refactor: one tooltip for the rail, dock and style bar; dock buttons named (#301) | `refactor/one-tooltip` | #301 |

## Name cleaner (#280, option A) (`names`)

| # | PR | Branch | Issue |
|---|---|---|---|
| 52 | #304 refactor: one cleaner for every name a prompt mentions (#303) | `refactor/name-cleaner` | #303 |

## Small fixes (`fixes`)

| # | PR | Branch | Issue |
|---|---|---|---|
| 53 | #306 test(e2e): select all in an editor with Cmd+A on macOS (#305) | `fix/select-all-in-fields` | #305 |
| 54 | #308 fix(dock): the Upload tooltip reads Ctrl+U off a Mac (#307) | `fix/upload-shortcut-label` | #307 |
| 55 | #310 chore(deps): lockfile entries for Tailwind's optional wasm package (#309) | `chore/lockfile-refresh` | #309 |

## Refactor round 3 (#311) (`r3`)

| # | PR | Branch | Issue |
|---|---|---|---|
| 56 | #315 refactor: split boardFile.ts into the format, the reader and the flows (#312) | `refactor/board-file-split` | #312 |
| 57 | #316 refactor: LibraryPage's kit into files by job (#313) | `refactor/library-page-split` | #313 |
| 58 | #317 fix(proxy): stop waiting on the backend when the browser aborts (#314) | `fix/proxy-forward-abort` | #314 |

## CI on every PR (#318) (`ci`)

| # | PR | Branch | Issue |
|---|---|---|---|
| 59 | #319 ci: run on every PR in the stack, and run the e2e suite (#318) | `ci/every-pr-and-e2e` | #318 |

## Backend plan (#327) (`plan`)

| # | PR | Branch | Issue |
|---|---|---|---|
| 60 | #328 feat(auth): the session cookie keeps you signed in (#320) | `feat/session-cookie` | #320 |
| 61 | #329 feat(auth): sign in with Google (#321) | `feat/google-sign-in` | #321 |
| 62 | #330 feat(backend): storage modes, local emulators and a staging recipe (#322) | `feat/storage-modes` | #322 |
| 63 | #331 feat(assets): store uploads and serve them from a URL (#323) | `feat/asset-store` | #323 |
| 64 | #332 feat(assets): keep generated images and videos as assets (#323) | `feat/generated-assets` | #323 |
| 65 | #337 feat(assets): uploads go into the user's stored assets (#323) | `feat/upload-assets` | #323 |
| 66 | #338 feat(backend): local disk storage, the placeholder for Firestore and Storage (#333) | `feat/local-disk-store` | #333 |
| 67 | #339 feat(auth): dev sign-in, the placeholder for Google (#334) | `feat/dev-sign-in` | #334 |
| 68 | #340 feat(ai): offline placeholder images at the requested shape (#335) | `feat/offline-image-placeholder` | #335 |
| 69 | #341 feat(tooling): a smoke test for a backend after switching to GCP (#336) | `feat/smoke-test` | #336 |
| 70 | #342 feat(boards): save the board to the user's account, by revision (#324) | `feat/board-sync-api` | #324 |
| 71 | #343 feat(boards): the board loads from and saves to the account (#324) | `feat/board-sync` | #324 |
| 72 | #344 feat(boards): a browser's board becomes the account's first, pictures and all (#324) | `feat/board-import` | #324 |
| 73 | #345 feat(jobs): video jobs that outlive their request and the process (#325) | `feat/job-store` | #325 |
| 74 | #346 feat(jobs): Cloud Tasks runs video jobs when it is set up (#325) | `feat/cloud-tasks` | #325 |

## Handover (`docs`)

| # | PR | Branch | Issue |
|---|---|---|---|
| 75 | #347 docs: a handover of the work, its stack and how to merge it | `docs/handover` | – |

## Open issues

74 open. Most are implemented by a PR above (its **Issue** column); see the handover README on closing them as the stack merges.

| Issue | Labels |
|---|---|
| #197 BOARD-02: Playspace options menu + Clear board | canvas, spec |
| #198 BOARD-02: Save to file | canvas, spec |
| #199 BOARD-02: Open file… | canvas, spec |
| #203 BOARD-01: Keep the whole board across reloads | canvas, spec |
| #204 UTIL-01: Show the zoom bar while the rail is expanded | enhancement, canvas, spec |
| #206 SKILL-01: Skills page — list and upload skills | canvas, spec |
| #208 Agents page — list and upload agents | canvas, spec |
| #210 Edit skills and agents | canvas, spec |
| #211 Remove skills and agents, and duplicate agents | canvas, spec |
| #214 Settings page, with Connection style as its first setting | canvas, spec |
| #215 Setting: Always show node names | canvas, spec |
| #219 Brand: a page over the board instead of a popup | canvas, spec |
| #221 Rail: keep the collapse button and nav items at the same height in both states | canvas, spec |
| #223 Frame style bar: same 14px gap as shapes unless it would cover the name | canvas, spec |
| #225 Frame: Auto layout and Remove auto layout | canvas, spec |
| #228 Auto layout: drag to reorder, and items joining the row | canvas, spec |
| #230 Auto layout: stack items by dropping above or below | canvas, spec |
| #232 Auto layout: resize the Frame to rearrange its items | canvas, spec |
| #235 Auto layout: room for item names | canvas, spec |
| #237 Skills and agents: names as handles (no spaces) | canvas, spec |
| #239 Prompt panel: @ to use skills and agents | canvas, spec |
| #240 Image and Video panels: @ to use skills | canvas, spec |
| #243 Create frame from a selection | canvas, spec |
| #244 Remove frame, keeping its contents | canvas, spec |
| #247 Refactor for production: modular, shared, smaller files | refactor |
| #248 Refactor 1: remove dead code | refactor |
| #249 Refactor 2: one keyboard guard and listen() for every board shortcut | refactor |
| #250 Refactor 3: one trackPointer() for window pointer drags | refactor |
| #251 Refactor 4: typed canvas events | refactor |
| #252 Refactor 12: one validator for the backend generate routes | refactor |
| #253 Fix 13: harden the API proxy (errors, timeout, binary bodies, path check) | bug, refactor |
| #254 Refactor 11a: one Library kit for Skills and Agents (pages, dialogs, stores) | refactor |
| #255 Refactor 11b: shared confirm dialog, portal menu, toast and file helpers | refactor |
| #264 Refactor 6: split NodePanel into hooks and small parts | refactor |
| #265 Refactor 7: shared node-kind controls and postJson; abort and poll-leak fixes | refactor |
| #268 Refactor 5: split Board.tsx into board modules | refactor |
| #269 Refactor 8: shared frame geometry helpers | refactor |
| #272 Refactor 9a: dock menus on one state, shared dismiss, swatches and pickColor | refactor |
| #273 Refactor 9b: style bar controls, model and placement as parts | refactor |
| #276 Refactor 10: shared storage helpers | refactor |
| #278 Refactor 14: shared style utilities; bring the canvas skill doc up to date | documentation, refactor |
| #280 Refactor round 2: the next-largest files and round 1's follow-ups | refactor |
| #281 R2-1: e2e waits for the board after a reload; pin the dev-tools button | refactor |
| #283 R2-2: remove the unused zundo and @use-gesture/react | refactor |
| #285 R2-6: ConnectionOverlay — wire geometry in lib/canvas/wires | refactor |
| #286 R2-7: the @ menu as its own part of MentionInput | refactor |
| #287 R2-8: one table for the zoom shortcuts, with ⌘ on a Mac | refactor |
| #291 R2-3: split the panel store into pure transitions | refactor |
| #293 R2-4: shapes by kind; auto layout maths apart from its sync | refactor |
| #294 R2-5: FrameLayer as a composition of board/frame modules | refactor |
| #297 Selection 1/2: one shared selection slice for Konva nodes, wires and Frames | refactor |
| #299 Selection 2/2: panels on the shared selection slice | refactor |
| #301 Tooltips: one component for the rail, dock and style bar; names for the dock's buttons | accessibility, refactor |
| #303 Names: one cleaner for every name a prompt mentions | refactor |
| #305 e2e: select-all inside an editor uses Ctrl+A, which on macOS moves the caret | bug |
| #307 Dock: the Upload tooltip shows ⌘U on Windows and Linux too | bug |
| #309 Lockfile: 7 stale @emnapi entries under Tailwind's optional wasm package | bug |
| #311 Refactor round 3: the last two multi-job files, and the proxy abort | refactor |
| #312 R3-1: split boardFile.ts into the format, the reader and the save/open flows | refactor |
| #313 R3-2: LibraryPage's kit into files by job | refactor |
| #314 R3-3: the proxy stops waiting when the browser aborts | refactor |
| #318 CI: run on every stacked PR, and run the e2e suite | – |
| #320 Backend 1: the session cookie keeps you signed in | enhancement, spec |
| #321 Backend 2: Sign in with Google | enhancement, spec |
| #322 Backend 3: Firestore and Cloud Storage for local dev, CI and staging | enhancement, spec |
| #323 Backend 4: images and videos as stored assets, not data URLs | enhancement, spec |
| #324 Backend 5: the board saved to your account | enhancement, spec |
| #325 Backend 6: video jobs that survive restarts | enhancement, spec |
| #326 Backend 7: production setup | enhancement, spec |
| #327 Backend plan: accounts, Firestore and Cloud Storage | spec |
| #333 Placeholder: local disk storage for boards and assets | enhancement, spec |
| #334 Placeholder: dev sign-in instead of Google | enhancement, spec |
| #335 Placeholder: offline AI images at the right shape | enhancement, spec |
| #336 Smoke test for a backend after switching to GCP | enhancement, spec |
