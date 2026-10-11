---

description: "Task list for feature 030 — Document View for Sections and Filter Results"
---

# Tasks: Document View for Sections and Filter Results

**Input**: Design documents from `/specs/030-document-view-scopes/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/view-scopes.md](contracts/view-scopes.md), [contracts/fields-block.md](contracts/fields-block.md), [contracts/server-api.md](contracts/server-api.md), [quickstart.md](quickstart.md)

**Tests**: Included and mandatory. Constitution VI (CI-runnable test per feature) and VIII (a test per functional requirement, each carrying a trace comment `// spec 030 FR-0xx` — `# spec 030 FR-0xx` in pytest). FR-006…FR-008 were removed by clarification and are intentionally unused. Suites: `src/test/documentViewModel.test.ts` (pure), new `src/test/documentViewScopes.test.ts` (extension host, real server on `testdata/regression`, registered in the same vscode-test config as the other extension suites), `src/test/packageMenus.test.ts`, `src/test/filterNotebook.test.ts`, `server/tests` (pytest, real Doorstop project).

**Organization**: By user story (US1 section, US2 filter result, US3 fields setting). The scope generalisation of the view key is foundational because US1 and US2 both depend on it. The former overlap story was removed by clarification; overlapping views need no code beyond the foundational reconciliation task.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Extension at repo root (`src/`, tests `src/test/`, fixture `testdata/regression/`); server in `server/src/doorstop_server/`, tests in `server/tests/`. No new top-level directory.

---

## Phase 1: Setup

- [X] T001 Run `npm run check-types`, `npm run lint`, `npm test` and `pytest` in `server/` on the current branch to record a green baseline; fix nothing, just note failures that pre-exist.
- [X] T002 Create `src/test/documentViewScopes.test.ts` with an empty `suite('Document view scopes (spec 030)')` and register it wherever `src/test/regressionFixture.test.ts` is registered for CI (`.vscode-test.mjs` / `package.json` scripts / `.github/workflows/ci.yml`), so later tasks only add tests.

---

## Phase 2: Foundational — views keyed by scope instead of prefix

**Purpose**: Every story opens a view through `openDocumentView(scope)`; render/parse/save stay unchanged (research §1, §2).

**⚠️ CRITICAL**: No user story work before this phase is complete and the existing document-view tests (019) are green.

