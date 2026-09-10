---

description: "Task list for Doorstop Validation Problems In-Item"
---

# Tasks: Doorstop Validation Problems In-Item

**Input**: Design documents from `/specs/014-doorstop-validation-diagnostics/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/validation-api.md](contracts/validation-api.md)

**Tests**: Test tasks ARE included. Constitution Principle V requires pytest coverage for server changes touching validation and error-response shape, and [contracts/validation-api.md §1](contracts/validation-api.md) names five behavioural guarantees as tests. This is not optional for this feature.

**Organization**: Tasks are grouped by user story so each story can be implemented, tested and demoed independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Exact file paths are included in every task

## Path Conventions

Existing repo layout: Python server under `server/src/doorstop_server/`, its tests under `server/tests/`; VS Code extension under `src/`, its tests under `src/test/`.

---

## ⚠️ Read before starting

Two findings from [research.md](research.md) govern this whole feature:

1. **Doorstop's validation writes to disk with its shipped defaults.** A plain `document.get_issues()` pass modified 7 of 9 files in `testdata/regression` and silently stamped away the suspect link instead of reporting it. T005 is the guard and T009 is its regression test — **do these before anything else touches validation**.
2. **Three checks in spec.md do not exist in Doorstop 3.2** (self-link, link cycle, child-link-inactive) and are deliberately not implemented. T013 reserves their ids only. Do not implement them; doing so violates Constitution Principle II.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Type definitions and command registration that every later phase depends on

- [ ] T001 [P] Add `ValidationIssue` and `ValidationResponse` pydantic models to `server/src/doorstop_server/schemas.py`, matching [data-model.md §2–3](data-model.md): `severity: Literal["error","warning","info"]`, `check: str`, `message: str`, `documentPrefix: str`, `uids: List[str]`, `relatedUid: Optional[str] = None`, `field: Optional[Literal["document","level","text","reviewed","links","link_entry","derived","ref"]] = None`; `ValidationResponse` holds `issues: List[ValidationIssue]`
- [ ] T002 [P] Add matching `ValidationIssue` / `ValidationResponse` / `FieldAnchor` TypeScript interfaces to `src/doorstopTypes.ts`, mirroring T001 field-for-field (`relatedUid: string | null`, `field: FieldAnchor | null`)
- [ ] T003 [P] Register the `doorstop.recheckProblems` command with title `Doorstop: Re-check Problems` in `package.json` under `contributes.commands`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The read-only guarantee, the classification core, the endpoint, and one-shot diagnostic rendering — everything a single check needs in order to reach the screen

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Create `server/src/doorstop_server/validation_rules.py` with the module skeleton: the check-table container, the classification entry point `classify(issue, document_prefix)`, and the public `collect_issues(tree)` generator
- [ ] T005 Implement the read-only settings context manager in `server/src/doorstop_server/validation_rules.py`: force `settings.REFORMAT = False`, `settings.REORDER = False`, `settings.REVIEW_NEW_ITEMS = False`, `settings.STAMP_NEW_LINKS = False` and restore the prior values in a `finally` block — see [research.md §1](research.md); without this the endpoint corrupts the repository and hides suspect-link warnings
- [ ] T006 Implement severity classification in `server/src/doorstop_server/validation_rules.py`, testing **`DoorstopInfo` first, then `DoorstopWarning`, then `DoorstopError`** — per [data-model.md §1](data-model.md), `DoorstopWarning` and `DoorstopInfo` both subclass `DoorstopError`, so the reverse order classifies everything as an error
- [ ] T007 Implement per-document iteration and item attribution in `server/src/doorstop_server/validation_rules.py`: loop `for document in tree:`, call `document.get_issues()`, split each message on the **first** `": "`, and route to an item when the left token resolves to a UID in that document, else treat it as document-level with empty `uids` — see [research.md §3](research.md)
- [ ] T008 Implement `GET /validate` in a new `server/src/doorstop_server/routers/validation.py` returning `ValidationResponse`, and register it with `app.include_router(validation.router)` in `server/src/doorstop_server/app.py`
- [ ] T009 Write the no-write regression test in `server/tests/test_validation.py`: build a real temporary Doorstop project containing an unreviewed item and an unstamped link, hash every file under the project root, call `GET /validate`, re-hash, assert byte-identical — this is guarantee 1 of [contracts/validation-api.md §1](contracts/validation-api.md) and the regression test for [research.md §1](research.md)
- [ ] T010 Write the fallback tests in `server/tests/test_validation.py`: an unrecognised message is returned as `check: "unknown"` with `field: null` at Doorstop's own severity and is never filtered out (FR-011, SC-007), and no returned `message` begins with `"<UID>: "` (guarantee 4)
- [ ] T011 Create `src/problemsProvider.ts` with `registerProblemsProvider(context, {server, workspaceFolder})`: own one `vscode.languages.createDiagnosticCollection('doorstop')`, fetch `GET /validate` and `GET /tree`, and render once when the server reports ready
- [ ] T012 Implement severity and identity mapping in `src/problemsProvider.ts` per [contracts/validation-api.md §3](contracts/validation-api.md): `error`→`DiagnosticSeverity.Error`, `warning`→`DiagnosticSeverity.Warning`, `info`→`DiagnosticSeverity.Information`, with `source: "doorstop"` and `code: <check>` on every diagnostic
- [ ] T013 Add the check-id table to `server/src/doorstop_server/validation_rules.py` covering every row of [contracts/validation-api.md §2](contracts/validation-api.md) as an ordered pattern list, including the §2d **reserved** ids `linked_to_self`, `link_cycle`, `child_link_inactive` as table entries with no matching pattern — reserved only, they must not be emitted by any code
- [ ] T014 Implement generic anchor resolution in `src/problemsProvider.ts` per [data-model.md §4](data-model.md) resolution steps 4 and 5: match a field key with `/^\s*<key>\s*:/i`, search inside the `---` frontmatter fences for markdown items, split file text on `/\r?\n/` (CRLF on Windows), and fall back to the item's first line when the field line is absent; read files with `vscode.workspace.fs` as [definitionProvider.ts:58-71](../../src/definitionProvider.ts#L58-L71) does, caching reads per refresh pass
- [ ] T015 Implement the fan-out loop in `src/problemsProvider.ts`: emit one `vscode.Diagnostic` per entry in `issue.uids`, carrying identical `message` and `severity` on each (FR-005, SC-004)
- [ ] T016 Register the provider in `src/extension.ts` inside the existing `if (workspaceFolder)` block, next to `registerDefinitionProvider`, passing the shared `doorstopServer` instance

**Checkpoint**: `GET /validate` returns classified, read-only issue records and the extension renders them at item granularity. User story phases can now begin.

---

## Phase 3: User Story 1 - Broken links reported as errors (Priority: P1) 🎯 MVP

**Goal**: Every link Doorstop considers broken — unknown identifier, inactive parent, unresolvable external reference — appears as a red error on the exact link entry or reference field.

**Independent Test**: Open `testdata/regression/REQ-009.yml`; an error reading `linked to unknown item: REQ-999` sits on the `- REQ-999` link entry line and appears in the Problems panel; the item's other link entries carry nothing.

### Tests for User Story 1

- [ ] T017 [P] [US1] Add server tests to `server/tests/test_validation.py` for the three error checks against a real temporary project: `linked to unknown item`, `invalid UID in links`, and `external reference not found` — asserting `severity: "error"`, the expected `check`, and `relatedUid` set to the offending link UID
- [ ] T018 [P] [US1] Add a server test to `server/tests/test_validation.py` proving an **inactive parent link** is reported as `linked_to_unknown_item` at error severity — per [research.md §2b](research.md) this is how the spec's "parent link is an inactive item ⇒ ERROR" is satisfied; assert no severity override exists
- [ ] T019 [P] [US1] Add an extension test to `src/test/regressionFixture.test.ts` asserting a `DiagnosticSeverity.Error` diagnostic on `REQ-009.yml` at the line containing `REQ-999`, and none on its other link lines (SC-003)

### Implementation for User Story 1

- [ ] T020 [US1] Add classification patterns for `linked_to_unknown_item` (`linked to unknown item: {uid}`), `invalid_uid_in_links` (`invalid UID in links: {uid}`) and `external_reference_not_found` (`external reference not found: {ref}`) to `server/src/doorstop_server/validation_rules.py`, setting `field` to `link_entry`, `link_entry` and `ref` respectively
- [ ] T021 [US1] Implement `relatedUid` capture for link checks in `server/src/doorstop_server/validation_rules.py`, extracting the UID named after the message's last `": "` — the contract requires `field: "link_entry"` ⇒ `relatedUid` is non-null ([data-model.md §2](data-model.md))
- [ ] T022 [US1] Implement `link_entry` anchoring in `src/problemsProvider.ts` ([data-model.md §4](data-model.md) resolution step 2): within the `links:` block, anchor to the entry line whose UID token equals `relatedUid`; when no entry matches, apply the first-line fallback and set `fallbackUsed`
- [ ] T023 [US1] Implement `ref` field anchoring in `src/problemsProvider.ts`, matching either the `ref:` or the `references:` key

**Checkpoint**: Broken links are visible as errors on the exact offending line. This is a complete, shippable increment.

---

## Phase 4: User Story 2 - Link-health warnings on link and derived fields (Priority: P2)

**Goal**: Suspect links, links to non-normative items, non-normative items carrying links, and items missing the links their hierarchy position implies appear as yellow warnings on the link entry, the `links:` field, or the `derived:` field.

**Independent Test**: Open `testdata/regression/REQ-007.yml`; a yellow warning `suspect link: REQ-001` sits on the `- REQ-001` link entry line; clearing the suspicion makes it disappear.

### Tests for User Story 2

- [ ] T024 [P] [US2] Add a server test to `server/tests/test_validation.py` for `suspect_link` against a real project whose parent item changed after linking — assert `severity: "warning"`, `field: "link_entry"`, `relatedUid` = the parent UID. Note this test **fails without T005**, because `STAMP_NEW_LINKS` stamps the link instead of reporting it ([research.md §1](research.md))
- [ ] T025 [P] [US2] Add server tests to `server/tests/test_validation.py` for `linked_to_non_normative`, `non_normative_has_links`, `no_links_to_parent_document` and `no_links_from_child_document`, asserting warning severity and `field` of `link_entry`, `links`, `derived`, `derived` respectively
- [ ] T026 [P] [US2] Add an extension test to `src/test/regressionFixture.test.ts` asserting a `DiagnosticSeverity.Warning` on `REQ-007.yml` at the `REQ-001` link entry line

### Implementation for User Story 2

- [ ] T027 [US2] Add classification patterns for `suspect_link` (`suspect link: {uid}`) and `linked_to_non_normative` (`linked to non-normative item: {uid}`) to `server/src/doorstop_server/validation_rules.py` with `field: "link_entry"` and `relatedUid` captured
- [ ] T028 [US2] Add classification patterns for `non_normative_has_links` (`non-normative, but has links`) with `field: "links"`, and for `no_links_to_parent_document` (`no links to parent document: {prefix}`) and `no_links_from_child_document` (`no links from child document: {prefix}`) with `field: "derived"`, to `server/src/doorstop_server/validation_rules.py`
- [ ] T029 [US2] Implement `links` and `derived` field anchoring in `src/problemsProvider.ts` — both reuse T014's generic key matching; verify `links` anchors to the `links:` key itself and never to an entry line

**Checkpoint**: US1 and US2 both work independently; link problems are fully covered at both severities.

---

## Phase 5: User Story 3 - Content and review warnings (Priority: P3)

**Goal**: Empty text, unreviewed changes and duplicated levels are reported on the `text`, `reviewed` and `level` fields — with markdown-format items anchoring an empty-text warning to the file's last line.

**Independent Test**: In a scratch project, an item with empty text shows `no text` on its `text:` line; the same in a markdown-format document shows it on the file's last line; an item edited after review shows `unreviewed changes` on its `reviewed:` line.

### Tests for User Story 3

- [ ] T030 [P] [US3] Add server tests to `server/tests/test_validation.py` for `no_text` (`field: "text"`) and `unreviewed_changes` (`field: "reviewed"`) against a real temporary project
- [ ] T031 [P] [US3] Add a server test to `server/tests/test_validation.py` for `duplicate_level`: two items sharing a level yield **one** record with **both** UIDs in `uids` and `field: "level"` — guarantee 5 (fan-out preserved) of [contracts/validation-api.md §1](contracts/validation-api.md), not two separate records
- [ ] T032 [P] [US3] Add an extension test to `src/test/regressionFixture.test.ts` covering markdown-format items: an empty-text warning anchors to the **last line** of the `.md` file (FR-007)

### Implementation for User Story 3

- [ ] T033 [US3] Add classification patterns for `no_text` (`no text`, `field: "text"`), `unreviewed_changes` (`unreviewed changes`, `field: "reviewed"`) and `needs_initial_review` (`needs initial review`, `field: "reviewed"`, info severity) to `server/src/doorstop_server/validation_rules.py`
- [ ] T034 [US3] Add classification patterns for `duplicate_level` (`duplicate level: {lvl} ({uidA}, {uidB})`) and `skipped_level` (`skipped level: {lvl} ({uid}), {lvl} ({uid})`) to `server/src/doorstop_server/validation_rules.py` with `field: "level"`, extracting **both** named UIDs into `uids` — these are document-level messages that name items, so they are the concrete fan-out case
- [ ] T035 [US3] Implement `text` anchoring in `src/problemsProvider.ts` with the format split of [data-model.md §4](data-model.md) resolution step 3: `text:` key line for attribute-format items, **file's last line** for markdown-format items, using `DocumentNode.itemFormat` from `GET /tree` to choose
- [ ] T036 [US3] Implement `reviewed` and `level` field anchoring in `src/problemsProvider.ts` — note the real YAML key is `reviewed:`, not `review:` ([research.md §5](research.md))

**Checkpoint**: All item-level content warnings land on the right field in both item formats.

---

## Phase 6: User Story 4 - Document-level problems (Priority: P4)

**Goal**: A problem concerning a document as a whole is reported on that document's configuration file, so an empty document is not invisible for want of an item to attach to.

**Independent Test**: Expand `children/EMPTY` in the fixture; a warning `no items` appears on `children/EMPTY/.doorstop.yml` at line 1 without opening any item file.

### Tests for User Story 4

- [ ] T037 [P] [US4] Add a server test to `server/tests/test_validation.py` asserting an empty document yields `check: "no_items"`, `field: "document"`, **empty `uids`**, and the correct `documentPrefix` — per [data-model.md §2](data-model.md), `uids` empty ⇒ `field` is `"document"` or `null`
- [ ] T038 [P] [US4] Add a server test to `server/tests/test_validation.py` for guarantee 2 (whole tree) of [contracts/validation-api.md §1](contracts/validation-api.md): issues are returned for every document including ones with no open editor and empty ones (FR-015)
- [ ] T039 [P] [US4] Add an extension test to `src/test/regressionFixture.test.ts` asserting a `DiagnosticSeverity.Warning` on `children/EMPTY/.doorstop.yml` for the fixture's empty document

### Implementation for User Story 4

- [ ] T040 [US4] Add classification patterns for `no_items` (`no items`) and `no_documents` (`no documents`) to `server/src/doorstop_server/validation_rules.py` with `field: "document"` and empty `uids`
- [ ] T041 [US4] Implement `document` anchoring in `src/problemsProvider.ts` ([data-model.md §4](data-model.md) resolution step 1): resolve to the document's `markerPath` from `GET /tree` at line 0
- [ ] T042 [US4] Implement the unresolvable-UID fallback in `src/problemsProvider.ts`: an item UID with no known path anchors to its document's `markerPath` rather than being dropped ([data-model.md §4](data-model.md) rules)

**Checkpoint**: Every problem Doorstop reports now has somewhere to land, item-level or document-level.

---

## Phase 7: User Story 5 - Problems stay current (Priority: P5)

**Goal**: The problem list refreshes after saves and extension-initiated changes, can be re-checked on demand, and empties with an explicit message rather than going stale when the fetch fails.

**Independent Test**: With an error visible on `REQ-009`, fix the link and save — the error disappears within 3 seconds without a restart; break it again and save — it returns.

### Tests for User Story 5

- [ ] T043 [P] [US5] Add an extension test to `src/test/regressionFixture.test.ts` asserting that editing and saving a fixture item refreshes its diagnostics, and that the test restores the fixture file afterwards
- [ ] T044 [P] [US5] Add an extension test to `src/test/regressionFixture.test.ts` asserting that when `GET /validate` fails the collection is **cleared** rather than left populated (FR-014, SC-008)

### Implementation for User Story 5

- [ ] T045 [US5] Implement the refresh triggers in `src/problemsProvider.ts` per [contracts/validation-api.md §4](contracts/validation-api.md): server-ready, `workspace.onDidSaveTextDocument` filtered to `.yml`/`.md` files inside the workspace folder, and after any extension-initiated mutation
- [ ] T046 [US5] Implement 300 ms debouncing in `src/problemsProvider.ts` with in-flight refreshes **superseded, not queued**, so a burst of saves collapses to one fetch (SC-005 allows 3 s for ≤500 requirements)
- [ ] T047 [US5] Wire the `doorstop.recheckProblems` command in `src/extension.ts` to force a full refresh bypassing the debounce (FR-013), and push its disposable onto `context.subscriptions`
- [ ] T048 [US5] Implement failure handling in `src/problemsProvider.ts`: clear the collection and show one message naming the failure **per failure transition**, never once per debounce tick, and never leaving stale problems on screen (FR-014, Constitution Principle III)
- [ ] T049 [US5] Ensure the diagnostic collection is disposed via `context.subscriptions` in `src/extension.ts`, and that diagnostics for a deleted item or file are cleared on the next refresh (FR-016)

**Checkpoint**: All five user stories are independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T050 [P] Add a row for problem reporting to the regression checklist table in `testdata/regression/CHECKLIST.md`, covering the fixture's three known issues (`REQ-009` error, `REQ-007` warning, `EMPTY` document warning) and their automated-coverage status
- [ ] T051 [P] Document the feature in `CHANGELOG.md` and `README.md`, including the note that self-link, link-cycle and child-link-inactive checks are not reported because Doorstop 3.2 does not implement them
- [ ] T052 [P] Add a `server/README.md` note recording the Doorstop-3.2 message-template coupling in `validation_rules.py` and what to re-check on a Doorstop upgrade ([research.md §4](research.md))
- [ ] T053 Verify the noise behaviour called out in [research.md §2d](research.md) on `testdata/regression`: the empty `EMPTY` document produces `no links from child document: EMPTY` on most `REQ` items — confirm this is genuine Doorstop output and is **not** suppressed
- [ ] T054 Run `npm run check-types && npm run lint` and `cd server && python -m pytest tests` — both are Constitution Principle V gates and must pass before packaging
- [ ] T055 Walk every scenario in [quickstart.md](quickstart.md) end to end, including Scenario 1's deliberate removal of the read-only settings scope to confirm the no-write test actually fails without it, then restore
- [ ] T056 Confirm `git status --short testdata/regression/` is clean after the full validation pass — no item file may have been modified by problem reporting (FR-017)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS all user stories**
- **User Stories (Phases 3–7)**: All depend on Foundational; then proceed in parallel (if staffed) or in priority order P1→P5
- **Polish (Phase 8)**: Depends on all desired stories being complete

### Critical path inside Phase 2

T004 → T005 → T006 → T007 → T008 → T009. **T005 before T009**, and both before any story phase: T005 is the read-only guarantee and T009 is the test that keeps it. T011 → T012/T014 → T015 → T016 on the extension side. T013 can run once T004 exists.

### User Story Dependencies

- **US1 (P1)**: Foundational only. No dependency on other stories.
- **US2 (P2)**: Foundational only. Independently testable; T024 additionally proves T005 is working.
- **US3 (P3)**: Foundational only. T034 supplies the concrete fan-out case that exercises T015.
- **US4 (P4)**: Foundational only. Note US4's "same message on every affected item" behaviour is delivered by T015 in Foundational; T031/T034 in US3 give it a case to verify against.
- **US5 (P5)**: Foundational only for the mechanism, but only *observable* once at least one story renders a problem — sequence it after US1 if delivering incrementally.

### Within Each User Story

Server classification before extension anchoring; tests may be written first (they will fail until the matching implementation task lands). Story complete and validated before moving to the next priority.

### Parallel Opportunities

- T001, T002, T003 all in parallel (three different files)
- T009, T010 in parallel with the extension-side T011–T015 (different languages, different files)
- Within each story, all test tasks marked [P] in parallel; server classification tasks and extension anchoring tasks touch different files and can proceed together once the contract row is agreed
- T050, T051, T052 in parallel

---

## Parallel Example: User Story 1

```bash
# All three US1 test tasks touch different files — run together:
Task: "T017 Server tests for the three error checks in server/tests/test_validation.py"
Task: "T018 Server test for inactive parent link in server/tests/test_validation.py"
Task: "T019 Extension test for REQ-009 in src/test/regressionFixture.test.ts"

