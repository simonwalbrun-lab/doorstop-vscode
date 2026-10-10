---

description: "Task list for 002 - Explorer tree and Commands panel (retroactive; Principle VIII test traceability)"
---

# Tasks: Requirements Explorer & Commands Panel

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [quickstart.md](quickstart.md)

**Tests**: Required by Constitution v1.4.0 Principle VIII - every FR needs a CI-run test whose trace comment `Spec 002 FR-NNN` sits directly above or at the start of the test function.

**State**: The feature is implemented. `[X]` = already exists in the repo; open tasks only add/trace tests (no production-code changes expected).

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Extension, server, CI and test labels exist (`.vscode-test.mjs`, `.github/workflows/ci.yml`, `server/tests`)
- [ ] T002 Add label `explorerTree` (files `out/test/explorerTree.test.js`, no workspace folder) to `.vscode-test.mjs`

## Phase 2: Foundational

- [ ] T003 Create `src/test/explorerTree.test.ts` with a stub-server helper (`{ request: async () => TreeResponse }` cast to `DoorstopServer`, as in `src/test/extension.test.ts`) and a temp-dir fixture of 2 documents (one with levels `1`, `1.1`, `1.1.1`, `2`; one empty), used by T006-T010, T013, T015

## Phase 3: User Story 1 - Browse in sidebar tree (P1)

**Independent test**: `DoorstopTreeProvider` over a stub server shows roots, nesting, open command, refresh and a single error toast.

- [X] T004 [US1] Implement `DoorstopTreeProvider`, `levelDepth`, `RequirementTreeItem` in `src/requirementTree.ts`; register `doorstop.treeView` and `doorstop.refresh` in `src/extension.ts` / `src/doorstopCommands.ts`
- [X] T005 [US1] Existing test "Explorer tree loads all three fixture documents" in `src/test/regressionFixture.test.ts` (raw `/tree`; includes empty document)
- [ ] T006 [P] [US1] Add trace comment `Spec 002 FR-001` to the test in T005 (`src/test/regressionFixture.test.ts`) and add provider-level test `getChildren()` returns one root per document, empty document included, in `src/test/explorerTree.test.ts` with `Spec 002 FR-001`
- [ ] T007 [P] [US1] Test in `src/test/explorerTree.test.ts`: items nest by outline depth (`1` > `1.1` > `1.1.1`, sibling `2` under the root, `getParent` consistent), plus unit checks of `levelDepth` (`1.0`->1, `1.14.0`->2) - trace `Spec 002 FR-002`
- [ ] T008 [P] [US1] Test in `src/test/explorerTree.test.ts`: item node `command` is `vscode.open` with the item file URI; document root opens its marker file - trace `Spec 002 FR-003`
- [ ] T009 [P] [US1] Test in `src/test/explorerTree.test.ts`: after the stub server's response changes, `refresh()` + `getChildren()` shows the new data; `refresh()` fires `onDidChangeTreeData` - trace `Spec 002 FR-004`
- [ ] T010 [P] [US1] Test in `src/test/explorerTree.test.ts`: stub server rejects -> `getChildren()` returns `[]`, `showErrorMessage` (stubbed) called once across repeated loads, again after a successful load + failure - trace `Spec 002 FR-008`

## Phase 4: User Story 2 - Tree follows the active editor (P2)

**Independent test**: `setActiveResource(uri)` resolves the matching node; non-item files resolve nothing.

- [X] T011 [US2] Implement `syncActiveRequirement` / `onDidChangeActiveTextEditor` in `src/extension.ts` and `setActiveResource` in `src/requirementTree.ts`
- [X] T012 [US2] Existing test "Auto-reveal toggle suppresses reveal on both gated paths" in `src/test/extension.test.ts` (spec 010; covers the toggle gate only)
- [ ] T013 [US2] Test in `src/test/explorerTree.test.ts`: `setActiveResource` returns the node for an item file and `undefined` for an unrelated file (edge case: active file not a Doorstop item) - trace `Spec 002 FR-005`; also add `Spec 002 FR-005` as an additional trace on T012's test

## Phase 5: User Story 3 - Commands panel (P2)

**Independent test**: the panel lists every primary action wired to a registered command.

- [X] T014 [US3] Implement `DoorstopCommandsProvider` in `src/commandsProvider.ts`; register `doorstop.commandsView` in `src/extension.ts`
- [ ] T015 [US3] Test in `src/test/explorerTree.test.ts`: `getChildren()` contains Add, Reorder, Link, Clear, Review, Import, Export, Publish rows, each `command.command` being a command id declared in `package.json` `contributes.commands` - trace `Spec 002 FR-006`; also add that trace to the existing tests in `src/test/filterNotebook.test.ts` (Commands panel, 022 FR-002) and `src/test/extension.test.ts` ("the Commands panel lists New Diagram")

## Phase 6: User Story 4 - Create a document (P3)

**Independent test**: Create Document with prefix + folder + parent choice behaves per FR-007, FR-009..FR-011.

- [X] T016 [US4] Implement `doorstop.createDoc` and `chooseParentPrefix` in `src/doorstopCommands.ts`; server `POST /documents` accepts optional `parentPrefix`
- [X] T017 [US4] Existing tests in `src/test/regressionFixture.test.ts`: "Create Document creates the new document under the chosen parent", "The parent quick-select distinguishes \"None\" from a dismissed pick", "Create Document surfaces Doorstop's refusal of a second root document", "Create Document creates nothing when the parent pick is dismissed"; server `test_create_document_returns_prefix_and_path` and `test_create_child_document_with_parent` in `server/tests/test_documents.py`
- [ ] T018 [P] [US4] Add trace comments in `src/test/regressionFixture.test.ts`: `Spec 002 FR-007` on "creates the new document under the chosen parent"; `Spec 002 FR-009, FR-010, FR-011` on "distinguishes None from a dismissed pick"; `Spec 002 FR-010` on "second root document"; `Spec 002 FR-011` on "creates nothing when the parent pick is dismissed"
- [ ] T019 [P] [US4] Add trace comments `Spec 002 FR-007` (and `FR-010` for root creation) above `test_create_document_returns_prefix_and_path`, and `Spec 002 FR-009` above `test_create_child_document_with_parent` in `server/tests/test_documents.py`
- [ ] T020 [US4] Add test in `src/test/regressionFixture.test.ts` (`Spec 002 FR-010`): with the "None" pick, the `POST /documents` request body omits `parentPrefix` (spy on `server.request` around `doorstop.createDoc`; reuse `createDocumentInto`/`withStubbedDialogs`)

## Phase 7: Polish

- [ ] T021 Update stale Assumption in `specs/002-explorer-commands-panel/spec.md` (FR-009..011 are implemented) - spec edit, separate from code
- [ ] T022 Run `npm run lint`, `npm test`, `cd server && pytest`; verify `grep -rn "Spec 002 FR-" src/test server/tests` lists FR-001..FR-011 (quickstart.md step 4)

## Dependencies

- T002 -> T003 -> T006-T010, T013, T015 (all in `explorerTree.test.ts`; same file, so not truly parallel across authors - [P] means independent test cases)
- T018, T019, T020 independent of the above; T020 builds on the existing helpers (T017)
- T022 last

## Summary

- Total 22 tasks: 8 done ([X]), 14 open
- Per story: US1 7 (2 done), US2 3 (2 done), US3 2 (1 done), US4 5 (2 done); setup/foundation 3 (1 done); polish 2
- MVP: US1 tests (T002, T003, T006-T010)
