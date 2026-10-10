# Tasks: Hover Previews & Navigation

**Input**: specs/006-hover-navigation/ (plan.md, spec.md, research.md, data-model.md, quickstart.md)

**Note**: Retroactive. [X] = already implemented/tested. Open tasks close Constitution v1.4.0 Principle VIII gaps: every test carries a trace comment `Spec 006 FR-NNN`. Tests are CI-run VS Code integration tests (`npm test`).

## Phase 1: Setup

- [X] T001 Hover provider registered for file and Document View schemes in src/hoverProvider.ts
- [X] T002 Shared server-backed index (`loadDoorstopIndex`, `getLinkers`, `getUri`) in src/doorstopIndex.ts

## Phase 2: User Story 1 - Upstream link hover (P1)

**Independent test**: hover a linked UID, popup shows header/level/text; links open files.

- [X] T003 [US1] Implement item preview (FR-001), upstream links outside `links:` block (FR-002), clickable `command:vscode.open` links (FR-003) in src/hoverProvider.ts
- [X] T004 [US1] Existing test "Hover on a link UID previews the server's text for that item" in src/test/regressionFixture.test.ts
- [ ] T005 [US1] Add trace comment `Spec 006 FR-001` and `Spec 006 FR-003` (link target = server path) to the test from T004 in src/test/regressionFixture.test.ts
- [ ] T006 [US1] Add test: hovering a UID outside a `links:` block (e.g. a UID in prose/text field of a fixture item with links) shows "Upstream Links:", and hovering inside a `links:` entry omits it; comment `Spec 006 FR-002`, in src/test/regressionFixture.test.ts
- [ ] T007 [US1] Add test: execute the `vscode.open` command from a hover link's encoded args and assert the target file becomes the active editor; comment `Spec 006 FR-003`, in src/test/regressionFixture.test.ts
- [ ] T008 [US1] Add edge-case test: hovering an unknown UID-shaped token yields no hover (no error); comment `Spec 006 FR-001`, in src/test/regressionFixture.test.ts

## Phase 3: User Story 2 - derived: hover (P2)

- [X] T009 [US2] Implement `derived:` reverse-link hover (FR-004) in src/hoverProvider.ts
- [X] T010 [US2] Existing test "Hover on a derived: line lists the items that link to this one" in src/test/regressionFixture.test.ts
- [ ] T011 [US2] Add trace comment `Spec 006 FR-004` to the test from T010 in src/test/regressionFixture.test.ts

## Phase 4: User Story 3 - Tree/editor sync (P2)

- [X] T012 [US3] Implement `syncActiveRequirement` on `onDidChangeActiveTextEditor` in src/extension.ts (FR-005)
- [X] T013 [US3] Existing auto-reveal guard test in src/test/extension.test.ts (covers toggle only, not the reveal itself)
- [ ] T014 [US3] Add test: open a fixture requirement file (via the hover-link `vscode.open` command) and assert the tree view selection/active resource becomes that item (with auto-reveal on); comment `Spec 006 FR-005`, in src/test/extension.test.ts or src/test/regressionFixture.test.ts
- [ ] T015 [US3] Add trace comment `Spec 006 FR-005` to the auto-reveal guard test (T013) in src/test/extension.test.ts

## Phase 5: Polish

- [ ] T016 Verify every FR-001..FR-005 appears in at least one `Spec 006 FR-NNN` comment (`grep -rn "Spec 006 FR-" src/test`) and `npm test` passes
- [ ] T017 [P] Update spec.md Assumptions: lookup now uses the server index (`GET /tree`), not a file-name glob, in specs/006-hover-navigation/spec.md

## Dependencies

T005, T006, T007, T008 -> T016; T007 precedes/feeds T014 (same open mechanism). T011, T015 independent. All test tasks touch the same files, so none marked [P] except T017.

## Strategy

MVP = T005-T008 (US1), then T011, then T014-T015, then T016-T017.