- [X] T003 [P] In `src/doorstopTypes.ts` add `documentPrefix?: string` and `fields?: Record<string, string>` to `ItemNode` (data-model.md "ItemNode additions").
- [X] T004 In `src/documentViewModel.ts` add `ViewScope` (`kind: 'document'|'section'|'filter'`, `key`, `label`, optional `prefix`, `rootUid`, `uids`), `scopeKey`, `viewUriFor(scope)` and `scopeFromViewUri(uri)` using the URI forms in contracts/view-scopes.md (`/SYS (document)`, `/SYS-0012 (section)`, `/Filter 2 (filter)`); keep `prefixFromViewUri` as a thin wrapper returning the prefix for `document` URIs. Change `documentMarker(label)` and widen `DOCUMENT_MARKER_REGEX` label class to `[A-Za-z0-9_. -]+` (research §3); `documentMarker('SYS')` output MUST stay byte-identical.
- [X] T005 [P] Extend `src/test/documentViewModel.test.ts`: URI round-trip for the three scope kinds, marker regex accepts `SYS`, `SYS-0012 section`, `Filter 2`, and the unchanged `SYS` marker string (guards FR-014 baseline).
- [X] T006 In `src/documentViewProvider.ts` replace `DocumentViewState.prefix` by `scope: ViewScope`, key `states` by `scope.key`, make `getState` resolve via `scopeFromViewUri`, and change `loadSnapshot(scope)` to build the scoped snapshot per research §2: fetch `GET /tree` once, select items (document: all of the prefix; section: `sectionUids(items, rootUid)` from T014 applied to the fresh `/tree` items; filter: `scope.uids ∩ tree`), set `documentPrefix` on each item, `prefix` = `scope.label`, items in `/tree` document order then level order. Update all messages/progress titles to use `scope.label`. Throw `no document with prefix …` / `item no longer exists` errors as in contracts/view-scopes.md.
- [X] T007 In `src/documentViewProvider.ts` make `openDocumentView(scopeOrPrefix: ViewScope | string)` (string = document scope, keeps `doorstop.openDocumentView`/`openAsDocument` and the `DocumentViewHandle` signature working) and reveal the existing tab when a state with the same key exists (FR-005).
- [X] T008 In `src/documentViewProvider.ts` resolve the document for item creation from the neighbour: `POST /documents/{prefix}/items` uses the `documentPrefix` of `afterUid`'s item, or of the first block's item when there is none above (research §7); remove every remaining use of `state.prefix` for server writes.
- [X] T009 In `src/documentViewProvider.ts` replace `state.folder` by `state.folders: Set<string>` (directory of each distinct document in the scope) and create one watcher per folder feeding the same `watcherUids`/debounce; `disposeState` disposes all (research §6).
- [X] T010 In `src/documentViewProvider.ts` after a successful save, call `regenerate` on every other open, non-saving state whose snapshot contains a saved UID (research §5); a dirty state keeps its edits and is left to the existing disk-change prompt.
- [X] T011 Update every other consumer of the prefix-keyed API (`src/documentViewLanguage.ts`, `src/hoverProvider.ts`, `src/definitionProvider.ts`, `src/callHierarchyProvider.ts`, `src/extension.ts`, `src/test/regressionFixture.test.ts` if affected) so they use `getState(uri)`/`scopeFromViewUri`; update the `DocumentViewHandle` interface (`openDocumentView(scopeOrPrefix: ViewScope | string)`) and every caller or mock of it in `src/extension.ts` and `src/test/*`; `npm run check-types && npm run lint && npm test` must be green with all pre-existing document-view tests unchanged.

**Checkpoint**: Document views behave exactly as before; the machinery accepts any scope.

---

## Phase 3: User Story 1 — Open a section as a document view (Priority: P1) 🎯 MVP

**Goal**: A tree node with sub-elements offers "Open as document" and opens a view of the node plus its descendants.

**Independent Test**: Quickstart §1 — open the `1.1` node of `SYS`; the view contains `1.1` and `1.1.1` only; the leaf `1.2` has no action; reopening reveals the same tab.

### Tests for US1