# Server classification and extension anchoring are separate files:
Task: "T020 Error-check patterns in server/src/doorstop_server/validation_rules.py"
Task: "T022 link_entry anchoring in src/problemsProvider.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1: Setup
2. Phase 2: Foundational — **do not skip T005/T009**, they are the difference between a read-only feature and one that corrupts the user's requirements
3. Phase 3: User Story 1
4. **STOP and VALIDATE**: `REQ-009`'s broken link shows as an error on the right line; `git status` under `testdata/regression/` is clean
5. Demo — broken traceability is visible in the editor

### Incremental Delivery

Setup + Foundational → US1 (errors, MVP) → US2 (link warnings) → US3 (content warnings) → US4 (document-level) → US5 (freshness) → Polish. Each story adds visible value without breaking the previous ones.

### Parallel Team Strategy

After Foundational: Developer A takes US1+US2 (link-focused, shared anchoring code), Developer B takes US3+US4 (field and document anchoring), Developer C takes US5 (refresh and failure paths, touches only `problemsProvider.ts` lifecycle). US5 is the only story that benefits from landing last.

---

## Notes

- `[P]` = different files, no dependencies
- Every diagnostic carries `source: "doorstop"` and `code: <check>` so users can filter by check and a future quick-fix provider has a stable hook
- **Out of scope**: quick fixes from a problem (e.g. "clear the suspicion" from the warning) — the spec limits this feature to display; the dedicated commands from feature 013 cover the actions
- **Do not implement** `linked_to_self`, `link_cycle` or `child_link_inactive`; T013 reserves their ids and nothing more
- Commit after each task or logical group; stop at any checkpoint to validate a story independently
