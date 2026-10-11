---

description: "Task list for 026 — progress notifications for long-running commands"
---

# Tasks: Progress Notifications for Long-Running Commands

**Input**: Design documents from `/specs/026-long-running-progress/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/delayed-progress.md](contracts/delayed-progress.md)

**Tests**: One CI test suite for the helper (constitution Principle VI); no per-call-site tests.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2)

## Phase 1: Setup

None — no new dependencies, configuration, or project structure (plan.md).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared helper every call site uses.

- [X] T001 Create `src/progress.ts` exporting `withDelayedProgress<T>(title: string, work: () => Promise<T>): Promise<T>` and `setProgressForTest(fn: typeof vscode.window.withProgress | undefined): void`, per [contracts/delayed-progress.md](contracts/delayed-progress.md): call `work()` synchronously once (G1); arm a 1000 ms `setTimeout`; if the work has not settled when it fires, call the module's `progress` function (default `vscode.window.withProgress`) once with `{ location: vscode.ProgressLocation.Notification, title }` and a task that returns the same work promise (G3, G4), attaching `.catch(() => undefined)` to the value `progress` returns so a failure never becomes an unhandled rejection; clear the timer when the work settles first (G2); return the original work promise so callers get its value or its original error unchanged (G5). Keep it short, with a one-line header comment referencing spec 026 and constitution Principle VII.
- [X] T002 [P] Create `src/test/progress.test.ts` (mocha `suite`/`test`, same style as `src/test/timing.test.ts`) using `setProgressForTest` with a recording fake that stores the call time and the options and awaits the task; restore with `setProgressForTest(undefined)` in `teardown`. Cases: (1) work resolving after 1500 ms → fake called exactly once, at ≥ 1000 ms and ≤ 1200 ms after start, with `location === ProgressLocation.Notification` and the given title, and its task settles together with the work, and the helper resolves to the work's value; (2) work resolving after 100 ms → fake never called, also not after waiting a further 1200 ms; (3) work rejecting after 1500 ms with `new Error('boom')` → fake called once, the helper rejects with that same error object, and no `unhandledRejection` is emitted on `process` during the test. Set the suite timeout to 10 s.

**Checkpoint**: `npm run compile` and the new suite pass — the helper is ready for call sites.

---

## Phase 3: User Story 1 — Any slow command shows that it is still running (Priority: P1) 🎯 MVP

**Goal**: Every user-triggered operation that sends work to the server shows a notification once its work has run for 1 s, and none if it finishes sooner (FR-001–FR-009).

**Independent Test**: On a large project run *Recheck Problems* and *Refresh* → notification from ≤ 1.2 s until done; on a small project → none; wait in the *Publish* destination picker → no notification while the picker is open (quickstart rows 3–7).

- [X] T003 [US1] In `src/doorstopCommands.ts`, change `run()` (~line 201) to call `withDelayedProgress(\`Doorstop: ${title}…\`, op)` instead of `vscode.window.withProgress(...)`; keep the `busy` duplicate-run guard, the tree/utilities refresh, the error message and the `finally` exactly as they are (FR-007, FR-008).
- [X] T004 [US1] In `src/doorstopCommands.ts`, make the `doorstop.refresh` handler (~line 250) `async` and run `await withDelayedProgress('Doorstop: Refresh…', async () => { options.tree.refresh(); options.utilities.refresh(); await options.tree.getChildren(); })` so the notification covers the tree load that VS Code's own `getChildren` call shares via the provider's `loading` promise. Do not add a toast inside `requirementTree.ts` itself (automatic loads stay silent, FR-006).
- [X] T005 [P] [US1] In `src/extension.ts`, change the `doorstop.recheckProblems` command (~line 207) to `() => withDelayedProgress('Doorstop: Checking requirements…', () => problemsProvider?.refreshNow() ?? Promise.resolve())`. Leave `scheduleRefresh` and the configuration-change re-check unwrapped (FR-006).
- [X] T006 [P] [US1] In `src/documentViewProvider.ts` `openDocumentView` (~line 359), wrap `loadSnapshot(prefix)` as `withDelayedProgress(\`Doorstop: Opening document ${prefix}…\`, () => loadSnapshot(prefix))`; the existing `catch` / `prompts.reportError` stays unchanged.
- [X] T007 [US1] In `src/documentViewProvider.ts` save handler, wrap only the server write section — from `const failed: FailedWrite[] = []` (~line 487) through the update/create/delete request loops, ending before the post-save `loadSnapshot` reload — in `withDelayedProgress(\`Doorstop: Saving document ${state.prefix}…\`, async () => { … })`, returning whatever the section's following code needs (e.g. `failed`). All confirmation prompts above it stay outside (FR-005). Do not wrap `insertPlaceholder` / `cancelPlaceholder` (no server work, FR-009).
- [X] T008 [P] [US1] In `src/diagrammPanel.ts`: wrap the `this.refreshItemMeta()` call in the load path (~line 197) as `withDelayedProgress('Doorstop: Loading diagram…', () => this.refreshItemMeta())`; in `handleAddLink`, `handleRemoveLink` and `handleCreateLinkedItem` wrap only the `this._server.request(...)` calls (for `handleCreateLinkedItem`, the two requests after `choosePrefix`) with titles `Doorstop: Add Link…`, `Doorstop: Remove Link…`, `Doorstop: Create Linked Item…`. Leave the ghost-preview `refreshItemMeta()` (~line 386) unwrapped (hover-driven, research R5). Existing error messages unchanged.
- [X] T009 [P] [US1] In `src/deriveProvider.ts` (~line 283), wrap the add-item and link requests that follow the target-document pick in `withDelayedProgress('Doorstop: Derive Requirement…', async () => { … return addResult; })`; `onChanged`, the success message, `showTextDocument` and the existing `catch` stay outside the wrapper.
- [X] T010 [P] [US1] In `src/reviewLensProvider.ts` `runLensAction` (~line 189), replace `await send()` with `await withDelayedProgress('Doorstop: Updating review status…', send)`; the `ensureSavedOrConfirm` prompts in the three commands stay outside, error handling unchanged.

**Checkpoint**: US1 complete — all server-backed commands follow the 1-second rule.

---

## Phase 4: User Story 2 — See that the server is starting (Priority: P2)

**Goal**: Server start on workspace open and *Restart Server* show a notification once they take longer than 1 s (US2 scenarios 1–3).

**Independent Test**: Run *Doorstop: Restart Server* → "Restarting Doorstop server…" until ready, then the existing "Doorstop server is ready." message (quickstart rows 1–2).

- [X] T011 [US2] In `src/extension.ts` `spawnServerProcess` (~line 82), wrap the `restart`/`start` branch in `withDelayedProgress(restart ? 'Restarting Doorstop server…' : 'Starting Doorstop server…', () => restart ? doorstopServer.restart(...) : doorstopServer.start(...))`, keeping the existing ready message, `scheduleRefresh` and failure warning outside the wrapper. Leave the Install Server Package `vscode.window.withProgress` (~line 117) unchanged — it stays immediate (FR-007).

**Checkpoint**: US1 and US2 both complete.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T012 Search `src/` for `withProgress(`: the only direct uses left must be inside `src/progress.ts` and the Install Server Package call in `src/extension.ts`; fix any other remaining use.
- [X] T013 Run `npm run compile` and `npm test`; all suites, including `src/test/progress.test.ts`, must pass (Principles V, VI).
- [X] T014 [P] Add an entry to the unreleased section of `CHANGELOG.md`: progress notifications now appear for any Doorstop operation still running after 1 s (including server start/restart, Refresh, Recheck Problems, document view open/save, diagram load), and no longer flash for operations that finish sooner.
- [X] T015 Walk through [quickstart.md](quickstart.md) manual rows 1–8 in the Extension Development Host.

---

## Dependencies & Execution Order

- **Phase 2** (T001) blocks everything; T002 can be written alongside T001.
- **US1** (T003–T010) and **US2** (T011) depend only on T001 and are independent of each other.
- Within US1: T003 → T004 (same file); T006 → T007 (same file); T005, T008, T009, T010 are parallel. T005 and T011 touch the same file (`src/extension.ts`) — do them one after the other.
- **Polish** (T012–T015) after all stories.

## Parallel Example: User Story 1

```text
After T001:
  T003 → T004   src/doorstopCommands.ts
  T005          src/extension.ts
  T006 → T007   src/documentViewProvider.ts
  T008          src/diagrammPanel.ts
  T009          src/deriveProvider.ts
  T010          src/reviewLensProvider.ts
```

## Implementation Strategy

1. **MVP**: T001–T004 — helper, its CI test, and the existing `run()` commands plus Refresh on the new rule. Ship-able on its own.
2. Finish US1 (T005–T010), then US2 (T011).
3. Polish (T012–T015).

## Phase 6: Convergence

- [X] T016 In `src/progress.ts`, keep a module-level `Set<string>` of titles whose notification is currently showing; when the 1 s timer fires and the title is already in the set, skip the toast (the work still runs and its result/error is returned unchanged); add the title before calling `progress(...)` and remove it when that toast's task settles. Add a fourth case to `src/test/progress.test.ts`: two overlapping 1500 ms works with the same title → the fake is called exactly once; a third with a different title → called once more per FR-008 (partial)
- [X] T017 In `src/documentViewProvider.ts` `saveView`, also wrap the snapshot load before the confirmations (`snapshot = await loadSnapshot(state.prefix)`, ~line 450) and the post-write reload (`fresh = await loadSnapshot(state.prefix)`, ~line 530) each in `withDelayedProgress(\`Doorstop: Saving document ${state.prefix}…\`, () => loadSnapshot(state.prefix))`, leaving the confirmation prompts between them unwrapped and the existing `catch`/`refuse` paths unchanged per FR-001 (partial)

## Phase 7: Convergence

- [ ] T018 In `src/test/progress.test.ts`, add trace comments to the existing tests: `// Spec 026 FR-001` (slow work test), `// Spec 026 FR-002` and `// Spec 026 FR-005` (fast work test, only if it also covers prompts; otherwise FR-002 only), `// Spec 026 FR-003` (title assertion), `// Spec 026 FR-004` (failing work test), `// Spec 026 FR-008` (overlapping same-title test) per Constitution VIII (partial)
- [ ] T019 Add a CI test (e.g. `src/test/progressWiring.test.ts`, trace `// Spec 026 FR-007`) that reads `src/` sources and asserts `vscode.window.withProgress(` appears only in `src/progress.ts` and the Install Server Package call in `src/extension.ts`, and that Create Document, Add Item, Review, Clear, Link, Reorder, Import, Export, Publish and Generate Status Report call `withDelayedProgress` per FR-007 (missing)
- [ ] T020 Add a CI test traced `// Spec 026 FR-005` that proves prompts/pickers/confirmations are outside `withDelayedProgress` (e.g. a wrapped callback is not entered before `showInputBox`/`showQuickPick` in the Add Item, Link and Save View paths, or a source check that those calls are not inside the wrapper) per FR-005 (missing)
- [ ] T021 Add a CI test traced `// Spec 026 FR-006` asserting the debounced re-check and automatic tree reload paths do not call `withDelayedProgress` or `withProgress` per FR-006 (missing)
- [ ] T022 Add a CI test traced `// Spec 026 FR-009` asserting the out-of-scope commands (toggles, timing commands, empty diagram/filter notebook creation, Insert Item Here / New Item Below) do not call `withDelayedProgress` per FR-009 (missing)
- [ ] T023 Add a CI test traced `// Spec 026 FR-003` asserting every `withDelayedProgress(` title string in `src/` starts with `Doorstop:` or is a Starting/Restarting Doorstop server message and contains no raw command ID per FR-003 (missing)
- [ ] T024 Add a CI test traced `// Spec 026 FR-001` asserting server start/restart in `src/extension.ts` and the listed commands use `withDelayedProgress` per FR-001 (partial)
