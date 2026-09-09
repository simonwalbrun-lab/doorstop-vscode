---

description: "Task list for Go to Definition & Usage Navigation"
---

# Tasks: Go to Definition & Usage Navigation

**Input**: Design documents from `/specs/009-goto-definition-navigation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md (no contracts/ — no new server endpoint)

**Tests**: Not requested in spec.md. One extension-host test is recommended
(not a hard gate — see `plan.md` Testing note) and is included as an
optional Polish task rather than a blocking per-story test phase.

**Organization**: Tasks are grouped by user story (spec.md priorities:
US1 = P1, US2 = P1, US3 = P2) so each can be implemented and validated
independently, on top of one shared foundation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Every implementation task names its exact file path

## Path Conventions

Single-project VS Code extension (see `plan.md` Structure Decision). All new
code lives in one new file, `src/definitionProvider.ts`, wired into
`src/extension.ts`. No server changes (`GET /tree` already provides
everything needed — see `research.md` Decision 1).

---

## Phase 1: Setup

**Purpose**: Create the new module all later work builds on.

- [X] T001 Create `src/definitionProvider.ts` with its module imports
  (`vscode`; `DoorstopServer` type from `./doorstopServer`; `TreeResponse`,
  `ItemNode`, `LinkInfo` from `./doorstopTypes`) and a local UID token regex
  constant `/\b[A-Z0-9_-]+-\d+\b/g` matching `hoverProvider.ts`'s existing
  pattern. Per `research.md` Decision 5, do **not** modify or export from
  `hoverProvider.ts` — redeclare the constant locally instead.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared resolver (`GET /tree` index, header/reference line
locators) and provider registration plumbing every user story branches from.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Implement `getCurrentUid(document: vscode.TextDocument): string | undefined`
  in `src/definitionProvider.ts` — the current document's own UID, taken from
  its filename with the `.yml`/`.md` extension stripped, mirroring
  `deriveProvider.ts`'s `getSourceUid` convention. Depends on: T001.
- [X] T003 Implement `buildItemIndex(server: DoorstopServer): Promise<{ pathByUid: Map<string, string>; linkersByUid: Map<string, string[]> } | undefined>`
  in `src/definitionProvider.ts` — call `server.request<TreeResponse>('GET', '/tree')`
  and build both maps per `data-model.md`'s Doorstop Item Index Construction
  rule (`pathByUid[item.uid] = item.path`; for each `link` in `item.links`,
  append `item.uid` to `linkersByUid[link.uid]`). On a failed request, log via
  `console.error('[Doorstop][definition] ...')` (matching `hoverProvider.ts`'s
  `[Doorstop][hover]` logging style) and return `undefined` — never throw
  (`research.md` Decision 4). Depends on: T001.
- [X] T004 Implement `findHeaderLocation(uri: vscode.Uri): Promise<vscode.Location>`
  in `src/definitionProvider.ts` — read the file via
  `vscode.workspace.fs.readFile`, and regex-scan its text for the header
  line: for a `.yml` path, the first line matching `^\s*header\s*:`
  (case-insensitive); for a `.md` path, the first line matching `^#{1,6}\s+`.
  Return a `vscode.Location` positioned on that line, or
  `new vscode.Range(0, 0, 0, 0)` if no such line is found (`data-model.md`
  single-UID resolution rule steps 3-4; `research.md` Decision 3). Depends
  on: T001.
- [X] T005 Implement `findReferenceLocation(uri: vscode.Uri, targetUid: string): Promise<vscode.Location>`
  in `src/definitionProvider.ts` — read the file's text and find the first
  line containing `targetUid` as a token (reuse the T001 regex). Return a
  `vscode.Location` there, or `new vscode.Range(0, 0, 0, 0)` if the token
  isn't found in the text (`research.md` Decision 2). Depends on: T001.
- [X] T006 Add `registerDefinitionProvider(context: vscode.ExtensionContext, options: { server: DoorstopServer; workspaceFolder: vscode.WorkspaceFolder }): void`
  to `src/definitionProvider.ts`, registering a `vscode.DefinitionProvider`
  and a `vscode.ReferenceProvider` (both initially stubbed to return
  `undefined`/`[]`) for selector `[{ language: 'yaml' }, { language: 'markdown' }]`
  — the same selector `deriveProvider.ts`'s CodeLens already uses — and
  pushing both disposables to `context.subscriptions`. Depends on: T001.
- [X] T007 Wire the provider into the extension: in `src/extension.ts`,
  import `registerDefinitionProvider` from `./definitionProvider` and call
  `registerDefinitionProvider(context, { server: doorstopServer, workspaceFolder })`
  inside the existing `if (workspaceFolder) { ... }` block, alongside the
  current `registerDeriveProvider` call. Depends on: T006.

