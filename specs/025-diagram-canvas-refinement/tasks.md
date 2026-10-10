---

description: "Task list for 025 Diagram Canvas Refinement"
---

# Tasks: Diagram Canvas Refinement

**Input**: Design documents from `/specs/025-diagram-canvas-refinement/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ui-contract.md, quickstart.md

**Tests**: Constitution Principle VI requires every feature to come with a CI-runnable test, so every story below includes test tasks. Tests run through `npm test`; `pretest` builds `dist/` and `out/` first. Only suites listed in `.vscode-test.mjs` run. `src/test/packageMenus.test.ts` is **not** listed there, so do not add assertions to it.

**Organization**: Tasks are grouped by user story so each story can be built and tested on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other [P] tasks in the same phase (different files, no unfinished dependency)
- **[Story]**: US1–US5 from spec.md

---

## Phase 1: Setup

- [X] T001 Run `npm run compile` and `npm test` from the repo root to confirm the baseline is green before any change (scripts in package.json, configs in .vscode-test.mjs). If something is already red, record it in the PR description.

---

## Phase 2: Foundational

None. The stories share no new infrastructure: each changes existing code, and all needed helpers already exist (`nodeExtents` in src/webview/diagram/main.js, `refreshItemMeta` in src/diagrammPanel.ts).

---

## Phase 3: User Story 1 - Diagram file stays valid after items move (Priority: P1) 🎯 MVP

**Goal**: On load, each node's stored `fileUri` is reconciled against the server's `/tree` path for its UID. Corrections make the document dirty; unknown UIDs are kept and reported (FR-006–FR-011).

**Independent Test**: Save a diagram with REQ-001, move `REQ-001.yml` into a subfolder, and reopen. The node renders, an info message reports 1 updated path, and the tab is dirty. After saving, the file holds the new relative path. Reopening again shows no message and leaves the tab clean.

### Tests for User Story 1

- [X] T002 [P] [US1] Add suite `'Diagram path reconciliation (spec 025)'` to src/test/extension.test.ts, calling `DoorstopDiagramPanel.reconcilePaths(diagram, meta)` with `meta: Record<string, { path: string }>`. Cases:
  - (a) Node `{ id: 'REQ-001', fileUri: <tmp>/a/REQ-001.yml }` with meta path `<tmp>/b/REQ-001.yml` → `corrected` is `[{ uid: 'REQ-001', from, to }]` and the returned node's `fileUri` is the meta path.
  - (b) Identical paths → `corrected` and `unresolved` are empty, and the returned `diagram` is the *same reference* as the input (`assert.strictEqual`).
  - (c) Only when `process.platform === 'win32'`: stored `c:\…` vs meta `C:\…` → no correction.
  - (d) Node id `NOPE-999` not in meta → `unresolved` is `['NOPE-999']` and the node deep-equals the input.
  - (e) `{ nodes: [], edges: [] }` → empty results.
  - x/y and edges must be unchanged in every case.

### Implementation for User Story 1

- [X] T003 [US1] Add `public static reconcilePaths(diagram: any, meta: Record<string, { path: string }>): { diagram: any; corrected: { uid: string; from: string; to: string }[]; unresolved: string[] }` to `DoorstopDiagramPanel` in src/diagrammPanel.ts.
  - For each node with a string `id` (fall back to `uid`): if the id is not in `meta`, push it to `unresolved`. Else, if `typeof node.fileUri !== 'string'` or `path.relative(node.fileUri, meta[id].path) !== ''`, replace `fileUri` with `meta[id].path` and record the correction.
  - Compare with `path.relative`, not `===`: on Windows it ignores drive-letter case (research R1).
  - Return the input object unchanged when `corrected` is empty; otherwise return `{ ...diagram, nodes: newNodes }`.
- [X] T004 [US1] Rework `handleReady` in src/diagrammPanel.ts:
  - Call `this.refreshItemMeta()` directly instead of `fetchTreeMeta()`, which hides failure by returning `{}`.
  - If the result is `undefined` (server missing or unreachable): render `currentDiagram` as stored, skip reconciliation, and show the existing once-per-panel warning (`_metaWarningShown`). Its text becomes `'Doorstop diagram: could not load link data from the server (colors and edges may be incomplete). Item paths were not verified. If you recently updated the extension, try "Doorstop: Restart Server".'`.
  - Otherwise run `reconcilePaths(currentDiagram, meta)`. If `corrected.length > 0`: use the reconciled diagram, call `this._onDiagramChanged?.(reconciled)` so the custom document becomes dirty (do NOT write to disk), and show `vscode.window.showInformationMessage(\`Doorstop diagram: updated ${n} moved item path(s). Save to keep the changes.\`)`.
  - If `unresolved.length > 0`: show `showWarningMessage(\`Doorstop diagram: could not find item(s) ${unresolved.join(', ')} in the project; kept as stored.\`)` once per panel. Add a private `_unresolvedWarningShown` flag next to `_metaWarningShown`, because `ready` fires on every tab re-show.
  - Then apply `withAuthoritativeEdges` and post `loadDiagram` as today.
  - Remove `fetchTreeMeta` if it has no other callers (grep first).

- [X] T024 [US1] End-to-end path-repair test (Constitution VI, analysis K1, research R9). Add it to the `Regression Fixture Integration Suite` in src/test/regressionFixture.test.ts:
  - Move `FIXTURE_ROOT/REQ-001.yml` to `FIXTURE_ROOT/moved-025/REQ-001.yml`.
  - `GET /tree` through the suite's `server` and build `meta = { [uid]: { path } }`.
  - Call `DoorstopDiagramPanel.reconcilePaths({ nodes: [{ id: 'REQ-001', fileUri: <old absolute path>, x: 0, y: 0 }], edges: [] }, meta)` and assert exactly one correction.
  - Assert that `serializeDiagram(result.diagram)`, parsed, has `nodes[0].fileUri === 'moved-025/REQ-001.yml'`.
  - In `finally`, move the file back and remove `moved-025/`.

**Checkpoint**: US1 is complete. T002 and T024 pass, and quickstart Manual steps 2–3 work.

---

## Phase 4: User Story 2 - Layout commands respect real node size (Priority: P1)

**Goal**: Grid and Hierarchical layout use the measured node sizes, and headings wrap at the first space at or after 30 characters (FR-014–FR-019).

**Independent Test**: With headings on and one ~80-char heading, the heading shows on 2–3 lines. After Grid Layout and after Hierarchical Layout, no node boxes overlap.

### Tests for User Story 2

- [X] T005 [US2] Update src/test/diagramLayout.test.ts:
  - Extend the export test to also check `wrapHeading` and `hierarchicalSpacing` are functions.
  - Rewrite every `gridPositions` call to the new signature `gridPositions({ extents, gap, center })`. Build uniform extents from `uids(n)` with `CELL_W`/`CELL_H`, so the existing shape/pitch/determinism/centering assertions still hold for uniform sizes.
  - Add `gridPositions` with mixed extents (e.g. widths 80/300/120, heights 40/90): no two result boxes overlap (centre-based check: `|dx|*2 < w1+w2 && |dy|*2 < h1+h2` must be false for every pair) and the result is deterministic under shuffled input.
  - Add `hierarchicalSpacing`:
    - `[]` → `{ nodeSpacing: 100, levelSeparation: 150, treeSpacing: 200 }`.
    - Small extents → the same defaults.
    - Widest 400 / tallest 200 → `nodeSpacing === 400 + layout.GAP`, `treeSpacing === 400 + layout.GAP`, `levelSeparation === 200 + layout.GAP`.
  - Add `wrapHeading`:
    - `'Short heading'` is unchanged; `''`, `null` and `undefined` → `''`.
    - A 70-char heading with spaces gives the exact expected string, with breaks at the first space at index ≥30 of each remaining segment.
    - A 45-char string with no space after index 30 is unchanged (no mid-word break).
    - No output line exceeds 30 + the longest word length.
    - Words are preserved: removing `\n` and spaces from input and output gives the same string.
  - Add a 50-node `gridPositions` case with widths 60–400 and heights 30–120, matching SC-003's scale (analysis G1): no overlapping boxes.

### Implementation for User Story 2

- [X] T006 [US2] In src/webview/diagram/layout.js, add `wrapHeading(text, limit = 30)` and export it:
  - Return `''` for non-string or empty input.
  - Loop over the remaining text. If `rest.length <= limit`, emit `rest` and stop. Otherwise find `idx = rest.indexOf(' ', limit)`. If `idx === -1`, emit `rest` and stop. Otherwise emit `rest.slice(0, idx)` and continue with `rest.slice(idx + 1)`.
  - Join with `'\n'`.
- [X] T007 [US2] In src/webview/diagram/layout.js, replace `gridPositions({ ids, cellWidth, cellHeight, center })` with `gridPositions({ extents, gap = GAP, center })`:
  - Sort extents by `id` ascending. Use `cols = ceil(sqrt(n))`, `rows = ceil(n / cols)`, filled row-major.
  - `colWidth[c]` = max width in column c, `rowHeight[r]` = max height in row r.
  - Cell centre x = sum of the previous column widths plus `c * gap` plus `colWidth[c] / 2`; same for y with row heights.
  - Shift the whole grid so its bounding box is centred on `center` (default `{0,0}`). Return `[{ id, x, y }]`. Empty or non-array input → `[]`.
  - Update the JSDoc.
  - Add and export `hierarchicalSpacing(extents)` returning `{ nodeSpacing: max(100, maxW + GAP), levelSeparation: max(150, maxH + GAP), treeSpacing: max(200, maxW + GAP) }`. With empty extents, maxW and maxH are 0.
- [X] T008 [US2] In src/webview/diagram/render.js `buildLabel`, push `window.DoorstopDiagram.layout.wrapHeading(headingText)` instead of the raw `headingText`. layout.js loads before render.js in diagram.html, so the reference is available. Body and ghost labels both go through `buildLabel` (FR-019).
- [X] T009 [US2] In src/webview/diagram/main.js:
  - `setupGridLayout`: drop the `cellWidth`/`cellHeight` computation and call `layout.gridPositions({ extents: nodeExtents(ids), gap: layout.GAP, center: network.getViewPosition() })`.
  - `setupHierarchicalLayout`: compute `const spacing = layout.hierarchicalSpacing(nodeExtents(ids))` *before* enabling hierarchical mode, and pass it in: `layout: { hierarchical: { enabled: true, direction: 'UD', sortMethod: 'directed', ...spacing } }`.
  - Update the comments that mention "largest node" pitch.

**Checkpoint**: US2 is complete. T005 passes, and quickstart Manual step 5 works.

---

## Phase 5: User Story 3 - Canvas entry point lives in the Commands panel (Priority: P2)

**Goal**: "New Diagram" appears in the Commands panel. "Open Traceability Graph" is gone, and so are the diagram buttons in the TreeView title bar (FR-001–FR-005).

**Independent Test**: The Commands panel shows "New Diagram" and clicking it creates and opens a diagram. The TreeView title bar has no diagram buttons, and the palette has no "Open Traceability Graph". Clicking a `*.doorstop.json` file opens the canvas.

### Tests for User Story 3

- [X] T010 [P] [US3] Add suite `'Diagram entry point (spec 025)'` to src/test/extension.test.ts. It reads `package.json` with `fs.readFileSync(path.resolve(__dirname, '..', '..', 'package.json'))`.
  - No entry in `contributes.commands` has `command === 'doorstop.showDiagram'`.
  - No menu array in `contributes.menus` references `doorstop.showDiagram`.
  - `contributes.menus['view/title']` has no entry whose command contains `Diagram` with `when` containing `doorstop.treeView`.
  - `doorstop.newDiagram` is still in `contributes.commands`, with title `'Doorstop: New Diagram'` (analysis T1).
  - `contributes.menus['view/item/context']` still contains `doorstop.addToDiagram` for `view == doorstop.treeView` (FR-005, analysis G2).
  - `contributes.customEditors` has `viewType: 'doorstop.diagram'` with `priority: 'default'` and selector `*.doorstop.json`.
  - `new DoorstopCommandsProvider().getChildren()` contains an item whose `command.command === 'doorstop.newDiagram'` (import from `../commandsProvider`).

### Implementation for User Story 3

- [X] T011 [P] [US3] In package.json:
  - Delete the `doorstop.showDiagram` object from `contributes.commands` (around line 248).
  - Delete the `doorstop.showDiagram` and `doorstop.newDiagram` entries from `contributes.menus['view/title']` (around lines 453–460).
  - Keep the `doorstop.newDiagram` command contribution (icon `$(new-file)`), but rename its title to "Doorstop: New Diagram" (analysis T1).
  - Grep package.json for any other `showDiagram` reference and remove it.
- [X] T012 [P] [US3] In src/commandsProvider.ts, append `this.createNode('New Diagram', 'new-file', 'doorstop.newDiagram')` to the `nodes` array after `'New Filter Notebook'`.
- [X] T013 [P] [US3] In src/extension.ts:
  - Delete the `showDiagramCommand` registration (around lines 424–435) and remove `showDiagramCommand` from the `context.subscriptions.push(...)` list.
  - In the `doorstop.addToDiagram` handler, change the hint to `'Open a diagram file (*.doorstop.json) or create one with "New Diagram" first.'`.
  - Grep src/ for `showDiagram` and remove any leftovers.

**Checkpoint**: US3 is complete. T010 passes, and quickstart Manual step 1 works.

---

## Phase 6: User Story 4 - Editing only through buttons and context menu (Priority: P2)

**Goal**: No vis-network "Edit" toolbar on the canvas; the context menu still does all editing (FR-012, FR-013).

**Independent Test**: No "Edit" button at the top-left. Add Link to…, Remove Link, Remove from Diagram and Add Linked Item… all still work.

### Tests for User Story 4

- [X] T014 [US4] In src/test/diagramLayout.test.ts, add test `'canvas has no manipulation toolbar (spec 025 FR-012)'`. It reads `dist/webview/diagram/main.js` as text (same `REPO_ROOT` as the `layout` require) and asserts it does not match `/manipulation\s*:/`. The toolbar can't be rendered headlessly, so the built source is the only artifact that can be checked.

### Implementation for User Story 4

- [X] T015 [US4] In src/webview/diagram/main.js, delete the whole `manipulation: { … }` block from `options` (around lines 74–98), including its `deleteNode`/`deleteEdge`/`addEdge` callbacks. Keep `const pendingLinkOps = new Map()`, because `requestLink` (around line 236) and the link-result handler (around line 367) still use it. Grep main.js and interactions.js for `addEdgeMode`, `enableEditMode` and `deleteSelected`; none are expected.

**Checkpoint**: US4 is complete. T014 passes, and quickstart Manual step 4 works.

---

## Phase 7: User Story 5 - No status icons on the canvas (Priority: P3)

**Goal**: No status icons, no suspect border, and no Status legend section; status flags are no longer sent to the webview (FR-020–FR-023).

**Independent Test**: Unreviewed, suspect and derived items show no icon and no red border. The legend shows only Documents.

### Tests for User Story 5

- [X] T016 [US5] In src/test/diagramLayout.test.ts, add test `'canvas renders no status badges (spec 025 FR-020-022)'`. It reads `dist/webview/diagram/render.js` and `dist/webview/diagram/diagram.html` as text and asserts:
  - render.js contains none of `buildBadge`, `SUSPECT_BORDER`, `✅`, `❓`, `⚠️`, `🔹`, `🚫`, `📄`.
  - diagram.html contains no `Suspect link` and no `<strong>Status</strong>`, and still contains `legend-documents`.

### Implementation for User Story 5

- [X] T017 [US5] In src/webview/diagram/render.js:
  - Delete `SUSPECT_BORDER`, the `buildBadge` function and its export.
  - In `toVisNode`, delete the `cleared === false` border override and the `badge` variable.
  - In `toVisGhostNode`, set `border: lighten(baseColor.border, 0.65)` and remove the badge.
  - Change `buildLabel(id, headingText, badge)` to `buildLabel(id, headingText)` and drop the badge line. If T008 is already done, keep its `wrapHeading` call.
- [X] T018 [US5] In src/webview/diagram/main.js `relabelAllNodes`: body updates become `render.buildLabel(node.id, meta.header)` and ghost updates `render.buildLabel(id, item.header)`. Remove the `badge` variables. Grep main.js for any other `buildBadge` call.
- [X] T019 [P] [US5] In src/webview/diagram/diagram.html, delete the first `<div class="legend-section">` (the `<strong>Status</strong>` block with ✅ ❓ ⚠️ 🔹 🚫 📄). Keep the Documents section.
- [X] T020 [P] [US5] In src/diagrammPanel.ts:
  - Remove `active`, `normative`, `derived`, `reviewed` and `cleared` from `interface NodeMeta` and `interface GhostNode`, from the `meta[item.uid] = {…}` literal in `refreshItemMeta`, from the `ghosts.set(…)` literal in `computeGhostItems`, and from the `addNode` payloads in the create-linked-item handler (around line 504) and in `handleDroppedData` (around line 688).
  - In `withAuthoritativeEdges`, push `{ from: nodeId, to: link.uid, arrows: 'to' }` without `suspect`.
  - Leave `LinkInfo` in src/doorstopTypes.ts unchanged, because other features use it.

**Checkpoint**: US5 is complete. T016 passes, and quickstart Manual step 6 works.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T021 [P] Add entries under `## [Unreleased]` in CHANGELOG.md:
  - **Changed**: "New Diagram" moved to the Commands panel. Layout commands account for node size. Long headings wrap after ~30 characters.
  - **Removed**: "Open Traceability Graph" (open `*.doorstop.json` files directly), the canvas "Edit" toolbar, and status icons and the suspect border on the canvas.
  - **Added**: moved items are re-linked by UID when a diagram is loaded.
- [X] T022 Run `npm run compile` and `npm test`. All configs in .vscode-test.mjs must pass (Constitution V/VI).
- [ ] T023 Run the manual steps in specs/025-diagram-canvas-refinement/quickstart.md against `testdata/regression` in the Extension Development Host.

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup (T001) comes first. There are no foundational tasks.
- US1–US5 each depend only on T001 and are independent of each other in behaviour.
- Polish (T021–T023) runs after the stories you plan to ship are done.

### Shared-file ordering (no behaviour dependency, only edit conflicts)

- src/diagrammPanel.ts: T003 → T004 (US1) and T020 (US5). Do them in sequence.
- src/webview/diagram/main.js: T009 (US2), T015 (US4) and T018 (US5). Do them in sequence.
- src/webview/diagram/render.js: T008 (US2) and T017 (US5). If both are planned, do T008 first so T017 keeps `wrapHeading`.
- src/test/extension.test.ts: T002 (US1) and T010 (US3). Do them in sequence.
- src/test/diagramLayout.test.ts: T005, T014 and T016. Do them in sequence.

### Within Each Story

- Write the test task first and check that it fails before implementing (T002, T005, T010, T014, T016).
- US1: T003 before T004.
- US2: T006 → T007 (same file) → T008 / T009.

### Parallel Opportunities

- US3's T011, T012 and T013 touch three different files and can run in parallel. T010 is parallel with them too, since it only adds a test.
- T019 and T020 (US5) touch different files from T017/T018.
- T021 can be written any time.
- Across stories: US1 (diagrammPanel.ts, extension.test.ts) and US3 (package.json, commandsProvider.ts, extension.ts) share only extension.test.ts.

---

## Parallel Example: User Story 3

```text
Task: "T011 Remove showDiagram + TreeView title diagram entries in package.json"
Task: "T012 Add 'New Diagram' node in src/commandsProvider.ts"
Task: "T013 Delete showDiagram registration + update addToDiagram hint in src/extension.ts"
```

## Parallel Example: User Story 5

```text
Task: "T019 Remove Status legend section in src/webview/diagram/diagram.html"
Task: "T020 Strip status fields + edge suspect in src/diagrammPanel.ts"
```

---

## Implementation Strategy

### MVP (User Story 1 only)

T001 → T002 → T003 → T004, then validate with quickstart Manual steps 2–3. This alone stops diagrams from breaking when items are moved.

### Incremental Delivery

1. US1, path repair (P1).
2. US2, size-aware layouts and heading wrap (P1).
3. US3, entry point, and US4, Edit toolbar removal (P2). Both are small and can ship together.
4. US5, icon removal (P3).
5. Polish: T021–T023.

---

## Notes

- Total: 24 tasks. T024 was added after `/speckit-analyze` and is out of numeric order; it runs at the end of the US1 phase.
- Diagram persistence must stay on Save / Revert / backup. T004 must not call `vscode.workspace.fs.writeFile`.
- The server is not touched. `/tree` keeps returning status flags for the TreeView, CodeLens and status report.

---

## Phase 9: Convergence

- [X] T025 Make the `titleFor` fallback in src/webview/diagram/state.js rebuild the full heading from every label line after the identifier (`node.label.split('\n').slice(1).join(' ')`), so a wrapped heading is not saved to the diagram file as just its first line, and add a Node-runnable check or test that a wrapped label round-trips to the original heading per FR-017 / plan: diagram persistence constraint (partial)

---

## Phase 10: Convergence

- [ ] T026 CRITICAL: Add the trace comment `// Spec 025 FR-NNN` (one per covered FR) to every existing spec 025 test: the `Diagram path reconciliation (spec 025)` and `Diagram entry point (spec 025)` suites in src/test/extension.test.ts, the `Size-aware layout and heading wrap`, `Canvas surface cleanup` and `Saved title survives heading wrap` suites in src/test/diagramLayout.test.ts, and the moved-item test in src/test/regressionFixture.test.ts, per Constitution VIII (partial). Mapping: entry point FR-001..005; reconciliation FR-006, FR-007, FR-008, FR-010; toolbar FR-012; layout FR-014, FR-015; wrapHeading FR-017, FR-018; badges FR-020..022; title round trip FR-017. Existing bare `FR-0NN` comments in diagramLayout.test.ts (including the spec 003 ones) do not count.
- [ ] T027 CRITICAL: Add a CI-run test with trace comment `// Spec 025 FR-009` that the corrected-path count message is shown on load, per Constitution VIII / FR-009 (missing). Extract the toast text/decision from handleReady into a pure helper if needed so it runs without the webview.
- [ ] T028 CRITICAL: Add a CI-run test with trace comment `// Spec 025 FR-011` that when item locations cannot be determined (server unavailable) the diagram renders as stored, nothing is changed and the user is informed, per Constitution VIII / FR-011 (missing).
- [ ] T029 CRITICAL: Add a CI-run test with trace comment `// Spec 025 FR-013` that add/remove link, remove item and add linked items remain reachable from the toolbar buttons and the context menu, per Constitution VIII / FR-013 (missing).
- [ ] T030 CRITICAL: Add a CI-run test with trace comment `// Spec 025 FR-016` that the node size used by layout commands follows the current headings shown/hidden state at run time, per Constitution VIII / FR-016 (missing).
- [ ] T031 CRITICAL: Add a CI-run test with trace comment `// Spec 025 FR-019` that heading wrapping applies to ghost preview nodes as well as diagram nodes, per Constitution VIII / FR-019 (missing).
- [ ] T032 CRITICAL: Add a CI-run test with trace comment `// Spec 025 FR-023` that review/suspect data is not required by the canvas and the review/clear-suspect features elsewhere still work, per Constitution VIII / FR-023 (missing).
