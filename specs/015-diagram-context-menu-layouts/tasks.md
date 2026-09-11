---

description: "Task list for feature implementation"
---

# Tasks: Diagram Context Menu Actions & Static Layouts

**Input**: Design documents from `/specs/015-diagram-context-menu-layouts/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/webview-messages.md](./contracts/webview-messages.md), [quickstart.md](./quickstart.md)

**Tests**: Test tasks ARE included. Not because the spec asked for them, but because Constitution Principle VI (NON-NEGOTIABLE) requires every feature to ship with at least one CI-runnable test. The testable surface here is the pure geometry in `layout.js` plus diagram-document persistence — see [research.md §5](./research.md).

**Organization**: Tasks are grouped by user story so each can be implemented and verified independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Include exact file paths in descriptions

## Path Conventions

VS Code extension with a webview canvas. Extension host code in `src/`, canvas code in
`src/webview/diagram/` (copied verbatim to `dist/webview/` by `esbuild.js`, not
bundled), tests in `src/test/` compiled to `out/test/` and run by `@vscode/test-cli`.

## ⚠️ A note on parallelism in this feature

Most of the work lands in three files — `src/webview/diagram/main.js`,
`interactions.js`, and `state.js`. Tasks touching the same file are **not** marked
`[P]` even when they are logically independent, because they would conflict. Real
parallel opportunities here are limited to the test tasks, the CSS/HTML tasks, and
`layout.js`. This is stated plainly rather than sprinkling `[P]` optimistically.

## ⚠️ Story sequencing note

spec.md has three P1 stories. **US3 is sequenced first among them** — not because it
is more valuable, but because it is the enabling refactor: it deletes the
`hierarchical` / `physicsEnabled` state that US5 and US4 would otherwise have to work
around, and it touches the same three files every other story edits. Doing it after
the others would mean reworking them. US1 and US2 are genuinely independent of each
other and of US3, and could be reordered if you would rather demo removal first.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Put the new file, the new DOM elements, and the new test suite in place so
later phases have somewhere to write.

- [X] T001 Create `src/webview/diagram/layout.js` as a dual-mode module: an IIFE that assigns `{ gridPositions, findFreeSlot }` to `window.DoorstopDiagram.layout` when `window` is defined, and to `module.exports` when `module` is defined, so the same file is loadable by the webview and by a Node test. Stub both functions for now (`findFreeSlot` in T018, `gridPositions` in T035). No DOM and no `vis` reference — the caller supplies all measurements ([research.md §5](./research.md), [data-model.md §6](./data-model.md)).
- [X] T002 Add `<script nonce="{{nonce}}" src="{{layoutJsUri}}"></script>` to `src/webview/diagram/diagram.html` positioned **after** `state.js` and **before** `render.js`, `interactions.js` and `main.js`, since both consumers need it at load time. Add the matching `layoutJsUri` replacement in `_getHtmlForWebview()` in `src/diagrammPanel.ts` alongside the existing `stateJsUri`/`mainJsUri` entries.
- [X] T003 [P] Add a `<div id="diagram-status" hidden></div>` to `src/webview/diagram/diagram.html` as a sibling of the existing `#ghost-preview-status`. It is a separate element with a separate role: transient canvas prompts (link-target selection, self-link rejection), while `#ghost-preview-status` keeps its own ghost-loading-failure role ([data-model.md §8](./data-model.md)).
- [X] T004 [P] Style `#diagram-status` in `src/webview/diagram/diagram.css`, mirroring the existing `#ghost-preview-status` rules so the two banners look consistent.
- [X] T005 [P] Register a fourth config in `.vscode-test.mjs` with `label: 'diagramLayout'` and `files: 'out/test/diagramLayout.test.js'`. The glob must stay non-overlapping with the existing `unit`, `regressionFixture` and `reviewLensScan` globs, as the file's own comment requires. No `workspaceFolder` is needed — this suite touches no fixture workspace.
- [X] T006 [P] Create `src/test/diagramLayout.test.ts` with an empty Mocha `suite()` that `require`s `dist/webview/diagram/layout.js` by absolute path resolved from `__dirname`, proving the dual-mode export actually loads under Node before any assertions are written.
- [X] T007 Run `npm run compile` and confirm `dist/webview/diagram/layout.js` exists — `esbuild.js` copies `src/webview/**` wholesale, so no build-script change should be required. If it is, fix `esbuild.js` here rather than in a later phase.