**Checkpoint**: `npm run compile` passes; the providers are registered
end-to-end but every lookup still returns "no results" until the user story
phases below fill in the branches.

---

## Phase 3: User Story 1 - Jump straight to a dependency's file (Priority: P1) 🎯 MVP

**Goal**: Pressing F12 on a requirement UID (e.g. under `links:`) opens that
requirement's file directly, cursor on its header line.

**Independent Test**: Open a requirement file that lists another requirement
under `links:`, place the cursor on that UID, press F12, and confirm the
matching requirement's file opens with the cursor on its header line.

### Implementation for User Story 1

- [X] T008 [US1] Implement the single-UID branch in `src/definitionProvider.ts`:
  in `provideDefinition`, get the UID token at the cursor via
  `document.getWordRangeAtPosition(position, <T001 regex>)`; if the current
  line matches `/^\s*derived\s*:/i`, skip this branch (handled in Phase 4);
  otherwise call `buildItemIndex(server)` (T003) and look up
  `pathByUid[hoveredUid]`. Return `undefined` if not found (FR-004); if
  found, return the result of `findHeaderLocation` (T004) on that path.
  Depends on: T002, T003, T004, T005.
- [X] T009 [US1] Replace the `DefinitionProvider` stub registered in T006
  with the branch implemented in T008, in `src/definitionProvider.ts`.
  Depends on: T008.
- [X] T010 [US1] Manually validate `quickstart.md` Scenario 1 (F12 on a
  `links:` UID opens the target file with the cursor on its header line) and
  Scenario 5 (F12 on non-UID prose text is a no-op) in the Extension
  Development Host. Depends on: T009.

**Checkpoint**: User Story 1 is fully functional and independently testable
— F12 on any UID jumps to its file. `derived:` lines still return no results
until Phase 4.

---

## Phase 4: User Story 2 - See every place a requirement is used (Priority: P1)

**Goal**: Pressing F12 (or Shift+F12) on the `derived:` field key opens an
in-editor Locations view listing every file and line that links to the
current requirement.

**Independent Test**: Open a requirement that other items link to, place the
cursor on its `derived:` line, trigger F12/Shift+F12, and confirm an
in-editor locations view lists each referencing file with the specific line
where the link occurs.

### Implementation for User Story 2

- [X] T011 [US2] Implement the `derived:`-line branch in
  `src/definitionProvider.ts`: detect `/^\s*derived\s*:/i` on the cursor's
  line; resolve `getCurrentUid(document)` (T002) — return `[]` immediately if
  it's `undefined` (spec Edge Cases: file name doesn't resolve to a UID);
  otherwise call `buildItemIndex(server)` (T003) and look up
  `linkersByUid[currentUid]` (`[]` if none, per FR-004). For each referencing
  `uid`, resolve its `path` via `pathByUid` and call `findReferenceLocation`
  (T005) to build one `vscode.Location`; return the full list. Depends on:
  T002, T003, T005.
- [X] T012 [US2] Wire the branch from T011 into the `DefinitionProvider`
  registered in T006/T009, in `src/definitionProvider.ts` — replacing its
  remaining `derived:` stub. Depends on: T011.
