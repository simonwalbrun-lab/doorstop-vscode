---

description: "Task list for feature 005 — Derive CodeLens & Link Autocompletion (retroactive)"
---

# Tasks: Editor Integration — Derive CodeLens & Link Autocompletion

**Input**: Design documents from `/specs/005-codelens-autocompletion/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/derive-and-completion.md](contracts/derive-and-completion.md), [quickstart.md](quickstart.md)

**Tests**: Required. Constitution v1.4.0 Principle VIII: every FR needs an automated CI-run test whose body carries a trace comment `// Spec 005 FR-NNN`. Implementation already exists and is marked [X]; open tasks are test coverage and trace comments only. Do not change production code.

## Format: `[ID] [P?] [Story] Description`

- Tests live in `src/test/` and run against the real server and `testdata/regression` (Doorstop is never mocked; UI prompts may be patched as `regressionFixture.test.ts` does for `showQuickPick`).

---

## Phase 1: Setup

- [X] T001 Baseline: `npm run compile`, `npm run check-types`, `npm run lint`, `npm test` pass on the current tree (implementation exists).

## Phase 2: Foundational

None. Both stories are implemented and independent.

---

## Phase 3: User Story 1 - Derive a requirement from the CodeLens (P1)

**Goal**: One action creates a linked child and opens it.

**Independent Test**: Run the derive command for a fixture item with a patched quick pick; the new item exists, links to the source, and is the active editor.

### Implementation (already present)

- [X] T002 [US1] FR-001 CodeLens `+ Derive Requirement` on `derived:` lines in `src/deriveProvider.ts` (`provideCodeLenses`)
- [X] T003 [US1] FR-002 shared command `doorstop.deriveRequirement` accepting lens context or `RequirementTreeItem` (`resolveDeriveContext`), menu entry in `package.json`
- [X] T004 [US1] FR-003 target list from `GET /tree` via `buildDeriveTargets` / `getDeriveTargets` (wider than "valid children" by design, see plan.md)
- [X] T005 [US1] FR-004 link back via `POST /items/{uid}/links` in `src/deriveProvider.ts`
- [X] T006 [US1] FR-005 open new item with `showTextDocument` in `src/deriveProvider.ts`
- [X] T007 [US1] Error handling (server unreachable, unknown source document, no targets, create/link failure) in `src/deriveProvider.ts`

### Existing tests (done)

- [X] T008 [P] [US1] Kinship/target unit tests in `src/test/extension.test.ts` ("Derive Target Kinship")
- [X] T009 [P] [US1] Server-backed target test "Derive: target documents come from the server..." in `src/test/regressionFixture.test.ts`
- [X] T010 [P] [US1] Lens presence test "the Derive Requirement lens is unaffected..." and marker-file test in `src/test/reviewLensScan.test.ts`

### Open: traceability and missing FR tests

- [ ] T011 [P] [US1] Add trace comment `// Spec 005 FR-001` to the derive-lens tests in `src/test/reviewLensScan.test.ts` (T010) and add a negative assertion: a `.yml` item without a `derived:` line gets no derive lens
- [ ] T012 [P] [US1] Add trace comment `// Spec 005 FR-003` to the tests in `src/test/extension.test.ts` (T008) and `src/test/regressionFixture.test.ts` (T009)
- [ ] T013 [US1] FR-002 test in `src/test/regressionFixture.test.ts`: assert `package.json` contributes `doorstop.deriveRequirement` under `view/item/context` for `viewItem == doorstop.item` (or extend `src/test/packageMenus.test.ts`), and that executing the command with a `RequirementTreeItem`-shaped argument and with a lens-style `{sourceUid, sourceUri}` argument offers the same quick-pick items. Trace comment `// Spec 005 FR-002`
- [ ] T014 [US1] FR-004 and FR-005 end-to-end test in `src/test/regressionFixture.test.ts`: patch `vscode.window.showQuickPick` (restore in `finally`, as the publish test ~line 648 does), run `doorstop.deriveRequirement` with `{sourceUid: 'REQ-001', sourceUri}`, choose a target; assert via `GET /tree` that the new item exists in that document and links to REQ-001 without a manual link step (FR-004), and that `vscode.window.activeTextEditor` shows the new item's file (FR-005). Delete the created item/file afterwards so other tests see an unchanged fixture. Trace comments `// Spec 005 FR-004` and `// Spec 005 FR-005`

**Checkpoint**: FR-001..FR-005 each traced to a passing test.

---

## Phase 4: User Story 2 - Autocomplete links (P2)

**Goal**: UID suggestions with titles inside `links:` only, recent first.

**Independent Test**: Request completions at positions inside and outside a `links:` block.

### Implementation (already present)

- [X] T015 [US2] FR-006 `links:` block detection and replacement range (`isInLinksBlock`, `getReplacementRange`) in `src/completionProvider.ts`, including Markdown frontmatter-only
- [X] T016 [US2] FR-007 label `UID - title` using `getItemTitle` from `src/doorstopIndex.ts`
- [X] T017 [US2] FR-008 `recentlyViewedUids` + `recordViewedRequirement` (wired in `src/extension.ts`) and `sortText` ranking

### Existing tests (done)

- [X] T018 [US2] "Link completion offers exactly the items the server knows" in `src/test/regressionFixture.test.ts` (inside-block, YAML only)

### Open: traceability and missing FR tests

- [ ] T019 [US2] Add trace comment `// Spec 005 FR-006` to T018 and extend it (or add a sibling test): no UID completions when the cursor is outside `links:` (e.g. `header: x\n  - `), and completions appear inside a Markdown document's frontmatter `links:` but not in its prose body, using untitled documents via `vscode.executeCompletionItemProvider`
- [ ] T020 [P] [US2] FR-007 test in `src/test/regressionFixture.test.ts`: every completion label equals `` `${uid} - ${title}` `` for the fixture item whose title is known (e.g. REQ-001); trace comment `// Spec 005 FR-007`
- [ ] T021 [P] [US2] FR-008 test in `src/test/regressionFixture.test.ts`: call `recordViewedRequirement(vscode.Uri.file(<fixture>/REQ-005.yml))`, request completions, assert REQ-005 sorts first by `sortText`, then record another UID and assert it now precedes REQ-005; trace comment `// Spec 005 FR-008`. (Module state persists across tests; record in a way that does not break T018.)

**Checkpoint**: FR-006..FR-008 traced to passing tests.

---

## Phase 5: Polish

- [ ] T022 Run `npm run check-types`, `npm run lint`, `npm test`; confirm `grep -rn "Spec 005 FR-00" src/test` shows all eight FRs (001..008)
- [ ] T023 Walk through [quickstart.md](quickstart.md) manually once

---

## Dependencies and Execution Order

- Phase 3 and Phase 4 are independent; T011, T012, T020, T021 are parallel (different tests/files or independent blocks).
- T013 and T014 and T019 edit `src/test/regressionFixture.test.ts` (and possibly `packageMenus.test.ts`): sequence them to avoid edit conflicts.
- T022 after all test tasks.

## Implementation Strategy

All production code is done. MVP: T011-T014 (US1 coverage), then T019-T021, then T022-T023.

## Summary

23 tasks: 14 done ([X]), 9 open. Setup 1 done; US1 13 (9 done, 4 open: T011-T014); US2 7 (4 done, 3 open: T019-T021); Polish 2 open (T022-T023).