**Checkpoint**: New file loads in both the webview and Node; new test suite runs (and is empty); new DOM elements exist but do nothing.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The state-shape surgery and the shared helpers that two or more stories
depend on. Everything after this assumes these exist.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete — every
story phase reads or writes the state fields changed here.

- [X] T008 In `src/webview/diagram/state.js`, remove the fields and their getter/setter pairs for `physicsEnabled`, `physicsToggleSuspended`, `hierarchical`, and `manualPositions`. Add `pendingLinkSource` (`string | null`, initial value `null`) with a getter and setter. Keep `visNodes`, `visEdges`, `ghostMeta`, `clearGhosts`, `nodeMap`, `nodeMeta`, `getDiagramData`, `saveGraphState`, `ghostPreviewEnabled` and `headingDisplayEnabled` untouched ([data-model.md §2–4](./data-model.md)). This will break `main.js` and `interactions.js` compilation-by-inspection until T012–T019 land — that is expected and is why this phase blocks.
- [X] T009 In `src/webview/diagram/main.js`, add a `nodeExtents(ids)` helper returning `Array<{ id, width, height }>` derived from `network.getBoundingBox(id)` for each id. Used by the grid pitch calculation (T037) and by auto-placement (T019). Guard against `getBoundingBox` returning undefined for a node not yet drawn by falling back to a documented default extent rather than producing `NaN` coordinates (Constitution III).
- [X] T010 In `src/webview/diagram/main.js`, add an `applyPositions(updates)` helper taking `Array<{ id, x, y }>`: writes them into `state.visNodes`, calls `network.redraw()`, then `state.saveGraphState(network)` and `messaging.send('diagramChanged', { diagram: state.getDiagramData(network) })`. Per [contracts/webview-messages.md](./contracts/webview-messages.md) invariant 2, the `diagramChanged` payload must be built **after** the positions are written and the network has settled, so `getPositions()` returns the new coordinates rather than stale ones. Shared by US4 and US5.
- [X] T011 In `src/webview/diagram/main.js`, add `setDiagramStatus(text)` and `clearDiagramStatus()` that show/hide `#diagram-status` and set its text content. Export them on `window.DoorstopDiagram` (or pass into `interactions.init`) so `interactions.js` can drive the banner during link-target selection.

**Checkpoint**: State shape is final; shared helpers exist. User story phases can begin.

---

## Phase 3: User Story 3 - Body items never move on their own (Priority: P1) 🎯 MVP

**Goal**: Body items become permanently static. The auto-arrange button and every
piece of state behind it disappear. Ghost items keep behaving exactly as they do
today.

**Independent Test**: Arrange several items by hand, then add another item and toggle
Ghost Preview and Show Headings on and off. No previously placed body item moves. The
toolbar has no auto-arrange button. (quickstart.md §US3)

