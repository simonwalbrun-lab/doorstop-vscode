---

description: "Task list for Doorstop Regression Test Model"
---

# Tasks: Doorstop Regression Test Model

**Input**: Design documents from `/specs/012-doorstop-test-model/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: No separate TDD test-writing phase is included — this feature's User Story 3 *is* an automated test suite, so its tasks build that suite directly as product deliverable rather than as tests-before-implementation scaffolding.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Single project (existing VS Code extension + Python server monorepo). New paths this feature adds: `testdata/regression/` (fixture), `src/test/regressionFixture.test.ts` (automated suite), `.vscode-test.mjs` and `.github/workflows/ci.yml` (modified).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare the fixture directory skeleton and packaging exclusion before any document/item content is added.

- [X] T001 Create the fixture directory skeleton: `testdata/regression/`, `testdata/regression/children/ARCH/`, `testdata/regression/children/EMPTY/` (empty directories, per plan.md's Project Structure)
- [X] T002 [P] Add `testdata/**` to `.vscodeignore` so the fixture is excluded from the packaged `.vsix`, per contracts/fixture-layout.md invariant 4

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Make `testdata/regression` a valid, server-loadable, multi-document Doorstop project. No item-level or story-specific work can begin until this exists.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Create the root document marker `testdata/regression/.doorstop.yml` with prefix `REQ` and no parent, making `testdata/regression` server-loadable per FR-001
- [X] T004 [P] Create the child document marker `testdata/regression/children/ARCH/.doorstop.yml` with prefix `ARCH` and `parent: REQ`, establishing the multi-level hierarchy per FR-001

**Checkpoint**: `testdata/regression` is a valid, empty, two-document Doorstop project — item-level work for each story can now begin.

---

## Phase 3: User Story 1 - Run a full manual regression pass before release (Priority: P1) 🎯 MVP

**Goal**: Populate the fixture's baseline ("happy path") items, a persisted diagram, and a regression checklist covering every shipped feature area at a basic level.

**Independent Test**: Open `testdata/regression` in VS Code, follow `CHECKLIST.md`'s non-edge-case rows top to bottom, and confirm each completes with its documented expected outcome.

### Implementation for User Story 1

- [X] T005 [P] [US1] Create `testdata/regression/REQ-001.yml`: plain baseline item with no outgoing links, serving as the upstream target for other items (per data-model.md's Item table)
- [X] T006 [P] [US1] Create `testdata/regression/REQ-002.yml`: item whose `text` is a single short line (minimal-text case, FR-006)
- [X] T007 [P] [US1] Create `testdata/regression/REQ-003.yml`: item whose `text` spans several paragraphs (long-text case, FR-006)
- [X] T008 [P] [US1] Create `testdata/regression/REQ-004.yml`: item with `header` set (heading-display coverage, FR-002)
- [X] T009 [P] [US1] Create `testdata/regression/REQ-005.yml`: item with `reviewed: false` (pending-review case, FR-002)
- [X] T010 [P] [US1] Create `testdata/regression/REQ-006.yml`: item with `reviewed: true` (already-reviewed case, FR-002)
- [X] T011 [US1] Create `testdata/regression/REQ-008.yml`: item with `reviewed: true` whose link is already marked `cleared: true` (cleared-suspect case, FR-002); depends on T003
- [X] T012 [US1] Create `testdata/regression/children/ARCH/ARCH-001.yml`: `derived: true`, `links: [REQ-001]` (derived-link case, FR-002); depends on T004, T005
- [X] T013 [US1] Create the persisted diagram fixture `testdata/regression/diagram.doorstop.json`, referencing `REQ-001`, `REQ-004`, and `ARCH-001` with at least one persisted edge, following the `007-diagram-core` diagram file schema (FR-007); depends on T005, T008, T012
- [X] T014 [US1] Create `testdata/regression/CHECKLIST.md`: a Prerequisites section (Doorstop/Python available, workspace opened at `testdata/regression`) followed by one row per non-edge-case shipped feature area (server connection & lifecycle, explorer & commands panel, item lifecycle commands, document utilities, CodeLens & autocompletion, hover & navigation, diagram core, diagram interaction, go-to-definition & usage navigation, treeview auto-reveal toggle), each row naming the specific fixture item/document to use and the expected observable outcome (FR-008, FR-009); depends on T005-T013

**Checkpoint**: User Story 1 is fully functional and independently testable — a maintainer can complete a full happy-path regression pass using only the fixture and checklist.

---

## Phase 4: User Story 2 - Verify edge-case and non-happy-path behavior (Priority: P2)

**Goal**: Add the fixture's deliberate edge cases (empty document, suspect link, dangling link) and extend the checklist to cover them.

**Independent Test**: Point the explorer tree, hover preview, diagram suspect-link indicator, and review/clear-suspect commands at `EMPTY`, `REQ-007`, and `REQ-009` respectively, and confirm each produces the documented non-crashing, clearly-indicated behavior.

### Implementation for User Story 2

- [X] T015 [P] [US2] Create the empty child document marker `testdata/regression/children/EMPTY/.doorstop.yml` with prefix `EMPTY` and `parent: REQ`, with zero item files alongside it (empty-document case, FR-005); depends on T003
- [X] T016 [US2] Create `testdata/regression/REQ-007.yml` linking to `REQ-001`, authored so the link recomputes as suspect against `REQ-001`'s checked-in content (suspect-link case, FR-003); depends on T005
- [X] T017 [US2] Create `testdata/regression/REQ-009.yml` with `links: [REQ-999]`, where `REQ-999` does not exist anywhere in the fixture (dangling-link case, FR-004); depends on T003
- [X] T018 [US2] Extend `testdata/regression/CHECKLIST.md` with rows for the empty document, the suspect link, and the dangling link, each naming its fixture element and expected outcome (FR-008); depends on T014, T015, T016, T017

**Checkpoint**: User Stories 1 and 2 together give full manual regression coverage, including edge cases — `contracts/fixture-layout.md`'s "no dangling reference except the one deliberate case" invariant now holds.

---

## Phase 5: User Story 3 - Catch regressions automatically on every change (Priority: P2)

**Goal**: An automated integration test suite that exercises the fixture through the real Doorstop server and runs automatically in CI on every push/PR.

**Independent Test**: Push a change that deliberately breaks one shipped feature, open a pull request, and confirm the new CI job runs the suite and reports a clear failure without any manual step.

### Implementation for User Story 3

- [X] T019 [US3] Add a second `@vscode/test-cli` project/config in `.vscode-test.mjs` whose `workspaceFolder` is `testdata/regression`, leaving the existing (workspace-less) suite's config untouched, per plan.md's Project Structure
- [X] T020 [US3] Create `src/test/regressionFixture.test.ts`: import `DoorstopServer` directly, resolve a `python3`/`python` interpreter from `PATH`, call `.start('testdata/regression', pythonPath)` in a `suiteSetup` hook and stop/dispose it in `suiteTeardown` — bypassing `getActivePythonPath()`/`ms-python.python` per research.md §2-3; depends on T005-T017
- [X] T021 [US3] In `src/test/regressionFixture.test.ts`, add one Mocha `test()` per automated-covered feature area: explorer tree loads all three documents (`REQ`, `ARCH`, `EMPTY`), an item lifecycle command succeeds against `REQ-001`, hover/go-to-definition reports `REQ-009`'s link to `REQ-999` as broken, and review/clear-suspect resolves `REQ-007`'s suspect state — each asserting against the real server's response and restoring any fixture file it mutates before the test ends (FR-012, contracts/fixture-layout.md invariant 2); depends on T020
- [X] T022 [US3] Update `testdata/regression/CHECKLIST.md`'s "Automated coverage" column to mark which rows T021's tests cover, per data-model.md's Regression Checklist structure; depends on T018, T021
- [X] T023 [US3] Add the `extension-integration-tests` job to `.github/workflows/ci.yml` per contracts/ci-integration-job.md: checkout, setup-node, setup-python, `pip install -e .[dev]` under `server/`, `npm ci`, `xvfb-run -a npm test`; runs in parallel with `server-tests`/`extension-build`, no `continue-on-error`; depends on T019, T020, T021

**Checkpoint**: All three user stories are functional — a regression in any covered feature area is now caught automatically on every push/PR (SC-006).

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate the whole feature end-to-end against the spec's success criteria.

- [ ] T024 [P] Run `npm run compile` (check-types + lint + build) and confirm it passes with `src/test/regressionFixture.test.ts` and the `.vscode-test.mjs` change in place, per Constitution Principle V
- [ ] T025 Run quickstart.md's four scenarios end-to-end (manual pass, edge-case spot check, local `npm test`, and a deliberate local regression to confirm T021's tests actually fail), fixing any discrepancy found
- [ ] T026 [P] Review `testdata/regression/CHECKLIST.md` against spec.md's SC-001-SC-006 (30-minute full pass, 100% feature-area coverage, 2-minute item lookup, no extra setup, 5-minute restore, automated-catch) and adjust wording/structure until each holds

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001) - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational (T003, T004) completion
- **User Story 2 (Phase 4)**: Depends on Foundational (T003) completion; T018 also depends on US1's T014 (extends the same checklist file)
- **User Story 3 (Phase 5)**: Depends on all fixture items existing (T005-T017, i.e., both US1 and US2 complete) and on US1's checklist (T022 depends on T018)
- **Polish (Phase 6)**: Depends on all three user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: No dependency on other stories - independently testable once Foundational is done
- **User Story 2 (P2)**: Independently testable once Foundational is done; only its checklist task (T018) touches a file US1 also touches (CHECKLIST.md), and that's an append, not a rewrite
- **User Story 3 (P2)**: Depends on both US1 and US2's fixture content existing, since the automated suite exercises the full fixture (baseline and edge-case items alike) - cannot be meaningfully started before US1 and US2's item files exist

### Within Each User Story

- Item files with no cross-links (T005-T010, T015) can be created in any order / in parallel
- Items that link to another fixture item (T011, T012, T016, T017) depend on their link target existing first
- The diagram fixture (T013) and checklist (T014, T018, T022) depend on the items they reference already existing
- CI wiring (T023) depends on the test file and config it invokes (T019, T020, T021) already existing

### Parallel Opportunities

- T001 and T002 (Setup) - different files
- T004 (Foundational) can run alongside T003 - different marker files (`children/ARCH/.doorstop.yml` vs. the root `.doorstop.yml`), and T004 only needs T001's directory skeleton, not T003's content
- T005-T010 (US1 baseline items) - six different files, no inter-item links, fully parallel
- T015 (US2 empty-doc marker) can run in parallel with any US1 task once Foundational is done - different files, no shared dependency
- T024 and T026 (Polish) - different concerns, different files

---

## Parallel Example: User Story 1

```bash
# Launch the independent baseline item files together:
Task: "Create testdata/regression/REQ-001.yml: plain baseline item, no links"
Task: "Create testdata/regression/REQ-002.yml: minimal single-line text"
Task: "Create testdata/regression/REQ-003.yml: long multi-paragraph text"
Task: "Create testdata/regression/REQ-004.yml: item with header set"
Task: "Create testdata/regression/REQ-005.yml: reviewed: false"
Task: "Create testdata/regression/REQ-006.yml: reviewed: true"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Follow `CHECKLIST.md`'s baseline rows against a real workspace and confirm every one passes
5. This alone already satisfies the original ask ("test all features at least at a basic level")

### Incremental Delivery

1. Complete Setup + Foundational → fixture project exists and loads
2. Add User Story 1 → validate independently → maintainers can run a full manual regression pass (MVP!)
3. Add User Story 2 → validate independently → edge cases are now covered too
4. Add User Story 3 → validate independently → the same coverage now runs automatically on every push/PR
5. Add Polish → confirm every Success Criterion in spec.md actually holds

### Parallel Team Strategy

With multiple contributors:

1. Team completes Setup + Foundational together (fast, four tasks)
2. Once Foundational is done:
   - Contributor A: User Story 1's item files (T005-T010, parallel) then diagram/checklist (T011-T014, sequential)
   - Contributor B: User Story 2's item files (T015-T017, parallel) then checklist extension (T018, waits on both A's T014 and B's own items)
3. Once both are merged, one contributor picks up User Story 3 (T019-T023), since it needs the full fixture from both prior stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Every fixture item task names the exact data-model.md state it fulfills and the FR it satisfies, so no task is guesswork
- Verify T021's tests actually fail on a deliberately broken feature before trusting them to catch a real regression (T025)
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently
- Avoid: vague fixture item content, CHECKLIST.md rewrite conflicts between US1/US2 (append, don't restructure), cross-story dependencies that would block US1 or US2 from shipping alone
