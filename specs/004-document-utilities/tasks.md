---

description: "Task list for retroactive spec 004 (already implemented; open work is Principle VIII test traceability)"
---

# Tasks: Document Utilities (Reorder, Import, Export, Publish)

**Input**: Design documents from `/specs/004-document-utilities/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Scope note**: The feature is fully implemented. Tasks marked `[X]` describe code and tests that already exist. Open tasks are tests and `// Spec 004 FR-NNN` (Python: `# Spec 004 FR-NNN`) trace comments required by Constitution v1.4.0 Principle VIII. Tests only; no behaviour change. No Setup/Foundational phases are needed.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files or independent tests)
- Server tests live in `server/tests/test_documents.py` (CI: `pytest server/tests`); extension tests in `src/test/regressionFixture.test.ts` (CI: `npm test`).

---

## Phase 1: User Story 1 - Reorder a document's items (P1) MVP

**Goal**: Automatic and manual (index-based) reorder. **Independent Test**: `pytest server/tests/test_documents.py -k reorder` and the "Manual reorder" regressionFixture test.

### Existing implementation and tests

- [X] T001 [US1] Reorder routes `POST /documents/{prefix}/reorder`, `POST|DELETE .../reorder/index` with `NO_REORDER_INDEX` 409 in `server/src/doorstop_server/routers/documents.py`
- [X] T002 [US1] `doorstop.reorder` command (mode pick, existing-index Apply/Keep/Discard pick, save dirty index before apply) in `src/doorstopCommands.ts`
- [X] T003 [P] [US1] Server tests `test_reorder_auto`, `test_reorder_manual_without_index_returns_409`, `test_reorder_index_lifecycle`, `test_reorder_index_discard` in `server/tests/test_documents.py`
- [X] T004 [P] [US1] Command test "Manual reorder: an edited index is applied on the second run of the command" in `src/test/regressionFixture.test.ts`

### Open: Principle VIII traceability

- [ ] T005 [US1] Add `# Spec 004 FR-001` above `test_reorder_auto`, `# Spec 004 FR-004` above `test_reorder_manual_without_index_returns_409`, `# Spec 004 FR-002` above `test_reorder_index_lifecycle`, and `# Spec 004 FR-003` above `test_reorder_index_lifecycle` (index not overwritten on second ensure) and `test_reorder_index_discard` in `server/tests/test_documents.py`
- [ ] T006 [US1] Add `// Spec 004 FR-002` and `// Spec 004 FR-003` (Apply choice) to the "Manual reorder: an edited index is applied..." test in `src/test/regressionFixture.test.ts`
- [ ] T007 [US1] Add a command-level test tagged `// Spec 004 FR-001` in `src/test/regressionFixture.test.ts`: run `doorstop.reorder` with "Automatic" on the throwaway document (reuse `createDocumentInto`/`withStubbedDialogs`) after adding items, and assert levels are renumbered with no further prompt
- [ ] T008 [US1] Add a command-level test tagged `// Spec 004 FR-003` in `src/test/regressionFixture.test.ts`: with an existing `index.yml`, choosing "Discard index.yml" removes it and generates a fresh one, and "Keep editing index.yml" reopens the existing one without regenerating (currently only the Apply choice is tested)
- [ ] T009 [US1] Add a test tagged `// Spec 004 FR-004` in `src/test/regressionFixture.test.ts` (or a server test via `server.request`) asserting a manual apply with no index surfaces the clear `NO_REORDER_INDEX` error rather than a silent no-op, at the extension request layer

**Checkpoint**: FR-001..FR-004 each have a tagged CI test.

---

## Phase 2: User Story 2 - Import items (P2)

**Goal**: Import YAML/CSV/TSV/XLSX into a chosen document. **Independent Test**: `pytest server/tests/test_documents.py -k import`.