- [X] T012 [US3] In `src/webview/diagram/main.js`, delete `currentPhysicsOptions()` and demote `PHYSICS_OFF` to a plain "engine off" constant with no user-preference meaning. Keep `PHYSICS_ON` — it is still needed while Ghost Preview runs. Set the initial `options.physics` to the engine-off value, since no ghosts exist at construction time ([data-model.md §5](./data-model.md)).
- [X] T013 [US3] In `src/webview/diagram/main.js`, make every body-node insertion carry `physics: false` unconditionally: in the `loadDiagram` handler's `render.toVisNode(merged)` path and in the `addNode` handler. Delete the `if (state.ghostPreviewEnabled) { state.visNodes.update({ id: uid, physics: false }); }` conditional in `addNode` — it is now redundant. Do **not** use `fixed: {x,y}`; that would block the user's own drag, which FR-021 requires to keep working ([research.md §1](./research.md)).
- [X] T014 [US3] In `src/webview/diagram/main.js`'s `ghostPreviewData` handler, remove the now-redundant loop that re-pins body items with `physics: false` (they are pinned from insertion). Keep `network.setOptions({ physics: PHYSICS_ON })` — ghost positioning still needs the solver running (FR-016).
- [X] T015 [US3] In `src/webview/diagram/main.js`, rewrite `exitGhostPreview()`: remove the `state.visNodes.update(... physics: true)` un-pin (body items must stay pinned forever), remove the `layoutButton.disabled = false` and `physicsButton.disabled` / `physicsToggleSuspended` restoration, and replace the `if (!state.hierarchical)` branch with an unconditional `network.setOptions({ physics: <engine off> })`. Update its doc comment, which currently describes the mutual-exclusion locks being released.
- [X] T016 [US3] In `src/webview/diagram/main.js`'s `setupGhostPreviewToggle()`, remove the code that disables `#layout-toggle` and `#physics-toggle` on entry and the `physicsToggleSuspended` bookkeeping. Keep the pin-before-flip ordering comment's intent, but note the pin is now unconditional. No toolbar control may be disabled as a side effect of another (FR-024).
- [X] T017 [US3] Delete `setupPhysicsToggle()` from `src/webview/diagram/main.js` and its call from the setup block at the bottom of the file. Remove the `<button id="physics-toggle" type="button">Disable Auto-Arrange</button>` line from `src/webview/diagram/diagram.html` (FR-017).
- [X] T018 [US3] Implement `findFreeSlot({ occupied, width, height, center })` in `src/webview/diagram/layout.js`. Contract from [data-model.md §6](./data-model.md), verbatim: `occupied` is `Array<{x, y, width, height}>` of existing node boxes; returns `{ x, y }`, "the first position on an outward spiral from `center` whose box overlaps nothing in `occupied`"; "with `occupied` empty it returns `center`". Pure function — no DOM, no `vis`.
- [X] T019 [US3] In `src/webview/diagram/main.js`'s `addNode` handler, honour the new optional `autoPlace` field: when `message.node.autoPlace === true`, ignore `pointer` and compute the position with `layout.findFreeSlot`, passing `nodeExtents()` of the current body nodes as `occupied` and `network.getViewPosition()` as `center`. When `autoPlace` is absent or false, honour `pointer` exactly as today ([contracts/webview-messages.md](./contracts/webview-messages.md) §Changed).
- [X] T020 [US3] In `src/diagrammPanel.ts`, change `addRequirementToDiagram()` to stop generating a random pointer (`Math.round((Math.random() - 0.5) * 300)`) and instead pass the node through with `autoPlace: true`. Leave `handleCreateLinkedItem` and `handlePromoteGhost` sending real pointers — both have a meaningful drop point (the right-clicked node's location), and drag-from-editor keeps its real pointer too.
- [X] T021 [US3] In `src/webview/diagram/interactions.js`, remove the `&& !state.hierarchical` guard from the `network.on('dragEnd')` handler so every drag persists. Per [data-model.md §3](./data-model.md) this is a behaviour fix, not just a cleanup: drags were previously silently discarded while hierarchical mode was active.
- [X] T022 [P] [US3] In `src/test/diagramLayout.test.ts`, add assertions for `findFreeSlot`: with an empty `occupied` it returns exactly `center`; with a node box centred on `center` it returns a point whose box overlaps nothing in `occupied`; the same input twice returns the same point (FR-015).

**Checkpoint**: Body items are immovable except by the user. Auto-arrange is gone. Ghost Preview still works identically. Demoable on its own.

---

## Phase 4: User Story 1 - Remove an item from the diagram (Priority: P1)

**Goal**: A body node's context menu can remove it from the diagram, without touching
the requirement or any of its links.

**Independent Test**: Right-click a node, remove it, confirm the node and its lines
vanish, the removal survives save/reopen, and `git diff` shows zero bytes changed in
the requirement files. (quickstart.md §US1)

- [X] T023 [US1] In `src/webview/diagram/main.js`, add `removeBodyNode(uid)`: remove the node from `state.visNodes`; remove every edge in `state.visEdges` whose `from` or `to` is `uid` (both persisted and `ephemeral` ones); delete the `uid` entries from `state.nodeMap` and `state.nodeMeta`; then `state.saveGraphState(network)` and send `diagramChanged` (FR-002, FR-004). Deliberately **no** message round trip to the extension host — the requirement and its links must not change, so there is nothing for the server to do and no failure mode to handle ([contracts/webview-messages.md](./contracts/webview-messages.md) §New).
- [X] T024 [US1] In `removeBodyNode` in `src/webview/diagram/main.js`, guard the no-op cases: a `uid` that is not in `visNodes`, and a `uid` that is a key of `ghostMeta` (ghosts are removed by turning Ghost Preview off, not by this action). Removing the last remaining node must leave an empty canvas with no error, and should call `render.setDropHintVisible(true)` when `state.visNodes` is empty afterwards.
- [X] T025 [US1] In `removeBodyNode` in `src/webview/diagram/main.js`, add the FR-005 follow-up: if `state.ghostPreviewEnabled` is true after removal, send `{ command: 'requestGhostPreview', enabled: true, bodyUids: <remaining body uids> }`, mirroring what the `addNode` handler already does after a ghost promotion. This makes ghosts that existed only because of the removed item disappear.
- [X] T026 [US1] In `removeBodyNode` in `src/webview/diagram/main.js`, clear `state.pendingLinkSource` and the status banner if the removed node is the pending link source (spec Edge Cases: "Removing a node while the add-link action is waiting for a target: the pending action is cancelled and no link is created"). This task depends on T008 having added the field; the US2 flow that sets it lands in Phase 5.
- [X] T027 [US1] In `src/webview/diagram/interactions.js`, add a **"Remove from Diagram"** entry to the body-node context menu built in the `network.on('oncontext')` handler, calling `removeBodyNode(nodeId)`. Keep the existing "Add Linked Item…" entry and place removal last, so a destructive action is not adjacent to the pointer's landing position. The ghost-node menu ("Add to Diagram") and the edge menu ("Remove Link") stay untouched (FR-012).
- [X] T028 [P] [US1] In `src/test/diagramLayout.test.ts`, add a diagram-document round-trip assertion: write a temporary `*.doorstop.json` with several nodes and edges, drop one node plus its incident edges from the structure the way `getDiagramData` would, read it back through `DiagramPanel.readDiagram`, and assert the removed node is absent and every other node and edge survives unchanged (FR-002, FR-004). Create and clean up the temp file within the test (Constitution VI).

**Checkpoint**: Removal works end to end and persists. Requirement files provably untouched.

---

## Phase 5: User Story 2 - Create a link between two items from the context menu (Priority: P1)

**Goal**: Right-click a node, choose "Add Link to…", click a second node, get a real
Doorstop link — no drag gesture.

**Independent Test**: With two unlinked nodes, link them via the context menu and
confirm the arrow appears and the source requirement's `links:` contains the target's
UID. (quickstart.md §US2)

- [X] T029 [US2] In `src/webview/diagram/interactions.js`, add an **"Add Link to…"** entry to the body-node context menu. On click it sets `state.pendingLinkSource = nodeId` and calls `setDiagramStatus('Click the item to link to. Esc to cancel.')` (FR-006).
- [X] T030 [US2] In `src/webview/diagram/interactions.js`, intercept target selection at the **top** of the existing `network.on('click')` handler: when `state.pendingLinkSource` is non-null, consume the click as a target pick and `return` before the normal `activateNode`/`openFile` sends. Jumping the editor mid-gesture would steal focus ([research.md §4](./research.md)).
- [X] T031 [US2] In the click interception from T030 in `src/webview/diagram/interactions.js`, apply the target validity rules: reject the source node itself with `setDiagramStatus('Cannot link an item to itself.')` and clear the pending state (FR-009); reject a ghost node (a key of `state.ghostMeta`) with a message explaining it must be added to the diagram first — a link to a ghost is a real Doorstop link whose edge is drawn `ephemeral` and vanishes when Ghost Preview turns off, which is indistinguishable from the write having failed ([research.md §4](./research.md)).
- [X] T032 [US2] In `src/webview/diagram/interactions.js`, add the cancel paths (FR-008): <kbd>Esc</kbd> via a keydown listener, and a click on empty canvas (the existing click handler's `params.nodes.length === 0` case). Both clear `state.pendingLinkSource` and the banner and change nothing else.
- [X] T033 [US2] In `src/webview/diagram/interactions.js`, on a valid target register an entry in `main.js`'s existing `pendingLinkOps` map keyed `` `${from}->${to}` `` whose value is a function that adds the edge to `state.visEdges`, then send the existing `{ command: 'addLink', from, to }` message. Do **not** add the edge optimistically and do **not** bypass the existing `linkAddResult` handler — one result path, not two ([contracts/webview-messages.md](./contracts/webview-messages.md) §Reused). The `pendingLinkOps` map currently stores `vis-network` `addEdge` callbacks; the entry shape must stay compatible with how `linkAddResult` invokes it.
- [X] T034 [US2] Verify the three outcomes flow correctly through the untouched `linkAddResult` handler: success adds the edge and persists via `diagramChanged` (FR-007); a repeat of an existing link succeeds silently with no duplicate arrow, since Doorstop stores links as a set (FR-010); a failure leaves the diagram unchanged after `handleAddLink` in `src/diagrammPanel.ts` has already shown the error message (FR-011). Clear `state.pendingLinkSource` and the banner in all three cases.

**Checkpoint**: Both P1 context-menu actions work. The canvas is fully usable without any drag gesture.

---

## Phase 6: User Story 4 - Arrange all body items as a near-square grid (Priority: P2)

**Goal**: One click lays every body item out on a compact near-square grid.

**Independent Test**: Scatter nine items, click Grid Layout, confirm a 3×3 grid with
even spacing and no overlaps; drag one away and confirm it stays put.
(quickstart.md §US4)

- [X] T035 [US4] Implement `gridPositions({ ids, cellWidth, cellHeight, center })` in `src/webview/diagram/layout.js`, returning `Array<{ id, x, y }>`. Rules quoted verbatim from [data-model.md §6](./data-model.md): "`ids.length === 0` → returns `[]`. No error, no side effect."; "`cols = ceil(sqrt(n))`, `rows = ceil(n / cols)`; `|cols - rows| <= 1` for all n ≥ 1"; "Placement is row-major over `ids` sorted ascending; the same input always yields the same output."; "Adjacent cell centres are exactly `cellWidth` / `cellHeight` apart"; "The bounding box of the returned points is centred on `center`."
- [X] T036 [US4] Add `<button id="grid-layout" type="button">Grid Layout</button>` to the toolbar in `src/webview/diagram/diagram.html`, next to `#layout-toggle`.
- [X] T037 [US4] In `src/webview/diagram/main.js`, add `setupGridLayout()` and call it from the setup block. On click: collect body-node ids (`state.visNodes.getIds().filter(id => !state.ghostMeta.has(id))`); if empty, return with no error and no side effect (FR-023); otherwise derive `cellWidth = max(width) + gapX` and `cellHeight = max(height) + gapY` from `nodeExtents()` (T009), call `layout.gridPositions` with `center = network.getViewPosition()`, and hand the result to `applyPositions()` (T010). Deriving the pitch from measured extents is what keeps FR-018's no-overlap guarantee true when the heading-label toggle widens every label ([research.md §3](./research.md)).
- [X] T038 [US4] In `src/webview/diagram/main.js`, confirm the grid command touches only body items: ghost nodes are excluded from `ids` and continue to settle around the newly placed body items under the still-running solver (FR-020, spec US4 scenario 5). Confirm nodes stay draggable afterwards and the layout is not re-applied on any later event (FR-021) — `applyPositions` writes coordinates and returns; it must not register any listener.
- [X] T039 [P] [US4] In `src/test/diagramLayout.test.ts`, add `gridPositions` assertions per [quickstart.md §Automated](./quickstart.md): for n = 1, 2, 3, 5, 7, 9, 10, 50 the derived `cols`/`rows` differ by at most one; no two returned points are closer than the cell pitch on either axis; `gridPositions` with an empty `ids` returns `[]` and throws nothing; the same input twice yields identical output; the returned bounding box is centred on the supplied `center`.

**Checkpoint**: Grid arrangement works, persists, and leaves the canvas static and draggable.

---

## Phase 7: User Story 5 - One-shot hierarchical arrangement, no button dependencies (Priority: P2)

**Goal**: The hierarchical layout becomes a one-shot command like the grid, and no
toolbar button disables any other.

**Independent Test**: With Ghost Preview on, click Hierarchical Layout — it is
clickable, it works, Ghost Preview stays on, and afterwards nodes drag freely.
(quickstart.md §US5)

- [X] T040 [US5] Rewrite `setupLayoutToggle()` in `src/webview/diagram/main.js` as a one-shot command (rename it to reflect that it is no longer a toggle). Compute-then-bake per [research.md §2](./research.md): enable `layout.hierarchical` with the existing `{ direction: 'UD', sortMethod: 'directed' }`, read `network.getPositions()`, disable `layout.hierarchical` again, then hand the captured coordinates to `applyPositions()` (T010). Delete the entire else-branch that restored `state.manualPositions`, the `button.textContent = 'Manual Layout'` flip, and both `disabled` assignments.
- [X] T041 [US5] In `src/webview/diagram/diagram.html`, keep `#layout-toggle`'s label permanently as `Hierarchical Layout` — it no longer flips, because there is no mode to leave.
- [X] T042 [US5] In `setupHierarchicalLayout()` in `src/webview/diagram/main.js`, add the degenerate-output guard from [research.md §2](./research.md): if the positions read back after enabling hierarchical layout are empty, or all identical, leave existing positions untouched rather than writing a collapsed all-zero layout, and surface that via `setDiagramStatus` (Constitution III — failure paths are first-class, not a follow-up).
- [X] T043 [US5] In `src/webview/diagram/main.js`, restrict the hierarchical bake to body items: filter ghost ids out of the captured positions before passing them to `applyPositions`, so ghost nodes keep their solver-driven placement (FR-020) and never leak into the persisted `diagramChanged` payload.
- [X] T044 [US5] Walk the toolbar and confirm FR-024 holds: with every combination of Ghost Preview on/off and Show Headings on/off, no button is `disabled`. Grep `src/webview/diagram/` for `.disabled` and confirm no remaining assignment ties one toolbar control's state to another's.

**Checkpoint**: All five stories functional. Toolbar has four always-enabled controls: Hierarchical Layout, Grid Layout, Ghost Preview, Show Headings.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T045 Run `npm run compile` (check-types + lint + esbuild) and fix anything it reports. This gates packaging and must not be bypassed (Constitution V).
- [X] T046 Run `npm test` and confirm all four vscode-test labels pass, including the new `diagramLayout` suite. A flaky test must be fixed, never retried until green or skipped (Constitution VI).
- [ ] T047 Walk the full manual acceptance script in [quickstart.md](./quickstart.md) §Manual acceptance walk-through — all five user stories, every ✅ checkpoint.
- [ ] T048 Walk the [quickstart.md](./quickstart.md) §Regression checks: drag from an editor still lands at the drop point (not auto-placed); "Add Linked Item…" still creates, links and jumps; "Remove Link" on an edge still removes the real link; ghost promotion still opens its file, keeps Ghost Preview on and recomputes the ghost set; a failed ghost request still shows `#ghost-preview-status` and leaves body items untouched (spec 011 FR-012).
- [X] T049 [P] Verify SC-006 concretely: with a diagram open, remove several nodes, save, and confirm `git status` shows no modification to any requirement `.yml` file — only the `*.doorstop.json` changed.
- [X] T050 [P] Add a CHANGELOG.md entry describing the three user-visible changes: two new node context-menu actions, permanently static body items with the Auto-Arrange button removed, and the new Grid Layout alongside a now one-shot Hierarchical Layout.
- [X] T051 [P] Update `README.md` where it documents the diagram toolbar and context menu, so the removed Auto-Arrange button and the new actions are reflected.
- [ ] T052 Note in the commit/PR body that this change removes spec 011's FR-014 (Ghost Preview ⇄ Hierarchical Layout mutual exclusivity), which the constitution's Governance section requires to be called out explicitly rather than left implicit. Spec 011 has already been annotated in place.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1 (T001 must exist before helpers reference it). **BLOCKS all user stories** — T008 changes the state shape every story reads.
- **Phase 3 (US3)**: Depends on Phase 2. Sequenced first among the P1 stories because it deletes the `hierarchical`/`physicsEnabled` state US4 and US5 would otherwise have to work around.
- **Phase 4 (US1)**: Depends on Phase 2. Independent of US3 in behaviour, but shares `main.js`/`interactions.js`, so serialize the edits.
- **Phase 5 (US2)**: Depends on Phase 2 for `pendingLinkSource` (T008). T026 in Phase 4 also reads that field; if Phase 5 runs before Phase 4, T026 moves with it.
- **Phase 6 (US4)**: Depends on Phase 2 (T009 `nodeExtents`, T010 `applyPositions`) and Phase 1 (T001 `layout.js`).
- **Phase 7 (US5)**: Depends on Phase 2 (T010) and on **Phase 3** (T008's removal of `state.hierarchical` and `state.manualPositions` is what makes T040's rewrite possible).
- **Phase 8 (Polish)**: Depends on every story phase you intend to ship.

### User Story Dependencies

| Story | Priority | Depends on | Independently demoable? |
| --- | --- | --- | --- |
| US3 — static body items | P1 | Foundational only | Yes |
| US1 — remove from diagram | P1 | Foundational only | Yes |
| US2 — add link from menu | P1 | Foundational only | Yes |
| US4 — grid arrangement | P2 | Foundational (T009, T010) | Yes |
| US5 — one-shot hierarchical | P2 | Foundational + **US3** | Yes, once US3 lands |

### Within Each Story

- Pure geometry (`layout.js`) before the `main.js` caller that uses it.
- `state.js` shape before the handlers that read it.
- Handler wiring before the DOM/context-menu entry that triggers it.
- Behaviour before its test assertion, except where you prefer to write the assertion first — the geometry functions are pure and TDD-friendly.

### Parallel Opportunities

Genuinely parallel (different files, no shared edits):

- **Phase 1**: T003, T004, T005, T006 — HTML, CSS, test config, test file. T003 and T002 both touch `diagram.html`, so run T002 first.
- **Test tasks**: T022, T028, T039 all append to `src/test/diagramLayout.test.ts` — parallel with *implementation* work in other files, but serialize against each other.
- **Phase 8**: T049, T050, T051 — verification, CHANGELOG, README.

Not parallel despite appearances: everything inside Phases 2–7 that touches
`main.js`, `interactions.js` or `state.js`, which is the large majority of the work.

---

## Parallel Example: Phase 1

```bash
# After T001 and T002 land, these four touch four different files:
Task: "T003 Add #diagram-status div to src/webview/diagram/diagram.html"
Task: "T004 Style #diagram-status in src/webview/diagram/diagram.css"
Task: "T005 Register diagramLayout config in .vscode-test.mjs"
Task: "T006 Create empty suite in src/test/diagramLayout.test.ts"
```

---

## Implementation Strategy

### MVP (Phases 1–3)

1. Phase 1 Setup → Phase 2 Foundational → Phase 3 (US3).
2. **STOP and VALIDATE**: body items never move on their own; no Auto-Arrange button;
   Ghost Preview unchanged.
3. This alone fixes the "my layout keeps getting destroyed" complaint and is worth
   shipping on its own.

### Incremental Delivery

1. Phases 1–2 → foundation ready.
2. + Phase 3 (US3) → static canvas. **MVP, demoable.**
3. + Phase 4 (US1) → removal works. Demoable.
4. + Phase 5 (US2) → drag-free linking. Demoable. **All P1 stories done.**
5. + Phase 6 (US4) → grid arrangement. Demoable.
6. + Phase 7 (US5) → one-shot hierarchical, zero button dependencies. Feature complete.
7. + Phase 8 → compile, test, walk quickstart, docs.

### Parallel Team Strategy

Limited value here — three files carry most of the change and would conflict. With two
developers the workable split is: one takes Phases 1–3 and 6–7 (the layout/physics
line through `main.js`), the other takes Phases 4–5 (the context-menu line through
`interactions.js`), synchronising on `state.js` after T008. A third developer would
mostly wait.

---

## Notes

- `[P]` = different files, no dependencies. Used sparingly here on purpose — see the
  parallelism note at the top.
- `[Story]` labels map tasks to spec.md user stories for traceability.
- No server (`server/`) change is needed anywhere in this feature; `server/tests`
  requires no addition (Constitution V).
- No new npm or pip dependency is introduced (Constitution IV).
- Commit after each task or logical group; stop at any checkpoint to validate a story
  independently.
