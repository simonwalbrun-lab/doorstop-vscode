---

description: "Task list for feature 017 — Review and Suspect-Link Actions via Problems Quick Fix"
---

# Tasks: Review and Suspect-Link Actions via Problems Quick Fix

**Input**: Design documents from `/specs/017-gutter-icon-actions/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/quick-fix-actions.md](contracts/quick-fix-actions.md), [quickstart.md](quickstart.md)

**Tests**: Test tasks ARE included. Constitution Principle VI makes at least one CI-runnable test per feature non-negotiable, and this feature is fully automatable through `src/test/reviewLensScan.test.ts` and `src/test/regressionFixture.test.ts`, both already CI-wired and already driving the real Doorstop server against `testdata/regression`. The owed tests are enumerated in [contracts/quick-fix-actions.md §5](contracts/quick-fix-actions.md#5-contract-tests-owed).

**Organization**: Grouped by user story, matching spec.md exactly — **User Story 1** is the single "Quick Fix" story (it covers all three retiring actions: Do Review, Clear Suspect Link, Clear All Suspect Links, since spec.md treats them as one cohesive change), **User Story 2** is the independent TreeView icon removal. The two stories touch disjoint files (US1: `reviewLensProvider.ts`, a new `reviewCodeActionProvider.ts`, `extension.ts`, `reviewLensScan.test.ts`; US2: `package.json` only), so there is no shared Foundational phase blocking either.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2)
- Exact file paths are included in every task

## Path Conventions

Single VS Code extension at repository root: extension host in `src/`, extension tests in `src/test/`, Python server in `server/` (untouched by this feature), fixtures in `testdata/regression/`. No new top-level directory is introduced.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish a clean baseline before changing anything.

- [X] T001 Record a green baseline: run `npm run compile`, `npm test`, and (from `server/`) `python -m pytest tests`; note any pre-existing failure so it is not later mistaken for a regression. No fixture changes are needed — `testdata/regression/REQ-005.yml` (unreviewed, no links), `REQ-006.yml` (already reviewed), `REQ-007.yml` (one suspect link), `REQ-008.yml` (cleared link), and `REQ-010.yml` (two suspect links) already cover every scenario this feature needs.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: N/A for this feature. User Story 1 and User Story 2 share no new infrastructure and touch disjoint files — there is nothing that must exist before either can start beyond the Phase 1 baseline. Proceed directly to Phase 3.

---

## Phase 3: User Story 1 - Fix "needs review" and "suspect link" problems from a Quick Fix (Priority: P1) 🎯 MVP

**Goal**: Retire the `Do Review`, `Clear All Suspicions`, and `Clear the Suspicion` CodeLenses in favor of `vscode.CodeAction` Quick Fixes attached to the Problems Doorstop's validation already reports (`needs_initial_review` / `unreviewed_changes` on `reviewed:`, `suspect_link` on each link entry), leaving `+ Derive Requirement` untouched.

**Independent Test**: Open `testdata/regression/REQ-007.yml`, confirm a Problem sits on its `reviewed:` line and its one link entry line, invoke Quick Fix on each, confirm `Do Review` and `Clear Suspect Link` (not `Clear All Suspect Links`, since only one suspect link exists) are offered, and that selecting either reproduces today's server-side effect exactly.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T002 [P] [US1] In `src/test/reviewLensScan.test.ts`, remove the CodeLens-based assertions for `Do Review`, `Clear All Suspicions`, and `Clear the Suspicion` (the `lensesFor()` calls and `titled()` checks against those three titles, across all tests in the suite), keeping the pure `scanRequirementDocument()` tests and the "+ Derive Requirement lens still renders alongside the new ones" test exactly as they are (FR-005: derive is unaffected).
- [X] T003 [P] [US1] Add a `codeActionsFor(name, line)` helper to `src/test/reviewLensScan.test.ts`, calling `vscode.commands.executeCommand<vscode.CodeAction[]>('vscode.executeCodeActionProvider', document.uri, new vscode.Range(line, 0, line, 0))` and returning `{ title, command }` pairs (`command` being each action's `.command?.command`), mirroring the shape of the existing `lensesFor()` helper.
- [X] T004 [US1] Add Quick Fix assertions in `src/test/reviewLensScan.test.ts` using `codeActionsFor`: at `REQ-007.yml`'s `reviewed:` line, exactly a `Do Review` action (command `doorstop.doReview`) is offered; at its one link-entry line (parent `REQ-001`), exactly a `Clear Suspect Link` action (command `doorstop.clearSuspicion`) is offered and **not** `Clear All Suspect Links` (acceptance scenario 2, since only one suspect link exists on this item); `.doorstop.yml` offers none of the three actions at any line (mirrors the existing "document marker yields no Doorstop lenses" test).
- [X] T005 [US1] Add Quick Fix assertions in `src/test/reviewLensScan.test.ts` for `REQ-010.yml` (two suspect links, `reviewed: null`): at either link-entry line, both `Clear Suspect Link` and `Clear All Suspect Links` (command `doorstop.clearAllSuspicions`) are offered (acceptance scenario 3); at its `reviewed:` line, `Do Review` is also offered (edge case: an item can need review and have suspect links at once).
- [X] T006 [US1] Add negative Quick Fix assertions in `src/test/reviewLensScan.test.ts`: at `REQ-006.yml`'s `reviewed:` line (already reviewed, `reviewed: <stamp>`), no `Do Review` action is offered; at `REQ-008.yml`'s link-entry line (link already cleared), no `Clear Suspect Link` action is offered (acceptance scenario 6).
- [X] T007 [P] [US1] In `src/test/regressionFixture.test.ts`, rename the four `'CodeLens: ...'`-prefixed test titles (`Do Review marks only the target requirement as reviewed`, `Clear All Suspicions clears the item's links`, `Clear the Suspicion clears one link and leaves the other suspect`, `Clear the Suspicion on a dangling link changes nothing`) to drop the now-stale `CodeLens:` prefix. These tests call the commands directly via `vscode.commands.executeCommand` (not through any lens or code action), so their assertions and behavior are unchanged by this feature — only the title is stale afterward.