- [X] T010 [US2] Import route `POST /documents/{prefix}/import` in `server/src/doorstop_server/routers/documents.py` and `doorstop.import` command in `src/doorstopCommands.ts`
- [X] T011 [US2] Server test `test_export_then_import_round_trip` (YAML) in `server/tests/test_documents.py`
- [ ] T012 [US2] Add `# Spec 004 FR-005` to `test_export_then_import_round_trip` in `server/tests/test_documents.py`
- [ ] T013 [US2] Add a parametrized server test tagged `# Spec 004 FR-005` in `server/tests/test_documents.py`: export to csv, tsv and xlsx, import each into a second document, assert the item count (xlsx needs Doorstop's openpyxl dependency; confirm it is installed by `pip install -e "./server[dev]"`)

---

## Phase 3: User Story 3 - Export a document (P2)

**Goal**: Export to YAML/CSV/TSV/XLSX. **Independent Test**: `pytest server/tests/test_documents.py -k export`.

- [X] T014 [US3] Export route and `doorstop.export` command (format pick, save dialog, `reportWrittenPath`) in `server/src/doorstop_server/routers/documents.py` and `src/doorstopCommands.ts`
- [X] T015 [P] [US3] Tests: `test_export_then_import_round_trip` (server, YAML) and "Export reports the path the server actually wrote" in `src/test/regressionFixture.test.ts`
- [ ] T016 [US3] Add `# Spec 004 FR-006` to `test_export_then_import_round_trip` and `// Spec 004 FR-006` to "Export reports the path the server actually wrote" (also `// Spec 004 FR-008`, replacing the prose `(004 FR-008)` section comment with the standard tag)
- [ ] T017 [US3] Add a parametrized server test tagged `# Spec 004 FR-006` in `server/tests/test_documents.py`: export to csv, tsv and xlsx, assert each file is written and the response `path` equals it (can share the parametrization with T013)

---

## Phase 4: User Story 4 - Publish a document (P3)

**Goal**: Publish to Markdown/HTML/LaTeX and report the real output location. **Independent Test**: `pytest server/tests/test_documents.py -k publish`.

- [X] T018 [US4] Publish route, `_resolve_written_path`, and `doorstop.publish` command in `server/src/doorstop_server/routers/documents.py` and `src/doorstopCommands.ts`
- [X] T019 [P] [US4] Tests `test_publish_markdown_writes_to_requested_path` and `test_publish_html_nests_under_documents_subfolder` (already tagged `Spec 004 FR-008`) in `server/tests/test_documents.py`; "Publish reports the real HTML location even when it differs from the request" in `src/test/regressionFixture.test.ts`
- [ ] T020 [US4] Add `# Spec 004 FR-007` to `test_publish_markdown_writes_to_requested_path` and `test_publish_html_nests_under_documents_subfolder`, and `// Spec 004 FR-007` plus `// Spec 004 FR-008` to "Publish reports the real HTML location..." in the two test files
- [ ] T021 [US4] Add a server test tagged `# Spec 004 FR-007` in `server/tests/test_documents.py` publishing `format: "latex"` and asserting a `.tex` file exists at the reported `path` (Markdown and HTML are covered; LaTeX is not)
- [ ] T022 [US4] Add a server test tagged `# Spec 004 FR-008` in `server/tests/test_documents.py` for export: the reported `path` exists on disk and equals the written file (HTML-nesting case is already covered)

---

## Phase 5: Verification

- [ ] T023 Run `pytest server/tests` and `npm test`; confirm `grep -rn "Spec 004 FR-" server/tests src/test` shows at least one hit for each of FR-001..FR-008 (quickstart step 4)

## Dependencies and parallelism

- Phases are independent; T013 and T017 may share one parametrized test. Tasks T005/T012/T016/T020/T021/T022 all edit `server/tests/test_documents.py` and must be serialized; T006-T009 edit `src/test/regressionFixture.test.ts` and must be serialized with each other and with the T016/T020 extension-side comments.
- T023 runs last.

## Implementation strategy

Do Phase 1 (US1, P1) first, then the shared-file serialization above; the whole set is test-only and small. FR coverage map: FR-001 T005/T007; FR-002 T005/T006; FR-003 T005/T006/T008; FR-004 T005/T009; FR-005 T012/T013; FR-006 T016/T017; FR-007 T020/T021; FR-008 T016/T020/T022.
