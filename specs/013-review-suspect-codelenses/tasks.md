---

description: "Task list for feature 013 — Review & Suspect-Link CodeLenses"
---

# Tasks: Review & Suspect-Link CodeLenses

**Input**: Design documents from `/specs/013-review-suspect-codelenses/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/codelens-actions.md](contracts/codelens-actions.md), [quickstart.md](quickstart.md)

**Tests**: Test tasks ARE included. Not because the spec asked for TDD, but because Constitution Principle V makes them mandatory here: the feature makes the server's `parents` filter load-bearing (currently untested), and unlike the diagram features this one is fully automatable through `src/test/regressionFixture.test.ts`, which drives the real Doorstop server against `testdata/regression`. The owed tests are enumerated in [contracts/codelens-actions.md §3](contracts/codelens-actions.md).

**Organization**: Grouped by user story. Note the structural reality: all three stories land in **one new file**, `src/reviewLensProvider.ts`. Phase 2 therefore builds the shared scanner and helpers that all three stories consume; after that checkpoint each story is an independent slice (its own lens emission + its own command + its own tests) and can be built, tested, and shipped on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Exact file paths are included in every task

## Path Conventions

Single VS Code extension at repository root: extension host in `src/`, extension
tests in `src/test/`, Python server in `server/`, fixtures in `testdata/`.
No new top-level directory is introduced.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish a clean baseline and the fixture data the later tests need.

- [ ] T001 Record a green baseline before changing anything: run `npm run compile`, `npm test`, and `python -m pytest tests` from `server/`; note any pre-existing failure so it is not later mistaken for a regression
- [ ] T002 [P] Add a two-link fixture item `testdata/regression/REQ-010.yml` linking to both `REQ-001` and `REQ-002`, mirroring the existing fixture shape (`active`, `derived`, `header`, `level`, `links`, `normative`, `ref`, `reviewed`, `text`); this item is what makes "clear one link, leave the other" observable, so FR-006/SC-003 cannot be distinguished from FR-004 without it
- [ ] T003 [P] Generate real Doorstop stamps for `testdata/regression/REQ-010.yml` by running the server against the fixture, leaving both links **suspect** (`null` stamps) as the starting state for US3 tests

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared provider file, the document scanner, and the two helpers every lens command uses.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete — all three stories emit lenses from the same provider and route their actions through the same helpers.

- [ ] T004 Create `src/reviewLensProvider.ts` with the entity types from [data-model.md](data-model.md) — `RequirementLensScan { uid, reviewedLine?, linksLine?, linkEntries }`, `LinkEntryAnchor { line, parentUid }`, and the three command-argument interfaces `ReviewLensContext`, `ClearAllLensContext`, `ClearOneLensContext` (each carrying `documentUri: string` so handlers locate the document independently of which editor is active) — plus an exported `registerReviewLensProvider(context, options)` mirroring the shape of `registerDeriveProvider` in [deriveProvider.ts:159](../../src/deriveProvider.ts#L159), registering a `CodeLensProvider` for `[{ language: 'yaml' }, { language: 'markdown' }]` that returns `[]` for now
- [ ] T005 Implement `scanRequirementDocument()` in `src/reviewLensProvider.ts` applying the derivation rules from data-model.md verbatim: `uid` = `path.basename(fileName, ext)` for `.yml`/`.md` only, otherwise skip the document entirely (FR-011); `reviewedLine` = "First line matching `/^\s*reviewed\s*:/i` at metadata level"; `linksLine` = "First line matching `/^\s*links\s*:/i`"; `linkEntries` = "Consecutive lines after `linksLine` matching a `- <UID>` sequence-entry shape, stopping at the first line that is not a sequence entry (i.e. the next metadata key)", with `links: []` yielding none; scan region = "Whole document for `.yml`; the `---` frontmatter block only for `.md`" (research.md §6). The function MUST be synchronous and perform **no** network call (research.md §2, SC-005)
- [ ] T006 Implement `ensureSavedOrConfirm(documentUri)` in `src/reviewLensProvider.ts` per research.md §3: if the document is dirty show a **modal** warning naming the consequence ("This requirement has unsaved changes. They must be saved before <action>, because the Doorstop server rewrites the file.") offering `Save and Continue` and Cancel; on confirm `await document.save()` and abort with an error message if the save throws; on cancel return without issuing any request (FR-010)
- [ ] T007 Implement `runLensAction()` in `src/reviewLensProvider.ts` as the single request path for all three commands: issue the call via `options.server.request()`, on success fire `options.onChanged?.()` and show an information message naming the affected item, on failure surface the message from `DoorstopApiError` via `vscode.window.showErrorMessage` and change nothing (FR-009, contracts §1.5) — mirroring the error handling in `registerDoorstopCommands.run()` at [doorstopCommands.ts:110-120](../../src/doorstopCommands.ts#L110-L120)
- [ ] T008 [P] Wire `registerReviewLensProvider` into `src/extension.ts` inside the existing `if (workspaceFolder)` block directly after the `registerDeriveProvider` call at [extension.ts:105](../../src/extension.ts#L105), passing `{ server: doorstopServer, onChanged: () => treeProvider.refresh() }`
- [ ] T009 [P] Add scanner tests in `src/test/reviewLensScan.test.ts` covering the pure `scanRequirementDocument()` contract against the fixture files: `REQ-001.yml` (`links: []`) → `linkEntries` empty; `REQ-007.yml` → one entry with `parentUid === 'REQ-001'`; `REQ-010.yml` → two entries in document order; `.doorstop.yml` → no `uid`, no anchors

**Checkpoint**: Provider registered and scanning; no lenses render yet. User story phases can now proceed — in parallel if staffed, since each adds a distinct lens and a distinct command.

---

## Phase 3: User Story 1 - Mark a requirement as reviewed from the editor (Priority: P1) 🎯 MVP

**Goal**: A "Do Review" lens on the `reviewed:` field that marks exactly that one item reviewed through the server.

**Independent Test**: Open `testdata/regression/REQ-007.yml`, click "Do Review", confirm `reviewed: null` becomes a stamp in the open editor and no other item changed.

### Tests for User Story 1

- [ ] T010 [P] [US1] Integration test in `src/test/regressionFixture.test.ts`: execute `doorstop.doReview` for `REQ-007` against the real server, then assert `GET /tree` reports `reviewed: true` for `REQ-007` and that `REQ-008`'s `reviewed` value is unchanged (FR-002)
- [ ] T011 [P] [US1] Test in `src/test/reviewLensScan.test.ts` that a document with a `reviewed:` line yields exactly one "Do Review" lens and that `.doorstop.yml` yields none (US1 scenario 4, FR-011)

### Implementation for User Story 1

- [ ] T012 [US1] Emit the "Do Review" lens in `src/reviewLensProvider.ts`: when `scan.reviewedLine !== undefined`, push a `vscode.CodeLens` at range `(reviewedLine, 0, reviewedLine, 0)` with title `Do Review` and command `doorstop.doReview`, argument `{ uid, documentUri }` (FR-001, contracts §1.1)
- [ ] T013 [US1] Register the `doorstop.doReview` command in `src/reviewLensProvider.ts`: guard a missing/unusable context with `The requirement UID could not be determined.` and no request (contracts §1.4 precondition 1, which also covers Command Palette invocation with no argument), then `ensureSavedOrConfirm` → `runLensAction` issuing `POST /review` with `{ scope: 'item', target: uid }`
- [ ] T014 [P] [US1] Declare `doorstop.doReview` in `package.json` under `contributes.commands` with title `Doorstop: Do Review`, alongside the existing `doorstop.deriveRequirement` entry

**Checkpoint**: US1 is fully functional and shippable on its own — the derive lens still renders on the same file (FR-012), verifiable by opening any item with a `derived:` field.

---

## Phase 4: User Story 2 - Clear all suspect links on a requirement at once (Priority: P2)

**Goal**: A "Clear All Suspicions" lens above `links:` — shown only when links actually exist — that clears every link on that item.

**Independent Test**: Open `REQ-007.yml`, click "Clear All Suspicions", confirm its link gains a stamp; open `REQ-001.yml` (`links: []`) and confirm no such lens appears.

### Tests for User Story 2

- [ ] T015 [P] [US2] Integration test in `src/test/regressionFixture.test.ts`: execute `doorstop.clearAllSuspicions` for `REQ-007`, then assert `GET /tree` reports `cleared: true` for it and that no other item's link states changed (FR-004)
- [ ] T016 [P] [US2] Lens-visibility test in `src/test/reviewLensScan.test.ts`: `REQ-007.yml` (one link) yields a "Clear All Suspicions" lens anchored at the `links:` line; `REQ-001.yml` (`links: []`) yields **none** (FR-003, US2 scenario 2)

### Implementation for User Story 2

- [ ] T017 [US2] Emit the "Clear All Suspicions" lens in `src/reviewLensProvider.ts`: when `scan.linksLine !== undefined` **and** `scan.linkEntries.length > 0`, push a `vscode.CodeLens` at range `(linksLine, 0, linksLine, 0)` with title `Clear All Suspicions` and command `doorstop.clearAllSuspicions`, argument `{ uid, documentUri }` (FR-003, contracts §1.2)
- [ ] T018 [US2] Register the `doorstop.clearAllSuspicions` command in `src/reviewLensProvider.ts` with the same guard → `ensureSavedOrConfirm` → `runLensAction` sequence, issuing `POST /clear` with `{ scope: 'item', target: uid }` and **no** `parents` field (omitting it is what makes Doorstop clear every link)
- [ ] T019 [P] [US2] Declare `doorstop.clearAllSuspicions` in `package.json` under `contributes.commands` with title `Doorstop: Clear All Suspicions`

**Checkpoint**: US1 and US2 both work independently.

---

## Phase 5: User Story 3 - Clear the suspicion on one specific link (Priority: P3)

**Goal**: A "Clear the Suspicion" lens on each individual link entry that clears only that link.

**Independent Test**: Open the two-link fixture `REQ-010.yml`, click "Clear the Suspicion" on the first link only, confirm the first entry gains a stamp while the second still reads `null`.

### Tests for User Story 3

- [ ] T020 [P] [US3] Add the missing positive server test in `server/tests/test_review.py`: create an item linked to two parents, `POST /clear` with `{"scope": "item", "target": child, "parents": [parentA]}`, assert via `GET /tree` that parentA's link is no longer suspect and **parentB's still is** — the selective-clear behaviour this story depends on and which the suite does not currently cover (research.md §1)
- [ ] T021 [P] [US3] Integration test in `src/test/regressionFixture.test.ts`: execute `doorstop.clearSuspicion` for `REQ-010` with `parentUid` `REQ-001`, then assert `GET /tree` shows `suspect: false` for the `REQ-001` link and `suspect: true` for the `REQ-002` link (FR-006, SC-003)
- [ ] T022 [P] [US3] Dangling-parent test in `src/test/regressionFixture.test.ts`: execute `doorstop.clearSuspicion` for `REQ-009` (links to nonexistent `REQ-999`), assert the server's 400 `DOORSTOP_ERROR` surfaces as an error and the file is unchanged (US3 scenario 3)
- [ ] T023 [P] [US3] Lens-count test in `src/test/reviewLensScan.test.ts`: `REQ-010.yml` yields exactly two "Clear the Suspicion" lenses, on the two link-entry lines, carrying `parentUid` `REQ-001` and `REQ-002` respectively (FR-005)

### Implementation for User Story 3

- [ ] T024 [US3] Emit one "Clear the Suspicion" lens per link entry in `src/reviewLensProvider.ts`: for each `entry` in `scan.linkEntries`, push a `vscode.CodeLens` at range `(entry.line, 0, entry.line, 0)` with title `Clear the Suspicion` and command `doorstop.clearSuspicion`, argument `{ uid, parentUid: entry.parentUid, documentUri }` (FR-005, contracts §1.3)
- [ ] T025 [US3] Register the `doorstop.clearSuspicion` command in `src/reviewLensProvider.ts` with the same guard → `ensureSavedOrConfirm` → `runLensAction` sequence, issuing `POST /clear` with `{ scope: 'item', target: uid, parents: [parentUid] }`; treat `parentUid` as untrusted text and let the server reject unknown UIDs rather than pre-validating client-side (research.md §2, data-model.md invariant 4)
- [ ] T026 [P] [US3] Declare `doorstop.clearSuspicion` in `package.json` under `contributes.commands` with title `Doorstop: Clear the Suspicion`

**Checkpoint**: All three user stories are independently functional.

---

## Phase 6: Derive CodeLens Remediation (Constitution Compliance)

**Purpose**: Fix the Principle I/II violation the planning audit found in the existing derive lens (research.md §5). Independent of US1–US3 — touches only `deriveProvider.ts` and can proceed in parallel with any story phase.

**Behavioural contract**: `doorstop.deriveRequirement` keeps its command ID, both accepted argument shapes, and its user-visible behaviour. Only its data source changes.

- [ ] T027 Add a `GET /tree`-backed document lookup to `src/deriveProvider.ts` following the pattern (and explanatory comment style) of `buildItemIndex()` in [definitionProvider.ts:30-57](../../src/definitionProvider.ts#L30-L57), reading `prefix`, `markerPath`, and `parentPrefix` from the existing `TreeResponse` type in `src/doorstopTypes.ts`
- [ ] T028 Replace `getSourceDocumentPrefix()` in [deriveProvider.ts:111-119](../../src/deriveProvider.ts#L111-L119) with a lookup of the source UID in the `GET /tree` payload — the document whose `items[]` contains that UID — instead of today's longest-matching-directory guess
- [ ] T029 Rework `getSameLevelAndBelowPrefixes()` in [deriveProvider.ts:121-148](../../src/deriveProvider.ts#L121-L148) to consume server-reported `parentPrefix` edges rather than client-parsed ones; the depth walk itself stays, since "same level and below" is this extension's own UX policy for which targets to offer, not a Doorstop concept (research.md §5)
- [ ] T030 Delete `findPrefix()`, `findParent()` ([deriveProvider.ts:37-87](../../src/deriveProvider.ts#L37-L87)), `getDocuments()` ([deriveProvider.ts:89-109](../../src/deriveProvider.ts#L89-L109)), the `DoorstopDocument` interface, and the now-unused `js-yaml` import from `src/deriveProvider.ts`; drop the `workspaceFolder` option if nothing else in the file uses it
- [ ] T031 Replace the swallowed failure path in `src/deriveProvider.ts` — today an unreadable marker is absorbed by a bare `catch {}` and silently shortens the target list — with an explicit error message when the `GET /tree` fetch fails (Principle III, research.md §5)
- [ ] T032 [P] Add a derive regression test in `src/test/regressionFixture.test.ts`: from `ARCH-001` (in the child `ARCH` document), assert the offered target prefixes match what the pre-change implementation offered for the same fixture, so the remediation is provably behaviour-preserving
- [ ] T033 [P] Verify the audit's pass condition: `grep -n "js-yaml\|findFiles" src/deriveProvider.ts` returns nothing (quickstart Scenario 5, step 6)

**Checkpoint**: The derive lens now sources all data from the server; the repo has one consistent precedent for how a CodeLens provider gets its data.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T034 [P] Close the markdown-format risk from research.md §6: add an `itemformat: markdown` document to `testdata/regression` with at least one item carrying `reviewed:` and `links:` in YAML frontmatter — **no markdown-format item exists in the fixture today**, so the `.md` scan path is otherwise unverified
- [ ] T035 Add a frontmatter-scoping test in `src/test/reviewLensScan.test.ts` proving a `links:` line in Markdown **prose body** produces no lenses while the frontmatter one does
- [ ] T036 [P] Update `CHANGELOG.md` with the three new lenses and the derive data-source change
- [ ] T037 [P] Update `README.md` where the existing "+ Derive Requirement" CodeLens is documented, so all four lenses are described together
- [ ] T038 Run the full quickstart validation in the Extension Development Host: all five scenarios in [quickstart.md](quickstart.md), including the dirty-editor modal (Scenario 4) and the server-down error path (Scenario 1), which are not covered by automated tests
- [ ] T039 Run the complete gate set green: `npm run compile` (type-check + lint + bundle), `npm test`, and `python -m pytest tests` from `server/` (Constitution Principle V, Development Workflow)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS all user stories**
- **User Stories (Phases 3–5)**: All depend on Phase 2 only; independent of one another
- **Derive Remediation (Phase 6)**: Depends on nothing in this feature — can run any time after Setup, including in parallel with Phase 2
- **Polish (Phase 7)**: Depends on the desired user stories being complete; T039 last

### Within Each User Story

Tests are listed before implementation and should be written first and observed
to fail. Within implementation, lens emission (T012/T017/T024) comes before its
command registration only for readability — the two land in the same file and
are naturally done together. The `package.json` declaration is independent of
both.

### Critical Path

`T001 → T004 → T005 → T006/T007 → T012/T013 (US1 MVP)`

Everything else branches off that spine.

### Parallel Opportunities

- **Setup**: T002 and T003 are sequential with each other (T003 stamps what T002 creates) but parallel to T001
- **Foundational**: T004 → T005 → T006 → T007 are sequential (one file); T008 and T009 are parallel to each other once T005 lands
- **Across stories**: after the Phase 2 checkpoint, US1, US2, and US3 can be built by three people simultaneously — each adds a separate lens block and a separate command registration; only the shared file's merge is coordination overhead
- **Phase 6** is fully parallel to Phases 2–5 (different file, different concern)
- **Within a story**: all test tasks are `[P]` with each other, and the `package.json` task is `[P]` with the implementation tasks

### Same-File Coordination Note

`src/reviewLensProvider.ts` is touched by T004–T007, T012, T013, T017, T018,
T024, T025. If stories are worked in parallel, keep each story's lens block and
command registration in clearly separated sections of the file to minimise
conflicts. This is the one place where "independently testable" does not mean
"independently editable".

---

## Parallel Example: User Story 3

```bash
# All four US3 tests can be written together (four different files/concerns):
Task: "Positive selective-clear test in server/tests/test_review.py"
Task: "Two-link integration test in src/test/regressionFixture.test.ts"
Task: "Dangling-parent test in src/test/regressionFixture.test.ts"
Task: "Lens-count test in src/test/reviewLensScan.test.ts"

