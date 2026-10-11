# Tasks: Traceability Diagram - Core Editor & Persistence

**Input**: plan.md, spec.md, data-model.md, research.md
**Status**: Retroactive. Implementation is done ([X]); open tasks are Principle VIII test traceability (`Spec 007 FR-NNN` trace comments + missing FR tests). No production code changes.

## Phase 1: Existing implementation (done)

- [X] T001 `doorstop.newDiagram` command writes empty diagram and opens it in `src/extension.ts`
- [X] T002 `CustomEditorProvider` open/save/saveAs/revert/backup in `src/extension.ts`
- [X] T003 `serializeDiagram`/`readDiagram`/`readDiagramOrBackup` with workspace-relative paths in `src/diagrammPanel.ts`
- [X] T004 Load-time `GET /tree` enrichment, colours by document, fallback + one-time warning in `src/diagrammPanel.ts`
- [X] T005 `withAuthoritativeEdges` keeps persisted edges with an unknown endpoint in `src/diagrammPanel.ts`
- [X] T006 Existing tests: round trip (`src/test/diagramLayout.test.ts`), hot-exit backup (`src/test/extension.test.ts`), command contribution (`src/test/extension.test.ts`)

## Phase 2: User Story 1 - Create a new diagram (P1)

**Independent test**: run `doorstop.newDiagram` with a stubbed save dialog; file exists, parses as empty diagram, opened with `doorstop.diagram`.

- [ ] T007 [US1] Add `Spec 007 FR-001` test in `src/test/extension.test.ts`: execute `doorstop.newDiagram` (stub `showSaveDialog` to a temp `*.doorstop.json`), assert file content equals `serializeDiagram({nodes:[],edges:[]})` and the active tab uses viewType `doorstop.diagram`
- [ ] T008 [US1] Add trace comment `Spec 007 FR-001` to existing "New Diagram is still contributed" test in `src/test/extension.test.ts`

## Phase 3: User Story 2 - Reopen and persist correctly (P1)

**Independent test**: save/reload/revert round trip in the extension host; paths stay workspace-relative.

- [ ] T009 [P] [US2] Add `Spec 007 FR-002` / `FR-004` trace comments to the round-trip test in `src/test/diagramLayout.test.ts` ("a removed node and its incident edges are gone after a round trip"; currently cites feature 015 FR-002/FR-004)
- [ ] T010 [US2] Add `Spec 007 FR-002` test in `src/test/diagramLayout.test.ts`: saved nodes contain workspace-relative `fileUri` (no drive letter / leading `/`, forward slashes) and still resolve after reading the file from a different temp root
- [ ] T011 [US2] Add `Spec 007 FR-003` test in `src/test/extension.test.ts`: open a diagram custom editor, apply a change, `workbench.action.files.save` persists it; then change again and `workbench.action.files.revert` returns to the last-saved state
- [ ] T012 [P] [US2] Add `Spec 007 FR-003` trace comment to the hot-exit backup suite tests in `src/test/extension.test.ts` (spec 008 suite)

## Phase 4: User Story 3 - Live status on nodes (P2)

**Independent test**: with the regression fixture server, loading a diagram posts server meta; with server down it posts saved content.

- [ ] T013 [US3] Add `Spec 007 FR-005` test in `src/test/regressionFixture.test.ts`: open a fixture diagram, capture the `loadDiagram` message (or call `refreshItemMeta`) and assert `meta[uid].documentPrefix`/`links` match the server and `documents` is populated
- [ ] T014 [US3] Add `Spec 007 FR-006` test in `src/test/regressionFixture.test.ts` (or a unit test with a failing stub server): `/tree` failure yields `loadDiagram` with the saved diagram and empty meta, and exactly one warning across two loads
- [ ] T015 [US3] Add `Spec 007 FR-007` test in `src/test/diagramLayout.test.ts` or `regressionFixture.test.ts`: persisted edge whose `from` OR `to` is unknown to the server survives load; edges between known nodes follow server links (may require exercising via the `loadDiagram` message since `withAuthoritativeEdges` is private; do not change visibility unless unavoidable)
- [ ] T016 [P] [US3] Add `Spec 007 FR-005` trace comment to the spec 025 "canvas renders no status badges" test noting FR-005 badges were superseded; spec.md FR-005 already amended to drop badges (user approved), so the FR-005 test only checks document coloring

## Phase 5: Polish

- [ ] T017 Run `npm run compile` and `npm test`; verify `grep -rn "Spec 007 FR-" src/test` lists FR-001..FR-007

## Dependencies

T007-T008 (US1), T009-T012 (US2), T013-T016 (US3) are independent of each other; T017 last. [P] tasks touch different test files/regions.

## Summary

17 tasks: 6 done (T001-T006), 11 open (T007-T017). Per story open: US1 2, US2 4, US3 4, Polish 1.
MVP: US1+US2 trace tasks. FR coverage: FR-004 covered by existing test (T009); FR-001/002/003/005/006/007 need new tests.