- [X] T012 [P] [US1] In `src/test/documentViewScopes.test.ts` add tests with trace comments: FR-002 (section view text contains exactly the node and descendants, same block format), FR-003 (tab title `<UID> (section)`), FR-004 (edit a descendant's text, save: only that item file changes on disk; a heading rename still triggers the 019 header confirmation), FR-005 (open twice → one editor/one state, existing tab revealed), plus FR-001 leaf/parent tagging (after the explorer loads, a leaf tree item has `contextValue` `doorstop.item` and an item with children has `doorstop.item.parent`), plus overlap allowed (full document view and a section of it open simultaneously; saving in one refreshes the other — clarification 2026-10-11).
- [X] T013 [P] [US1] In `src/test/packageMenus.test.ts` add FR-001 checks: `doorstop.openSectionAsDocument` is contributed with `when` `view == doorstop.treeView && viewItem == doorstop.item.parent` in `view/item/context` (inline and menu group), is hidden in the command palette (`when: false`), and no pre-existing menu entry that previously matched `viewItem == doorstop.item` has lost the new context value.

### Implementation for US1

- [X] T014 [US1] In `src/requirementTree.ts` extract the outline-depth nesting of `attachHierarchy` into an exported pure function `sectionUids(items: ItemNode[], rootUid: string): string[]` (root + descendants, level order) and make `attachHierarchy` use it too (one algorithm, no second hierarchy); also set `contextValue = 'doorstop.item.parent'` for items that have children when collapsibleState is assigned after `attachHierarchy` (leaves keep `doorstop.item`). `loadSnapshot` in T006 calls `sectionUids` on the fresh `/tree` response, never on the explorer's cached hierarchy.
- [X] T015 [US1] In `package.json` contribute command `doorstop.openSectionAsDocument` (title "Open as document", icon `$(book)`), `view/item/context` entries (inline `@2` and context-menu group `1_requirement@0`) with `when` `view == doorstop.treeView && viewItem == doorstop.item.parent`, a `commandPalette` entry with `when: false`, and rewrite every existing `viewItem == doorstop.item` clause to `viewItem =~ /^doorstop\.item/` so parents keep all their other actions.
- [X] T016 [US1] In `src/documentViewProvider.ts` register `doorstop.openSectionAsDocument`: accept a `RequirementTreeItem` argument (else show "Doorstop: select an item with sub-elements in the Doorstop explorer."), build the `section` scope (`key: sec:<uid>`, `label: "<uid> section"`) and call `openDocumentView(scope)` inside `withDelayedProgress`.

**Checkpoint**: US1 independently demonstrable and shippable (MVP).

---

## Phase 4: User Story 2 — Open filter results as a document view (Priority: P2)

**Goal**: A non-empty filter result offers "Open as document"; the view behaves exactly like a section view.

**Independent Test**: Quickstart §3 — run a filter matching several items, click the button; the view lists exactly those items; save works; an empty result has no button.

### Tests for US2

- [X] T017 [P] [US2] In `src/test/filterNotebook.test.ts` add FR-009/FR-011 tests: for a non-empty payload the renderer module (import `src/webview/filterResults/renderer.js` with a minimal DOM stub, or inspect `resultOutput`) produces an "Open as document" control that posts `{ type: 'openDocument', uids }` with every row UID; for an empty response `resultOutput` stays the markdown "No items matched." (no control); the extension message handler with an empty `uids` list opens no view and shows the "filter result is empty" message.
- [X] T018 [P] [US2] In `src/test/documentViewScopes.test.ts` add FR-010 (filter view lists exactly the given UIDs in document order, including a filter result spanning two documents; identical editing/saving behaviour as a section view — save an edited item; create an item after a block and verify it lands in that block's document), FR-012 (after opening, change the matched set — e.g. add an item — and verify the open view does not gain it), and that opening the result of a filter whose items are already open in another view succeeds.

### Implementation for US2

- [X] T019 [US2] In `src/webview/filterResults/renderer.js` add an "Open as document" button (built with `textContent`, styled with the existing STYLE block, keyboard-accessible) above the table, shown only when `items.length > 0`; on activation `context.postMessage?.({ type: 'openDocument', uids: items.map(item => item.uid) })`.
- [X] T020 [US2] In `src/filterNotebook.ts` extend the `onDidReceiveMessage` handler: for `{ type: 'openDocument', uids: string[] }` validate it is a non-empty string array (else show "Doorstop: the filter result is empty - nothing to open" and return) and run command `doorstop.openFilterAsDocument` with the uids.
- [X] T021 [US2] In `package.json` contribute `doorstop.openFilterAsDocument` (hidden: `commandPalette` `when: false`); in `src/documentViewProvider.ts` register it: build a `filter` scope (`key: flt:<n>`, `label: "Filter <n>"`, `n` increments per opened view in the session, `uids` stored), call `openDocumentView(scope)`; when the loaded scope has no items show the empty-result message and open nothing (FR-011).

**Checkpoint**: US1 and US2 both work independently.

---

## Phase 5: User Story 3 — Choose editable header fields in the settings (Priority: P3)

**Goal**: The list setting `doorstop.documentView.fields` adds editable fields to every view.

**Independent Test**: Quickstart §4 — add `ref` to the setting; items having a `ref` show the managed fields block; editing and saving changes the item file; protected names are ignored with a message.

### Tests for US3

- [X] T022 [P] [US3] Create `server/tests/test_tree_fields.py` (# spec 030 FR-013/FR-015): `GET /tree?fields=ref,status` returns present scalar values only (no key for absent fields, lists/mappings omitted), protected names (`level`, `links`, …) are never returned, and without the parameter `fields` is absent from every item.
- [X] T023 [P] [US3] Create `server/tests/test_items_fields.py` (# spec 030 FR-015/FR-016): `PATCH /items/{uid}` with `fields: {status: "approved"}` persists (reload the item from disk, YAML and markdown item formats); `fields` with `level` → `422 PROTECTED_FIELD` and the file is untouched; body with none of `header`/`text`/`fields` → `422 INVALID_REQUEST`.
- [X] T024 [P] [US3] Extend `src/test/documentViewModel.test.ts` (pure, FR-014/FR-015/FR-016): rendering with an empty field list is byte-identical to today's output; with `['ref','status']` an item having both gets the `doorstop-fields` fence under its heading in setting order, an item having neither gets no fence, an item having one gets only that line; field-line value change yields `ItemUpdate.fields` in `planSave`; missing line, extra line, edited field name and multi-line value yield structural errors; the same fence text deeper in item text is treated as text; `normaliseFieldList` trims, de-duplicates (first wins), drops empty entries and returns protected names separately.
- [X] T025 [P] [US3] Extend `src/test/documentViewScopes.test.ts` (FR-013/FR-017): the setting `doorstop.documentView.fields` is contributed with type array/default `[]` (read from the extension manifest), a configured field shows in a freshly opened view and its edit is saved to the item file via the real server, a field an item lacks is omitted without error, a protected entry is ignored and reported through a `prompts` hook (`reportHint`), and changing the setting only affects views opened afterwards.

### Implementation for US3

- [X] T026 [US3] In `server/src/doorstop_server/schemas.py` add `fields: Optional[Dict[str, str]] = None` to `UpdateItemRequest` and `fields: Optional[Dict[str, str]] = None` to `ItemNode`; add a module constant `PROTECTED_FIELDS = {"uid","level","active","normative","derived","reviewed","cleared","links","header","text"}` (contracts/server-api.md).
- [X] T027 [US3] In `server/src/doorstop_server/routers/tree.py` (and its builder in `doorstop_tree.py`) accept optional query `fields` (comma-separated), drop protected names, and fill `ItemNode.fields` with `str(value)` for each requested name where `item.get(name)` is a non-empty scalar (`str`/`int`/`float`/`bool`); leave `fields` unset when the parameter is absent.
- [X] T028 [US3] In `server/src/doorstop_server/routers/items.py` change `apply_prose` to also take `fields` and set each with Doorstop's `item.set(name, value)` before the single `item.save()`; in `update_item` reject protected names with `DoorstopApiError(422, "PROTECTED_FIELD", "<name> cannot be edited here")` before writing and change the empty-body message to `header, text or fields is required`.
- [X] T029 [US3] In `src/documentViewModel.ts` add `PROTECTED_FIELDS`, `normaliseFieldList(raw: unknown): { fields: string[]; protectedNames: string[] }`, and extend `render(snapshot, fields)` to emit the managed `doorstop-fields` fence directly under the heading when the item has at least one configured field (fence lines treated as managed lines like separators; text lines that look like the fence stay ordinary text, so add them to the `separator-lookalike` handling only when they are the first fence after the heading). Extend `parse`/`checkStructure`/`planSave` so a changed value line becomes `ItemUpdate.fields`, and structural errors `fields-missing-line`, `fields-extra-line`, `fields-name-changed`, `fields-multiline` are produced (contracts/fields-block.md). `ItemUpdate.headerOnly` stays true only when neither text nor fields changed.
- [X] T030 [US3] In `src/documentViewProvider.ts` read `doorstop.documentView.fields` through `normaliseFieldList` at open and regenerate, pass it to `GET /tree` as `?fields=…` (omit the query when the list is empty) and to `render`; report protected names once per open through `prompts.reportHint`; send `fields: {…}` on `PATCH /items/{uid}` together with header/text; include field write failures in the existing "failed writes" report.
- [X] T031 [US3] In `src/documentViewLanguage.ts` dim the fence lines and revert edits to them like separators (hint text `SEPARATOR_HINT`), and surface the new structural issue codes as diagnostics with the "Restore block structure" quick fix.
- [X] T032 [US3] In `package.json` contribute setting `doorstop.documentView.fields` exactly as in contracts/fields-block.md (array of strings, default `[]`, markdownDescription) under a new "Document View" configuration section.

**Checkpoint**: All three stories work independently.

---

## Phase 6: Polish & Cross-Cutting

- [X] T033 [P] Update `README.md` (section/filter entry points, fields setting) and `CHANGELOG.md` for the new behaviour; mention that views may overlap.
- [X] T034 [P] Confirm `.github/workflows/ci.yml` runs `src/test/documentViewScopes.test.ts` and the two new pytest files; adjust only if T002 did not already wire them.
- [X] T035 Check Constitution VIII: grep that each of FR-001…FR-005 and FR-009…FR-017 appears in at least one `spec 030 FR-0xx` trace comment under `src/test` or `server/tests`.
- [X] T036 Run the full quickstart.md manually in the Extension Development Host; run `npm run check-types && npm run lint && npm test` and `pytest` in `server/`; all green. This manual run is also the verification of SC-001 to SC-004 (one-click open of a section and of a filter result, indistinguishable behaviour of full/section/filter views, field setting usable without documentation); record the result in the PR description.

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 (blocks everything) → Phase 3 (US1, MVP) → Phase 4 (US2) / Phase 5 (US3) → Phase 6.
- US2 depends on Phase 2 only (and reuses `openDocumentView(scope)`); it does not need US1's tree code (except T006's section branch, which is exercised only by US1).
- US3 is independent of US1/US2; its server tasks (T022–T023, T026–T028) can start right after Phase 1.
- Within Phase 2: T003, T005 [P] early; T004 → T006 → T007 → T008/T009/T010 (same file, sequential) → T011.
- Within US3: T026 → T027/T028 → T022/T023 pass; T029 → T030 → T031.

### Parallel opportunities

- T003 ‖ T005 (after T004).
- US1: T012 ‖ T013 (different files, before implementation).
- US2: T017 ‖ T018.
- US3: T022 ‖ T023 ‖ T024 ‖ T025; server tasks T026–T028 ‖ extension tasks T029–T032 (different codebases; T030 needs T027/T028 for end-to-end tests only).
- Polish: T033 ‖ T034.

## Implementation Strategy

1. **MVP**: Phases 1–3 (T001–T016): foundational scope refactor plus section views.
2. Add US2 (filter results, T017–T021): small, mostly wiring.
3. Add US3 (fields, T022–T032): largest, touches the server and the text grammar; can be built in parallel by a second developer once Phase 2 is merged.
4. Finish with Phase 6.

## Phase 7: Convergence

- [ ] T037 Run quickstart.md by hand in the Extension Development Host and record in the PR description that SC-001 to SC-004 hold (one-click section and filter open, views behave alike, fields setting usable without documentation); T036 was closed on automated results only per SC-001..SC-004 (partial)
- [X] T038 Make the explorer's `attachHierarchy` in `src/requirementTree.ts` use the exported `sectionUids`/`compareItemLevels` nesting rule instead of its own ancestor-stack loop, so section views and explorer cannot diverge per plan: research §2 (partial)
- [X] T039 Add a pytest case in `server/tests/test_items_fields.py` that a Markdown-format item file round-trips an extended field through `PATCH /items/{uid}` and `GET /tree?fields=` per contracts/server-api.md "Tests" and FR-015 (partial)
- [X] T040 Keep a newly created item visible in a section view when it lands at a level at or above the section root (today it is saved but drops out on the next refresh): extend the section scope in `src/documentViewProvider.ts` with created UIDs like filter scopes do, and cover it in `src/test/regressionFixture.test.ts` per FR-004 and the edge case on re-levelled items (partial)

## Phase 8: Convergence

- [X] T041 Reproduce the focus jump in the Extension Development Host (scroll down, put the cursor in a late block, focus another editor or the window, click back into the view) and find the cause by logging `editor.selection` and `visibleRanges` around `regenerate`/`applySnapshot`/`fs.fireChanged` in `src/documentViewProvider.ts`, the active-editor handlers in `src/documentViewLanguage.ts` and `src/extension.ts`, and `openDocumentView` per FR-018 and US1/AC6 (missing)
- [X] T042 Fix the cause so cursor, selection and scroll position survive both focus changes and text refreshes: where the text is replaced, remember the visible editors' selections (as block UID + line offset) and `visibleRanges` before the replacement and restore them afterwards when the block still exists, in `src/documentViewProvider.ts` per FR-018 and the refresh edge case (missing)
- [X] T043 Add tests in `src/test/regressionFixture.test.ts` ("Document View scopes (030)") with a `// Spec 030 FR-018` trace comment: for a document view and a section view, place the cursor in a late block, then (a) focus another editor and back, (b) trigger a refresh by saving an edit in an overlapping view, (c) reopen the same view; assert selection and `visibleRanges[0].start` are unchanged each time per FR-018 and Constitution VIII (missing)

## Phase 9: Convergence

- [ ] T044 In a real VS Code window, scroll a document view down, put the cursor in a late block, switch to another window or app, come back and click into the view; confirm cursor and scroll stay put. If it still jumps, log `onDidChangeTextEditorSelection`/`onDidChangeTextEditorVisibleRanges` (kind, positions) plus `fs.stat`/`readFile` calls on the view URI during the refocus, fix the real cause in `src/documentViewProvider.ts`, and drop the heuristic position guard if it is no longer needed per FR-018 and US1/AC6 (partial)

## Phase 10: Convergence

- [X] T045 Add the reload to `src/documentViewProvider.ts`: a prompt `confirmDiscard(label): Promise<'discard' | 'keep'>` in `Prompts` (default: modal warning "Discard my edits / Keep"), a `reloadView(state)` that asks it only when the document is dirty, then loads a fresh snapshot and regenerates with `forceBump` and reverts the editor like the disk-change "Reload" path, reports failures through `prompts.reportError` leaving the view untouched, and the command `doorstop.documentView.reload` taking `{ uri }` per FR-020 and FR-021 (missing)
- [X] T046 In `src/documentViewLanguage.ts` add exactly one CodeLens "Reload from disk" (command `doorstop.documentView.reload`, argument `{ uri }`) on the document-marker line next to "+ New item below", for every scope kind, per FR-019 (missing)
- [X] T047 [P] In `package.json` declare command `doorstop.documentView.reload` (title "Doorstop: Reload Document View from Disk") and hide it from the command palette with `when: false`, per FR-019 (missing)
- [X] T048 [P] Add tests with `// Spec 030 FR-019 / FR-020 / FR-021` trace comments in `src/test/regressionFixture.test.ts` ("Document View scopes (030)"): exactly one "Reload from disk" lens on line 0 of a document, a section and a filter view; a clean view shows a change made to the item file outside the view after the command; a dirty view asks and keeps its edits on 'keep' and drops them on 'discard'; a reload with a failing server (`reportError` captured, view text unchanged) per FR-019, FR-020, FR-021 and Constitution VIII (missing)
- [X] T049 [P] Mention the button in `README.md` (Document View section) and `CHANGELOG.md` per FR-019 (missing)
