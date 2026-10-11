# Tasks: Requirement Item Lifecycle Commands

**Input**: `/specs/003-item-lifecycle-commands/` (plan.md, spec.md, research.md, data-model.md, contracts/)

**Tests**: Required - Constitution v1.4.0 Principle VIII: every FR has a CI-run test whose comment contains `Spec 003 FR-NNN`.

**Status**: Feature is implemented. `[X]` = exists in code today. Open tasks = missing tests and trace comments only. Do not change production code.

## Phase 1: Setup / Phase 2: Foundational

None. No new files or dependencies.

## Phase 3: User Story 1 - Add a new item (P1)

**Independent Test**: Run Add Item on a document root and on an item; new file exists at expected level and is opened.

- [X] T001 [US1] `doorstop.add` handler, `nextLevel()` in `src/doorstopCommands.ts`; `POST /documents/{prefix}/items` in `server/src/doorstop_server/routers/documents.py`
- [X] T002 [P] [US1] Server tests exist: `test_add_item_creates_file_and_returns_uid`, `test_add_item_with_explicit_level`, `test_add_item_on_unknown_document_returns_400` in `server/tests/test_documents.py`
- [ ] T003 [P] [US1] Add trace comment `# Spec 003 FR-001` to `test_add_item_creates_file_and_returns_uid` and `test_add_item_with_explicit_level` in `server/tests/test_documents.py`
- [ ] T004 [US1] Add vscode-test case in `src/test/regressionFixture.test.ts`, comment `// Spec 003 FR-001`: execute `doorstop.add` with a tree item of known level (e.g. a REQ item) and assert via `GET /tree` that a new item exists at the next level and the same document; delete the created file in `finally` (use the existing `withRestoredFile`-style cleanup so the fixture stays untouched).
- [ ] T005 [US1] In the same test (or a sibling with `// Spec 003 FR-002`), assert `vscode.window.activeTextEditor.document.uri.fsPath` equals the created item's path after `doorstop.add` (covers FR-002).

## Phase 4: User Story 2 - Link two items (P1)

**Independent Test**: Link two items; link visible on child; self-link rejected.

- [X] T006 [US2] `doorstop.link` handler in `src/doorstopCommands.ts`; `POST /items/{uid}/links` in `server/src/doorstop_server/routers/items.py`
- [X] T007 [P] [US2] Server tests exist: `test_link_and_unlink_items`, `test_self_link_is_rejected`, `test_link_to_unknown_parent_returns_400` in `server/tests/test_items.py`
- [ ] T008 [P] [US2] Add trace comments in `server/tests/test_items.py`: `# Spec 003 FR-003` on `test_link_and_unlink_items`; `# Spec 003 FR-004` on `test_self_link_is_rejected`; `# Spec 003 FR-008` on `test_link_to_unknown_parent_returns_400`.
- [ ] T009 [US2] Add vscode-test case in `src/test/regressionFixture.test.ts`, `// Spec 003 FR-003`: execute `doorstop.link` with a tree item (parent) while stubbing `vscode.window.showInputBox` to return the child UID (manual branch) and assert via `GET /tree` that the link exists; a second case passes `{childUid}` with a tree-item parent (editor/Document-View branch). Restore stubs and fixture file in `finally`.
- [ ] T010 [US2] Add vscode-test case `// Spec 003 FR-004`: `doorstop.link` with item as parent and same UID as child (via `{childUid}`) shows the error path and creates no link (stub `showErrorMessage`, assert called with `Doorstop command failed`).

## Phase 5: User Story 3 - Review (P2)

**Independent Test**: Review item/document/all; reviewed flag set; missing target prompts.

- [X] T011 [US3] `doorstop.review`, `reviewClearTarget()`, `chooseDocumentOrAll()` in `src/doorstopCommands.ts`; `POST /review` in `server/src/doorstop_server/routers/review.py`
- [X] T012 [P] [US3] Tests exist: `server/tests/test_review.py` (single item, missing target 422, all scope, document scope, unknown target 400) and `regressionFixture.test.ts` "Item lifecycle: the review command marks REQ-001 as reviewed"
- [ ] T013 [P] [US3] Add trace comments in `server/tests/test_review.py`: `# Spec 003 FR-005` on `test_review_single_item`, `test_review_all_scope_does_not_require_target`, `test_review_document_scope_reviews_every_item`; `# Spec 003 FR-007` on `test_review_missing_target_returns_422` and `test_review_all_scope_does_not_require_target`; `# Spec 003 FR-008` on `test_review_unknown_target_returns_400`.
- [ ] T014 [P] [US3] Add `// Spec 003 FR-005` to the "Item lifecycle: the review command" test in `src/test/regressionFixture.test.ts`.
- [ ] T015 [US3] Add vscode-test case `// Spec 003 FR-007`: execute `doorstop.review` with no argument while stubbing `showQuickPick` to capture its items and return the `all` choice; assert the picker offered the document prefixes plus `all`, and that the run succeeded (restore stub and fixture in `finally`).

## Phase 6: User Story 4 - Clear suspect (P2)

**Independent Test**: Clear on an item with a suspect link; flag cleared; unknown parent filter errors.

- [X] T016 [US4] `doorstop.clear` in `src/doorstopCommands.ts`; `POST /clear` in `server/src/doorstop_server/routers/review.py` (with `parents` filter used by CodeLens spec 013)
- [X] T017 [P] [US4] Tests exist: `test_clear_item_scope`, `test_clear_with_unknown_parent_filter_returns_400`, `test_clear_with_parents_filter_clears_only_the_named_link` in `server/tests/test_review.py`; "Item lifecycle: the clear-suspect command" in `regressionFixture.test.ts`
- [ ] T018 [P] [US4] Add trace comments: `# Spec 003 FR-006` on `test_clear_item_scope` and `test_clear_with_parents_filter_clears_only_the_named_link`; `# Spec 003 FR-008` on `test_clear_with_unknown_parent_filter_returns_400` (all in `server/tests/test_review.py`); `// Spec 003 FR-006` on the clear-suspect test in `src/test/regressionFixture.test.ts`.
- [ ] T019 [P] [US4] Add pytest `# Spec 003 FR-006` in `server/tests/test_review.py`: `test_clear_document_scope_clears_every_link` (two linked children in one document, `POST /clear` `{scope:"document", target:prefix}` -> 204, all links `cleared`) and `test_clear_all_scope_does_not_require_target` (`{scope:"all"}` -> 204, links cleared).
- [ ] T020 [P] [US4] Add pytest `# Spec 003 FR-007` and `# Spec 003 FR-008` in `server/tests/test_review.py`: `test_clear_missing_target_returns_422` (`{scope:"item"}`) and `test_clear_unknown_document_returns_400` (`{scope:"document", target:"NOPE"}`).

## Phase 7: Polish

- [ ] T021 Verify every FR-001..FR-008 appears in a `Spec 003 FR-NNN` comment: `grep -rn "Spec 003 FR-" server/tests src/test`; run `pytest server/tests` and `npm test`.

## Dependencies

All stories independent. T003/T008/T013/T014/T018 (comment-only) and T019/T020 (pytest) are parallel. T004 -> T005 and T009 -> T010 share `regressionFixture.test.ts`, so do not run in parallel with T014/T015.

## Strategy

Cheapest first: trace comments (T003, T008, T013, T014, T018), then pytest gaps (T019, T020), then vscode-test cases (T004, T005, T009, T010, T015), then T021.