### Implementation for User Story 1

- [X] T008 [US1] Create `src/reviewCodeActionProvider.ts` exporting `registerReviewCodeActionProvider(context: vscode.ExtensionContext, options: { server: DoorstopServer })`, registering a `vscode.CodeActionProvider` via `vscode.languages.registerCodeActionsProvider([{ language: 'yaml' }, { language: 'markdown' }], provider, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] })` (same document selector the retired lenses used, contracts §1), importing `scanRequirementDocument` from `./reviewLensProvider`; `provideCodeActions` returns `[]` for now.
- [X] T009 [US1] In `src/reviewCodeActionProvider.ts`, implement the eligibility computation from [data-model.md](data-model.md)'s "Eligibility rules" table: call `scanRequirementDocument(document)` and `vscode.languages.getDiagnostics(document.uri)`, filter diagnostics to `source === 'doorstop'`. A `Do Review` candidate exists when `scan.reviewedLine` overlaps the requested `range` **and** a diagnostic with `code` in `{needs_initial_review, unreviewed_changes}` overlaps that same line. A `Clear Suspect Link` candidate exists per entry in `scan.linkEntries` whose `line` overlaps `range` **and** has an overlapping diagnostic with `code === 'suspect_link'`. `Clear All Suspect Links` is additionally eligible whenever a `Clear Suspect Link` candidate is found **and** the file's `suspect_link`-coded diagnostics total ≥ 2 (contracts §1.3, research.md §4).
- [X] T010 [US1] In `src/reviewCodeActionProvider.ts`, implement `provideCodeActions` building `vscode.CodeAction`s from T009's eligibility results: for `Do Review`, `kind: vscode.CodeActionKind.QuickFix`, `command: { command: 'doorstop.doReview', title: '$(check-compact) Do Review', arguments: [{ uid: scan.uid, documentUri: document.uri.toString() }] }`, `diagnostics: [theMatchingDiagnostic]`, `isPreferred: true` (contracts §1.1); for `Clear Suspect Link`, `command: 'doorstop.clearSuspicion'`, `title: '$(check) Clear Suspect Link'`, `arguments: [{ uid: scan.uid, parentUid: entry.parentUid, documentUri }]` (contracts §1.2); for `Clear All Suspect Links`, `command: 'doorstop.clearAllSuspicions'`, `title: '$(check-all) Clear All Suspect Links'`, `arguments: [{ uid: scan.uid, documentUri }]` (contracts §1.3). No network call in this function (data-model.md invariant 2).
- [X] T011 [US1] In `src/reviewLensProvider.ts`, remove the `Do Review`, `Clear All Suspicions`, and `Clear the Suspicion` `vscode.CodeLens` emissions from `provideCodeLenses` (FR-004), keeping the `doorstop.doReview` / `doorstop.clearAllSuspicions` / `doorstop.clearSuspicion` `vscode.commands.registerCommand` registrations, `ensureSavedOrConfirm`, and `runLensAction` exactly as they are (contracts §2 — these become the new provider's command targets, not a reimplementation) and keeping `scanRequirementDocument` exported unchanged.
- [X] T012 [US1] In `src/extension.ts`, add `registerReviewCodeActionProvider(context, { server: doorstopServer })` in the same `if (workspaceFolder)` block as the existing `registerDeriveProvider` / `registerReviewLensProvider` calls, immediately after `registerReviewLensProvider(...)`.

**Checkpoint**: At this point, User Story 1 is fully functional and testable independently — `Do Review`, `Clear Suspect Link`, and `Clear All Suspect Links` are reachable only via Quick Fix, and `+ Derive Requirement` is unaffected.

---

## Phase 4: User Story 2 - Remove Review and Clear Suspect Link from the TreeView's clickable icons (Priority: P2)

**Goal**: The doorstop TreeView's requirement rows stop showing inline "Review" and "Clear Suspect" icon buttons, while their right-click context-menu entries stay exactly as they are.

**Independent Test**: Open the Doorstop TreeView, confirm a requirement row shows only "Add Item" and "Link Items" inline; right-click the same row and confirm "Review" and "Clear Suspect" still appear in the context menu, unchanged.

### Tests for User Story 2

- [X] T013 [P] [US2] Add a test (in `src/test/extension.test.ts` or a new `src/test/packageMenus.test.ts`) that reads and `JSON.parse`s the repository's `package.json` and asserts, within `contributes.menus["view/item/context"]`: no entry with `command: "doorstop.review"` or `command: "doorstop.clear"` has a `group` starting with `"inline"`; an entry with `command: "doorstop.review"` and `group: "1_requirement@3"` still exists; an entry with `command: "doorstop.clear"` and `group: "1_requirement@4"` still exists; entries for `doorstop.add` (`inline@1`) and `doorstop.link` (`inline@4`) still exist (FR-009, FR-010, FR-011).

### Implementation for User Story 2

- [X] T014 [US2] In `package.json`'s `contributes.menus["view/item/context"]`, remove the `doorstop.review` entry whose `group` is `"inline@2"` and the `doorstop.clear` entry whose `group` is `"inline@3"`. Leave every other entry in that array untouched, including both commands' `"1_requirement@*"` context-menu entries and the `doorstop.add` / `doorstop.link` inline entries (contracts §4).

**Checkpoint**: User Stories 1 and 2 both work independently; all acceptance scenarios in spec.md are satisfied.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T015 [P] Update `README.md`'s "Editor Integration (CodeLens & IntelliSense)" section (around the "CodeLens Review & Suspect Links" paragraph): describe `Do Review`, `Clear All Suspicions`, and `Clear the Suspicion` as Problems Quick Fixes rather than CodeLenses, keeping the "CodeLens Derivation" paragraph for `+ Derive Requirement` unchanged.
- [X] T016 [P] Add an `## [Unreleased]` entry to `CHANGELOG.md` describing the CodeLens-to-Quick-Fix migration for Do Review / Clear Suspect Link(s) and the TreeView inline-icon removal for Review / Clear Suspect Link.
- [X] T017 Run the full quickstart validation in the Extension Development Host: all five scenarios in [quickstart.md](quickstart.md), including the unsaved-edits modal (Scenario 1) and the selective-clear regression check (Scenario 3), which are not covered by automated tests.
- [X] T018 Run the complete gate set green: `npm run compile` (type-check + lint + bundle), `npm test`, and `python -m pytest tests` from `server/` (Constitution Principle V, Development Workflow).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Empty for this feature — nothing blocks Phase 3 or 4 beyond Phase 1
- **User Story 1 (Phase 3)**: Depends on Phase 1 only
- **User Story 2 (Phase 4)**: Depends on Phase 1 only; fully independent of Phase 3 (different files)
- **Polish (Phase 5)**: Depends on the desired user stories being complete; T018 last

### Within Each User Story

Tests are listed before implementation and should be written first and observed to fail (there is no existing Quick Fix provider yet, so T004–T006 fail until T008–T010 land). Within US1's implementation, T008 → T009 → T010 are sequential (one new file, each building on the last); T011 (a different file) and T012 (a third file) can follow in either order once T010's command names are settled.

### Critical Path

`T001 → T008 → T009 → T010 → T011 → T012 (US1 MVP)`

User Story 2 (`T013 → T014`) branches off Phase 1 independently and does not sit on this path.

### Parallel Opportunities

- **US1 tests**: T002 and T003 are `[P]` with each other (different concerns in the same file, but non-overlapping edits); T004, T005, T006 depend on T003's helper existing, so treat them as sequential additions to the same file rather than parallel. T007 is `[P]` with all of T002–T006 (a different file, `regressionFixture.test.ts`).
- **US1 implementation**: T008 → T009 → T010 → T011 are sequential; T012 is parallel to T011 once T008–T010 exist (different files).
- **Across stories**: once Phase 1 is done, US1 (Phase 3) and US2 (Phase 4) can be built simultaneously — they share no files.
- **Polish**: T015 and T016 are `[P]` with each other and with T017; T018 runs last, after everything else.

### Same-File Coordination Note

`src/test/reviewLensScan.test.ts` is touched by T002–T006 in sequence (one file, one suite). `src/reviewCodeActionProvider.ts` is touched by T008–T010 in sequence (a new file being built up). Keep these edits in the order listed if working through the tasks in order; if parallelizing within US1, coordinate on these two files specifically.

---

## Parallel Example: User Story 1

```bash
# T002 and T003 can start together (removal vs. new helper, same file, non-overlapping):
Task: "Remove CodeLens-based assertions in src/test/reviewLensScan.test.ts"
Task: "Add codeActionsFor() helper in src/test/reviewLensScan.test.ts"

# T007 is independent of all of the above (a different file):
Task: "Rename stale 'CodeLens:' test titles in src/test/regressionFixture.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1: Setup (T001)
2. Phase 3: User Story 1 (T002–T012)
3. **STOP and VALIDATE**: quickstart Scenarios 1–4 (Do Review, Clear Suspect Link, Clear All Suspect Links, Derive Requirement unaffected)
4. Shippable: all three retired CodeLenses are gone, their Quick Fix equivalents work, Derive Requirement is untouched

### Incremental Delivery

1. Setup → baseline confirmed green
2. US1 → validate → ship (MVP) — the substantive part of the request
3. US2 → validate → ship — the TreeView cleanup, independent of US1
4. Polish → docs, full quickstart, full gate set

### Scope Notes

- **No server source changes.** Every task above touches only `src/`, `package.json`, `README.md`, and `CHANGELOG.md`.
- **No new fixture items needed** — unlike feature 013, which had to add `REQ-010.yml`, this feature's fixture needs (`REQ-005`, `REQ-006`, `REQ-007`, `REQ-008`, `REQ-010`) already exist in `testdata/regression/`.
- **`+ Derive Requirement` is explicitly out of scope** (FR-005) — no task in this list touches `src/deriveProvider.ts`.

---

## Implementation Deviations (recorded during execution)

Five things turned out differently from the plan. All are noted here rather than silently absorbed:

1. **Quick Fix tests moved suite** (T003–T006). The plan put them in `src/test/reviewLensScan.test.ts`, but that suite deliberately runs with **no Doorstop server** (`.vscode-test.mjs`), and a Quick Fix only exists where a diagnostic does — which requires `/validate`. They therefore live in `src/test/regressionFixture.test.ts`, which runs a real server. `reviewLensScan.test.ts` keeps the pure scan tests and gains a test proving the three retired lenses are gone.
2. **No Codicon glyphs in the Quick Fix titles** (T010). FR-012 made this a SHOULD with a plain-text fallback; the fallback applies. VS Code does not render `$(icon)` syntax in the Quick Fix / action list — it leaks as literal text (the same bug GitLens hit in [gitkraken/vscode-gitlens#4866](https://github.com/gitkraken/vscode-gitlens/issues/4866)). Titles are plain: `Do Review`, `Clear Suspect Link`, `Clear All Suspect Links`.
3. **`registerReviewCodeActionProvider` takes no options** (T008). The contract sketched `{ server }`, but the provider makes no server call by design (data-model.md invariant 2) — the commands it targets do. An unused parameter would have been misleading.
4. **The CodeLens provider was removed, not emptied** (T011). `registerReviewLensProvider` is renamed `registerReviewCommands` and no longer registers a `CodeLensProvider` at all, which contracts §2 explicitly sanctioned ("the function is renamed/split so only the command registrations remain"). The file keeps its name, since it still owns the scan and the three commands.
5. **`packageMenus` is a new test suite** (T013), with its own label in `.vscode-test.mjs`. It needs neither a workspace nor a server, so bolting it onto an existing suite would have made it slower for no reason.

## Verification Status

| Suite | Result |
| --- | --- |
| `unit` | 14 passing |
| `reviewLensScan` | 8 passing (includes the retired-lens guard) |
| `packageMenus` | 3 passing (new, US2) |
| `regressionFixture` | 32 passing, including all six new Quick Fix tests |
| `server/tests` (pytest) | 60 passing, unchanged (no server code touched) |
| `npm run compile` | green (type-check + lint + bundle) |
| `npm test` (all six suites) | 77 passing, 0 failing |

`regressionFixture` initially could not run at all — port 7867 was held by a Doorstop
server for an unrelated project, which also blocked the pre-change baseline. Once that
port was free the suite ran clean, so the Quick Fix behaviour is verified against the
real Doorstop server, not just in CI.

T017 (the manual quickstart pass) was verified by the requester in the Extension
Development Host. The Phase 6 convergence tasks (T019, T020) were then added and
pass; the full gate set was re-run green afterwards. Nothing remains open.

## Notes

- `[P]` = different files, or non-overlapping edits to the same file, with no dependency on an incomplete task
- The extension must never write requirement files; every state change continues to go through the server via the unchanged `doorstop.doReview` / `doorstop.clearAllSuspicions` / `doorstop.clearSuspicion` commands (data-model.md invariant 1)
- `provideCodeActions` must stay synchronous and network-free (data-model.md invariant 2), matching the retired CodeLens provider's discipline
- A Quick Fix is only ever offered where a matching `doorstop`-sourced diagnostic already exists (data-model.md invariant 3, FR-007) — this provider is never the source of truth for "is this a problem"
- Commit after each task or logical group
- Stop at either checkpoint to validate a story independently

---

## Phase 6: Convergence

- [X] T019 In `src/test/regressionFixture.test.ts`, extend the "QuickFix: the single-link fix clears only its own link" test so that, after the fix's command has run and before `withRestoredFile` restores the file, it awaits `problems.refreshNow()` and asserts `quickFixTitlesAt(filePath, <REQ-001 entry line>)` returns `[]` — proving the applied fix and its problem disappear on the next check, per FR-008 (partial)
- [X] T020 In `src/test/regressionFixture.test.ts`, extend the "QuickFix: two suspect links offer both the single and the bulk clear" test to also assert `quickFixTitlesAt(filePath, <reviewed: line>)` returns `['Do Review']` for `REQ-010.yml`, covering the "item both needs review and has suspect links" edge case, per US1 edge cases (partial)
