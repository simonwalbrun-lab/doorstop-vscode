---

description: "Task list template for feature implementation"
---

# Tasks: Prompt to Install Missing Server Package

**Input**: Design documents from `/specs/016-install-server-package/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [quickstart.md](./quickstart.md)

**Tests**: Included. Constitution Principle VI (Every Feature Ships With a CI-Runnable Test) is NON-NEGOTIABLE for this project, so the automated tests identified in `quickstart.md` are mandatory, not optional.

**Organization**: Tasks are grouped by user story (US1/US2/US3, matching spec.md's priorities P1/P1/P2) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Every task includes an exact file path

## Path Conventions

Single project (VS Code extension). All paths are repository-root-relative:
`src/doorstopServer.ts`, `src/extension.ts`, `src/test/`, `.vscode-test.mjs`.

---

## Phase 1: Setup

**Purpose**: Register the new test suite so later tasks have somewhere to add assertions.

- [X] T001 Add a `serverPackageInstall` label to `.vscode-test.mjs` — `files: 'out/test/serverPackageInstall.test.js'`, no `workspaceFolder` (mirrors the existing `diagramLayout` entry, since this suite needs no fixture workspace or running server).

**Checkpoint**: `npm test` runs (and currently skips, file not yet present) the new suite alongside the existing four.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The package-presence check every user story's notification decision depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Implement `isServerPackageInstalled(pythonPath: string, spawnFn = spawn): Promise<boolean>` in `src/doorstopServer.ts`, exported alongside `DoorstopServer`. Per [data-model.md](./data-model.md) §1: spawn `pythonPath -c "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('doorstop_server') else 1)"`; resolve `true` when the process exits with code `0`; resolve `false` (never reject/throw) on any other exit code or a spawn `error` event.
- [X] T003 Add unit tests for `isServerPackageInstalled` in `src/test/serverPackageInstall.test.ts`, using a fake `spawnFn` that returns a scripted child-process-like emitter (no real Python process): (a) fake process exits `0` → resolves `true`; (b) fake process exits `1` → resolves `false`; (c) fake spawn emits an `error` event → resolves `false`, not a rejection. Depends on T002.

**Checkpoint**: The presence-check primitive exists and is proven correct in isolation; every user story below builds its notification/install flow on top of it.

---

## Phase 3: User Story 1 - One-click install when the server package is missing (Priority: P1) 🎯 MVP

**Goal**: A server-start attempt against an interpreter missing `doorstop-vscode-server` shows a notification naming the missing package with an "Install" and "Dismiss" option, instead of the current generic startup-failure warning.

**Independent Test**: Select a Python interpreter without the package installed, open a workspace with a `.doorstop.yml` marker, and confirm the missing-package notification appears (per [spec.md](./spec.md) US1's Independent Test) instead of the generic "Doorstop server unavailable: ..." warning.

### Implementation for User Story 1

- [X] T004 [US1] In `src/extension.ts`, inside `startDoorstopServer` (after `getActivePythonPath()` resolves, before the existing `doorstopServer.start`/`restart` call): call `isServerPackageInstalled(pythonPath)`. When it resolves `true`, fall through to the existing start/restart call unchanged (FR-003). When it resolves `false`, call `vscode.window.showWarningMessage` naming `doorstop-vscode-server` as not installed in the selected interpreter, with `'Install'` and `'Dismiss'` actions, and `return` without calling `doorstopServer.start`/`restart` (FR-002, FR-009) — leave the `'Install'` branch of the resolved selection as the integration point User Story 2 completes (T008); for now it is equivalent to Dismiss (server stays stopped either way).
- [ ] T005 [US1] Run the manual US1 walkthrough in [quickstart.md](./quickstart.md) against both an interpreter missing the package and one that has it; confirm the notification appears/doesn't appear as expected and Dismiss leaves the server stopped. Depends on T004.

**Checkpoint**: At this point, User Story 1 is fully functional and independently testable per its Independent Test above — run the manual US1 walkthrough in [quickstart.md](./quickstart.md).

---

## Phase 4: User Story 2 - Installing from the notification starts the server (Priority: P1)

**Goal**: Clicking "Install" on the User Story 1 notification installs `doorstop-vscode-server` into the selected interpreter with visible progress, then automatically starts the server on success.

**Independent Test**: Click "Install" on the notification and confirm the package installs into the selected interpreter, progress is visible while it runs, and the server becomes reachable afterward with no further manual action (per spec.md US2's Independent Test).

### Implementation for User Story 2

- [X] T006 [US2] Implement `installServerPackage(pythonPath: string, options?: { onOutput?: (chunk: string) => void; spawnFn? }): Promise<{ success: boolean; output: string }>` in `src/doorstopServer.ts`. Per [data-model.md](./data-model.md) §2: spawn `pythonPath -m pip install doorstop-vscode-server`; stream stdout+stderr chunks to `options.onOutput` when provided; accumulate captured output tail-truncated to 2000 characters (mirroring `DoorstopServer`'s existing `recentStderr` truncation convention); resolve `{ success: true, output }` on exit code `0`, `{ success: false, output }` on any other exit code or a spawn error — never reject. Guard concurrency with a module-level `Map<string, Promise<{success:boolean; output:string}>>` keyed by `pythonPath`: a call for a `pythonPath` already in the map returns the existing promise instead of spawning a second process (FR-008); remove the map entry once the promise settles, for either outcome.
- [X] T007 [US2] Add unit tests for `installServerPackage`'s success and concurrency behavior in `src/test/serverPackageInstall.test.ts`: (a) fake spawn exits `0` → resolves `{ success: true, ... }`; (b) two concurrent calls for the same `pythonPath` result in exactly one underlying spawn; (c) two concurrent calls for two different `pythonPath` values each spawn independently. Depends on T006.
- [X] T008 [US2] In `src/extension.ts`, complete the `'Install'` branch left open by T004: on that selection, run `vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, cancellable: false, title: ... }, () => installServerPackage(pythonPath, { onOutput: progress.report-style callback }))`; on `{ success: true }`, show an information message and invoke the same start/restart call `startDoorstopServer` would have made had the package already been present (FR-006). Depends on T004, T006.

**Checkpoint**: At this point, User Stories 1 AND 2 both work independently and together — run the manual US2 walkthrough in [quickstart.md](./quickstart.md).

---

## Phase 5: User Story 3 - Clear feedback when the install itself fails (Priority: P2)

**Goal**: A failed install (e.g. no network) shows an actionable error with captured output, does not start the server, and can be retried on the next attempt rather than being remembered as a permanent failure.

**Independent Test**: Simulate a failing install after clicking "Install" and confirm the user sees an actionable error including relevant output, the server does not start, and a subsequent attempt retries the install (per spec.md US3's Independent Test).

### Implementation for User Story 3

- [X] T009 [US3] Add unit tests for `installServerPackage`'s failure and retry behavior in `src/test/serverPackageInstall.test.ts`: (a) fake spawn exits non-zero → resolves `{ success: false, output }` with the captured output, not a rejection (FR-007); (b) a second call for the same `pythonPath` made *after* the first call's promise has already settled spawns again rather than reusing the settled result (proves retryability, distinct from T007's in-flight-dedupe case). Depends on T006.
- [X] T010 [US3] In `src/extension.ts`, extend T008's `withProgress` handling: on `{ success: false, output }`, show an error notification including the (already tail-truncated) `output` and do not call `doorstopServer.start`/`restart` (FR-007). Verify no additional state is set that would prevent T004's check from running again on the next server-start or "Doorstop: Restart Server" attempt (FR-007 "retryable"). Depends on T008.

**Checkpoint**: All three user stories are independently functional — run the manual US3 walkthrough in [quickstart.md](./quickstart.md).

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final verification across all three stories.

- [X] T011 [P] Run `npm run compile` (check-types + lint + esbuild) and fix any reported issues.
- [X] T012 [P] Run `npm test` and confirm the new `serverPackageInstall` suite passes alongside the existing `unit`, `regressionFixture`, `diagramLayout`, and `reviewLensScan` suites.
- [ ] T013 Walk through the remaining "Regression checks" section of [quickstart.md](./quickstart.md) end-to-end (package-already-installed path unchanged; unrelated startup failures like a taken port still use the existing error path, not the install flow).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational (T002). No dependency on US2/US3.
- **User Story 2 (Phase 4)**: Depends on Foundational (T002) **and** on US1's T004 (it completes the `'Install'` branch T004 leaves open) — not independent of US1, unlike the usual "stories are independent" default; this mirrors how spec 015's later user stories built on its earlier ones.
- **User Story 3 (Phase 5)**: Depends on US2's T006 and T008 (it extends the same `withProgress` handling with the failure branch).
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Within Each User Story

- Implement the underlying `doorstopServer.ts` function before writing its unit tests (T002→T003, T006→T007/T009).
- Wire the `extension.ts` UI behavior after both the function it calls and the notification branch it extends exist (T004 before T008; T008 before T010).

### Parallel Opportunities

- T011 and T012 (Polish) can run in parallel — independent validation steps.
- Everything else in this feature is a short, mostly-sequential chain (one check function, one install function, one notification flow extended across three stories); there is little genuine file-level parallelism to exploit given the small scope.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (T002, T003).
3. Complete Phase 3: User Story 1 (T004).
4. **STOP and VALIDATE**: Run the US1 manual walkthrough in quickstart.md — confirms the notification replaces the generic error.
5. This alone already improves on today's behavior (a named, actionable prompt instead of a raw failure) even before Install is wired up.

### Incremental Delivery

1. Setup + Foundational → presence-check primitive ready.
2. Add US1 → notification appears → validate → (optional intermediate demo).
3. Add US2 → Install button actually installs and starts the server → validate → full happy path complete.
4. Add US3 → failures are actionable and retryable → validate → feature complete per spec.
5. Polish: compile, full test run, regression walkthrough.

---

## Notes

- [P] tasks = different files, no dependencies on incomplete work.
- [Story] label maps each task to its user story for traceability back to spec.md.
- This feature does not fit the "stories are independent" ideal perfectly: US2 and US3 build directly on the notification/progress UI US1 and US2 introduce in `src/extension.ts`, because there is only one control-flow decision point (`startDoorstopServer`) for all three stories to extend. Each story is still independently *testable* per its Independent Test in spec.md, even though later stories are not independently *implementable* without the earlier ones' code.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