# Then implementation, where only the package.json task is parallel:
Task: "Declare doorstop.clearSuspicion in package.json"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1: Setup (T001–T003)
2. Phase 2: Foundational (T004–T009) — **blocks everything**
3. Phase 3: User Story 1 (T010–T014)
4. **STOP and VALIDATE**: quickstart Scenario 1, including the negative and
   server-down checks
5. Shippable: "Do Review" works from the editor, derive lens unaffected

### Incremental Delivery

1. Setup + Foundational → provider registered and scanning
2. US1 → validate → ship (MVP)
3. US2 → validate → ship
4. US3 → validate → ship (this is the increment that needs the T002 fixture and
   the T020 server test)
5. Phase 6 remediation → ship independently, any time
6. Phase 7 polish → close the markdown risk, docs, full gates

### Scope Notes

- **No server source changes.** Phase 5's only server task (T020) adds a test
  for behaviour that already exists.
- **Two tasks go beyond the spec's FRs** and are deliberate: T002/T003 (fixture)
  and T020 (server test), both required to make FR-006 provable.
- **Phase 6 is the extra scope** requested during planning ("check the derive
  CodeLens sticks to the server"). It can be dropped from this feature without
  affecting US1–US3, but the violation then stays in the codebase alongside a
  new, correct precedent.

---

## Notes

- `[P]` = different files, no dependencies on incomplete tasks
- The extension must never write requirement files; every state change goes
  through the server (data-model.md invariant 1)
- `provideCodeLenses` must stay synchronous and network-free (invariant 3) —
  this is what keeps lenses rendering while the server is down or booting
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently
