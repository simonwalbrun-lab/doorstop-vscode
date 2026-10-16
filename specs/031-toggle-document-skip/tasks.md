---

description: "Task list for 031 Toggle Document Skip"
---

# Tasks: Toggle Document Skip

**Input**: Design documents from `/specs/031-toggle-document-skip/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/skip-api.md](contracts/skip-api.md), [quickstart.md](quickstart.md)

**Tests**: Included. Constitution VI and VIII require a CI-run test per FR with a trace comment (`# Spec 031 FR-NNN` in pytest, `// Spec 031 FR-NNN` in vscode-test) directly above the test, listing every FR it verifies. Server tests go in `server/tests/test_document_skip.py` (use the real-project `client`/`document` fixtures from `conftest.py`, no mocks); extension tests in `src/test/documentSkip.test.ts` (static `package.json` checks in the style of `src/test/packageMenus.test.ts`).

**Organization**: Grouped by user story. Paths are relative to the repo root.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [x] T001 [P] Create `server/tests/test_document_skip.py` (imports from `.conftest`, empty module) and `src/test/documentSkip.test.ts` (suite skeleton modelled on `src/test/packageMenus.test.ts`)

---

## Phase 2: Foundational (server + types shared by all stories)

- [x] T002 In `server/src/doorstop_server/schemas.py` add `SkippedDocument(prefix: str, markerPath: str)`, `SkipDocumentRequest(markerPath: str, skip: bool)`, `SkipDocumentResponse(markerPath: str, skipped: bool)` and `skippedDocuments: List[SkippedDocument] = []` on `TreeResponse`
- [x] T003 In `server/src/doorstop_server/doorstop_tree.py` add `find_skipped_documents(root: str) -> list[tuple[str, str]]`: `os.walk(root)` pruning `_EXCLUDED_DIRS`; for each folder containing `Document.SKIP` (import `from doorstop.core.document import Document`), try `Document(dirpath, root, tree=None)`, ignore `DoorstopError`, return `(str(document.prefix), document.config)`
- [x] T004 In `server/src/doorstop_server/routers/tree.py` fill `skippedDocuments` in `get_tree_structure` from `find_skipped_documents(settings.project_root)` (get settings the way `deps.py` does; read `deps.py` first), sorted by prefix
- [x] T005 In `server/src/doorstop_server/routers/documents.py` add `POST /documents/skip` (`SkipDocumentRequest` -> `SkipDocumentResponse`, using `get_tree`): folder = dirname of `markerPath`; if `Document(folder, root, tree=None)` fails with `DoorstopError` or the folder is outside the project, raise `DoorstopApiError(404, "DOCUMENT_NOT_FOUND", ...)`; `skip` true -> `Path(folder, Document.SKIP).touch()`, false -> `unlink(missing_ok=True)`; idempotent; return the resulting state
- [x] T006 [P] In `src/doorstopTypes.ts` add `SkippedDocument { prefix: string; markerPath: string }` and optional `skippedDocuments?: SkippedDocument[]` on `TreeResponse`

**Checkpoint**: server can list and toggle; extension types exist.

---

## Phase 3: User Story 1 - Disable a document with one click (Priority: P1) MVP

**Goal**: A disable button on each document row in the tree view marks the document skipped; it is excluded from validation and modification.

**Independent Test**: Click disable on a document: marker exists, row is greyed, document gone from validation and pickers.

- [x] T007 [US1] In `server/tests/test_document_skip.py` add tests (each with `# Spec 031 FR-NNN` above): skipping creates `.doorstop.skip` in the document folder (FR-002); the skipped document is absent from `GET /tree` `documents` and present in `skippedDocuments` with its prefix (FR-005, FR-009); `GET /validation` reports no issues for it (FR-005, use the validation endpoint as `test_validation.py` does); skipping one document leaves a second (parent/child) document in `documents` (FR-009); unknown `markerPath` returns 404 (FR-008)
- [x] T008 [P] [US1] In `src/test/documentSkip.test.ts` add static `package.json` tests: `doorstop.skipDocument` has an inline `view/item/context` entry with `view == doorstop.treeView && viewItem == doorstop.root` (FR-001); both toggle commands are hidden in `menus.commandPalette` (`when: false`) and appear in no other menu location (FR-001); the two commands use different icons/titles reflecting the action (FR-004)
- [x] T009 [US1] In `package.json` add commands `doorstop.skipDocument` (title "Doorstop: Disable Document", icon `$(eye-closed)`) and `doorstop.enableDocument` (title "Doorstop: Enable Document", icon `$(eye)`); add `view/item/context` inline entries (`group: "inline@3"`; skip on `viewItem == doorstop.root`, enable on `viewItem == doorstop.root.skipped`, both with `view == doorstop.treeView &&`); add both to `menus.commandPalette` with `"when": "false"`
- [x] T010 [US1] In `src/doorstopCommands.ts` register `doorstop.skipDocument` and `doorstop.enableDocument` via the existing `register`/`run` helpers: take the `RequirementTreeItem` argument, read `itemData.markerPath` (enabled roots: `resourceUri.fsPath`), `POST /documents/skip` with `{markerPath, skip}`; `run()` already refreshes tree/commands/problems and shows the error message on failure (FR-008); do nothing when no tree item is passed
- [x] T011 [US1] In `src/requirementTree.ts` `fetchItems`, after the documents loop, create one node per `response.skippedDocuments ?? []` (label = folder name, `itemData: { prefix, markerPath, skipped: true }` with NO `isDoorstopRoot` and NO `uid`, `CollapsibleState.None`, `contextValue = 'doorstop.root.skipped'`, `description = prefix + ' (disabled)'`, `iconPath = new vscode.ThemeIcon('eye-closed', new vscode.ThemeColor('disabledForeground'))`, no click command); store them in a `skipped` array cleared in `refresh()` and return `[...this.roots, ...this.skipped]` from `getChildren()` for the top level; keep `documentRoots()` unaffected so pickers never offer them (FR-006)

**Checkpoint**: US1 works end to end (disable shows a greyed row).

---

## Phase 4: User Story 2 - Re-enable a document with one click (Priority: P1)

**Goal**: The same row offers enable; clicking it restores the document.

**Independent Test**: Enable a disabled document: marker gone, document back in tree and validated.

- [x] T012 [US2] In `server/tests/test_document_skip.py` add tests: enabling removes the marker (FR-003); after enabling, the document is back in `documents` and validated again (FR-003, FR-005); toggling twice in the same direction is idempotent and the final state matches the last request (edge case rapid clicks)
- [x] T013 [P] [US2] In `src/test/documentSkip.test.ts` add: `doorstop.enableDocument` has an inline entry on `viewItem == doorstop.root.skipped` only, tree view only (FR-001, FR-004)

**Checkpoint**: round trip works (T009-T011 already provide the enable path; this phase verifies it).

---

## Phase 5: User Story 3 - Reflect externally changed skip state (Priority: P2)

**Goal**: Adding or removing `.doorstop.skip` outside the extension updates the tree view automatically.

**Independent Test**: Create/delete the marker by hand; the tree view updates within 2 s.

- [x] T014 [US3] In `src/extension.ts` (next to `onChanged`, inside the `workspaceFolder` block) create `vscode.workspace.createFileSystemWatcher('**/.doorstop.skip')`, call `onChanged` on create and delete, and push the watcher to `context.subscriptions`
- [x] T015 [P] [US3] In `src/test/documentSkip.test.ts` add a test with a temp workspace/`DoorstopTreeProvider` stub or the extension host: creating `.doorstop.skip` through `fs` changes the tree node to `doorstop.root.skipped` after refresh (FR-007); a refresh with the marker removed restores `doorstop.root` (FR-007). If the host cannot assert watcher timing, assert via `treeProvider.refresh()` and document that the watcher is wired in `src/extension.ts`
- [x] T016 [P] [US3] In `server/tests/test_document_skip.py` add: a marker created by hand (not through the endpoint) is reported by `GET /tree` as skipped, and removed by hand is back in `documents` (FR-007, cache invalidation via `fingerprint`)

---

## Phase 6: Polish & Cross-Cutting