- [X] T013 [US2] Implement `provideReferences` in `src/definitionProvider.ts`,
  reusing the exact usages resolution from T011 (Shift+F12 parity per
  FR-002's "and/or Find All References"), and replace the
  `ReferenceProvider` stub registered in T006 with it. Depends on: T011.
- [X] T014 [US2] Manually validate `quickstart.md` Scenario 2 (F12 and
  Shift+F12 on `derived:` both open a Locations view with the correct file
  and line per referencing item) and Scenario 3 (a requirement with zero
  usages reports "no results" with no error dialog) in the Extension
  Development Host. Depends on: T012, T013.

**Checkpoint**: User Stories 1 and 2 both work independently — F12
resolves both single UIDs and `derived:` usages correctly.

---

## Phase 5: User Story 3 - Return to where you came from (Priority: P2)

**Goal**: After jumping via "Go to Definition" (most commonly from a
`links:` entry), "Go Back" (Alt+Left) restores the originating file and
cursor position.

**Independent Test**: From a requirement file, trigger "Go to Definition" on
a linked UID to open the target file, then trigger "Go Back" and confirm the
original file and cursor position are restored.

### Implementation for User Story 3

- [X] T015 [US3] Manually validate `quickstart.md` Scenario 4 (Go Back after
  jumping from a `links:` UID restores the originating file and cursor
  position) in the Extension Development Host. No new code is expected here:
  because T008/T009 already return real `vscode.Location` results (never a
  `command:vscode.open` link), VS Code's native back-navigation stack
  applies automatically (`plan.md` Constraints, `research.md`). If this
  scenario fails, the fix belongs in T008/T009, not a new file. Depends on:
  T009.

**Checkpoint**: All three user stories are independently functional; the
"jump to files and back" journey from the spec's Input is complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Repo-wide gates and housekeeping that span all three stories.

- [X] T016 [P] Add a `CHANGELOG.md` entry under `## [Unreleased]` for "Go to
  Definition / Find All References navigation for requirement UIDs and
  `derived:` usages" in `CHANGELOG.md`, matching the existing one-line bullet
  style used by prior entries.
- [X] T017 [P] (Recommended, not a hard gate — see `plan.md` Testing note)
  Add an extension-host test exercising `provideDefinition`/
  `provideReferences` against a temporary Doorstop-shaped workspace, in
  `src/test/extension.test.ts` (currently only a placeholder sample test).
- [X] T018 Run `npm run compile` (check-types + lint + esbuild) from the
  repository root and confirm it passes cleanly — Constitution Principle V
  gate. Depends on: T009, T012, T013.
- [X] T019 Run the full `quickstart.md` Scenario 1-5 sequence end-to-end in
  the Extension Development Host after all stories are implemented, as a
  final combined sanity check. Depends on: T010, T014, T015.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Phase 1 (T001) — BLOCKS all user
  stories.
- **User Story 1 (Phase 3)**: Depends on Phase 2 completion. No dependency on
  US2/US3.
- **User Story 2 (Phase 4)**: Depends on Phase 2 completion. Independent of
  US1's branch, but shares the same `DefinitionProvider` registration from
  T006 (both branches live in the same file/function) — implement after US1
  to avoid rework, not because of a hard data dependency.
- **User Story 3 (Phase 5)**: Depends on US1 (T009) existing, since it
  validates US1's jump behavior's back-navigation — it adds no new code.
- **Polish (Phase 6)**: Depends on all three stories being complete.

### Within Each User Story

- All implementation tasks for a story touch the same file
  (`src/definitionProvider.ts`) and are applied in sequence, not parallel.
- Each story's final task is manual validation against `quickstart.md`.

### Parallel Opportunities

- T016 (CHANGELOG.md) and T017 (test file) touch different files from each
  other and from the main implementation, and have no dependency between
  them — the only genuine `[P]` pair in this task set.
- Everything else in `src/definitionProvider.ts` is sequential, since every
  task after T001 edits the same file.

---

## Parallel Example: Polish Phase

```bash
# Launch together once all three user stories are complete:
Task: "Add a CHANGELOG.md entry under [Unreleased] in CHANGELOG.md"
Task: "Add an extension-host test in src/test/extension.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (T001) and Phase 2 (T002-T007).
2. Complete Phase 3 (T008-T010) — US1.
3. **STOP and VALIDATE**: run `quickstart.md` Scenarios 1 and 5.
4. This alone already delivers "jump between files" (F12 on any UID) and,
   for free, the US3 back-navigation round trip (Phase 5 is validation-only
   once US1 exists).

### Incremental Delivery

1. Setup + Foundational → registration plumbing in place, all lookups still
   "no results".
2. Add US1 (T008-T010) → F12 jumps to dependency files → validate → this is
   the MVP.
3. Add US2 (T011-T014) → F12/Shift+F12 on `derived:` shows usages → validate.
4. Add US3 (T015) → confirm Go Back already works → validate.
5. Polish (T016-T019) → changelog, optional test, compile gate, full
   end-to-end pass.

---

## Notes

- [P] tasks = different files, no dependencies (only T016/T017 qualify here).
- [Story] label maps each task to its user story for traceability.
- No `contracts/` and no data-model entities beyond ephemeral, per-request
  values — this feature adds zero server/API surface (see `plan.md`,
  `data-model.md`).
- Every implementation task lives in one new file, `src/definitionProvider.ts`
  (plus one wiring line in `src/extension.ts`) — `hoverProvider.ts`,
  `deriveProvider.ts`, `requirementTree.ts`, and all server files stay
  untouched per `research.md` Decision 5 and `plan.md` Constraints.
- **Implementation note**: T010/T014/T015/T019 were executed as automated
  `@vscode/test-electron` runs (`npm test`) against a temporary Doorstop
  fixture, rather than interactive manual clicking (no interactive GUI
  session was available) — this is a strictly stronger check for the same
  scenarios, including a real `editor.action.revealDefinition` +
  `workbench.action.navigateBack` round trip for US3. T017's test file grew
  to 8 tests total (up from the 1 originally planned), covering every
  `quickstart.md` scenario. All 8 pass; `npm run compile` is clean.