- [x] T017 [P] Add a "Disable/enable documents" entry to `CHANGELOG.md` and one line to `README.md`'s tree view section
- [x] T018 Run `cd server && pytest`, then `npm run check-types`, `npm run lint`, `npm test`; fix failures
- [ ] T019 Run the manual scenario in [quickstart.md](quickstart.md) step 3 if a VS Code host is available; otherwise note it as unverified

---

## Phase 7: Cascade disable to child documents (clarification 2026-10-14, FR-009)

**Goal**: Disabling a document also disables all its descendant documents; enabling stays single-document.

**Independent Test**: Disable a parent with a child and a grandchild: all three have `.doorstop.skip`; enable the parent: only the parent loses it.

- [x] T020 [US1] In `server/src/doorstop_server/schemas.py` add `affected: List[str] = []` to `SkipDocumentResponse`
- [x] T021 [US1] In `server/src/doorstop_server/routers/documents.py` `skip_document`: replace the `HAS_ENABLED_CHILDREN` refusal with a cascade. For `skip: true`, collect the document and all descendants (repeatedly add documents of `tree` whose `parent` is in the collected prefix set; `Document.config` gives each marker path), `touch` each `<folder>/.doorstop.skip` that is missing, and return the `markerPath` of every marker actually created in `affected`. Keep the `PARENT_DISABLED` 409 for `skip: false`; for `skip: false` return `affected` with only the given document if its marker was removed
- [x] T022 [US1] In `server/tests/test_document_skip.py` replace the `HAS_ENABLED_CHILDREN` assertions of `test_cannot_skip_a_parent_with_enabled_children_or_enable_a_child_under_a_skipped_parent` with: disabling the parent with a child and a grandchild (`# Spec 031 FR-009`) disables all three (markers exist, all three in `skippedDocuments`, `affected` lists three paths), a child that was already disabled is left as is (not in `affected`), enabling the parent re-enables only the parent (children keep their markers), enabling a child under the disabled parent returns 409 `PARENT_DISABLED`
- [x] T023 [P] [US1] In `specs/031-toggle-document-skip/quickstart.md` step 3 and `README.md` add that disabling a document also disables its child documents

---

## Dependencies & Execution Order

- Phase 1 -> Phase 2 -> Phase 3 (MVP) -> Phase 4 -> Phase 5 -> Phase 6.
- Inside Phase 2: T002 before T003-T005; T006 independent.
- US2 reuses T009-T011; US3 only needs Phase 2 and T011.
- Parallel: T001 with nothing else; T006 with T002-T005; T008 with T007; T013, T015, T016 together.

## Implementation Strategy

MVP = Phases 1-3 (disable plus visible disabled row). Then verify enable (Phase 4), then external-change handling (Phase 5).

## Phase 8: Convergence

- [x] T024 Replace the source-text check in `src/test/documentSkip.test.ts` with a real test: stub a `DoorstopServer` whose `request` returns a `TreeResponse` with one document in `documents` and one in `skippedDocuments`, build a `DoorstopTreeProvider`, and assert the skipped row has `contextValue === 'doorstop.root.skipped'`, no `isDoorstopRoot`, and that a second load with the marker moved back to `documents` yields `doorstop.root`; add the file to the `documentSkip` config in `.vscode-test.mjs` if it needs a workspace; trace `// Spec 031 FR-004 FR-006 FR-007` per tests/README style (partial: T015 ticked without a runtime assertion) per FR-007 (partial)
- [x] T025 In `server/src/doorstop_server/errors.py` make the `DoorstopError` handler answer a "no item with UID: X" message with 409 `DOCUMENT_DISABLED` ("Document <prefix> is disabled") when `X.yml` or `X.md` exists inside a folder that `find_skipped_documents` reports; add a pytest case in `server/tests/test_document_skip.py` (`# Spec 031 FR-006`) that updates an item of a disabled document and expects that code (partial: only a generic not-found error today) per FR-006 (partial)
- [ ] T026 Run the manual check in `quickstart.md` step 3 in a VS Code window (disable parent with a child, enable parent only, edit `.doorstop.skip` by hand) and record the outcome next to T019 (missing) per SC-001, SC-004 (missing)
