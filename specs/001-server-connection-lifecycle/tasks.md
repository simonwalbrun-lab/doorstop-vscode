---

description: "Task list for 001 - server connection and lifecycle (retroactive; feature already implemented)"
---

# Tasks: Doorstop Server Connection & Lifecycle

**Input**: Design documents from `/specs/001-server-connection-lifecycle/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/server-http.md](contracts/server-http.md)

**Scope**: The implementation is complete. `[X]` marks code or tests that already exist. Open `[ ]` tasks only close constitution v1.4.0 Principle VIII: every FR has a CI-run test whose comment reads `Spec 001 FR-NNN` (for example `// Spec 001 FR-005` in TypeScript, `# Spec 001 FR-005` in Python). Do not change runtime behaviour except the one small extraction in T012.

**Format**: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Server process wrapper exists: `DoorstopServer` (start, restart, dispose, request, health wait, stderr capture, port-in-use hint) in `src/doorstopServer.ts`
- [X] T002 Server app exists: `server/src/doorstop_server/{cli,app,lock,errors,doorstop_tree}.py` and `routers/health.py`
- [X] T003 CI runs both suites: `extension-integration-tests` and `server-tests` jobs in `.github/workflows/`

---

## Phase 2: Foundational (shared test helpers for the new extension-host tests)

- [ ] T004 Create `src/test/serverLifecycle.test.ts` (mocha `suite('Server connection & lifecycle (spec 001)')`) with shared helpers: a `pythonCommand()` equal to the one used by `src/test/regressionFixture.test.ts` (`resolvePythonCommand`; export it from a tiny shared module only if copying is not trivial), a fixture project path (`src/test/fixtures/regression` or whatever `FIXTURE_ROOT` is in `regressionFixture.test.ts`), and a `freePort()` picking a port other than `DOORSTOP_SERVER_PORT` so the suite never collides with the fixture suite's server. Every server it starts must be disposed in `teardown`.

**Checkpoint**: the file compiles and the empty suite runs in `npm test`.

---

## Phase 3: User Story 1 - Automatic startup (Priority: P1)

**Goal**: opening a Doorstop workspace starts a healthy server with no manual step.

**Independent Test**: `npm test` runs the cases below green.

Existing coverage:

- [X] T005 [US1] Indirect only: `suiteSetup` in `src/test/regressionFixture.test.ts` calls `DoorstopServer.start` and every test then relies on it being healthy. This is not a trace-tagged FR test, so T006..T011 stay open.

Open work:

- [ ] T006 [US1] Test FR-003 in `src/test/serverLifecycle.test.ts`: `new DoorstopServer({port})`, `await start(fixture, python)` then immediately `fetch('http://127.0.0.1:<port>/health')` returns ok and `isRunning === true`; and a stub interpreter that never serves (for example `python -c "import time; time.sleep(60)"` as `pythonPath` with `startupTimeoutMs: 500`) makes `start` reject with `Timed out waiting for Doorstop server`. Comment `// Spec 001 FR-003`.
- [ ] T007 [US1] Test FR-002 in `src/test/serverLifecycle.test.ts`: the server process is launched with the given interpreter and arguments. Use a stub "interpreter" wrapper is not possible, so assert via `GET /health` that `projectRoot` equals the `--project` path passed to `start`, and that `start` rejects with `Unable to start <path> -m doorstop_server` for a non-existent interpreter path. Also assert that `vscode.extensions.getExtension('ms-python.python')` handling is covered by T011. Comment `// Spec 001 FR-002`.
- [ ] T008 [US1] Test FR-006 in `src/test/serverLifecycle.test.ts`: (a) interpreter `python -c "import sys; sys.stderr.write('boom-marker'); sys.exit(3)"`, `start` rejects with a message containing `exited before becoming ready (code 3` and `boom-marker`; (b) start a first real server on port P, then a second `DoorstopServer({port: P})` against the same port: the rejection message contains `portInUseHint(P)` text (`Port <P> is already in use`); (c) timeout path (stub that sleeps, `startupTimeoutMs: 500`, writes to stderr first) includes the stderr tail. Comment `// Spec 001 FR-006`.
- [ ] T009 [US1] Extract the start preconditions from `startDoorstopServer` in `src/extension.ts` into a small pure function `resolveStartInputs({workspaceFolder, findMarker, getPythonPath})` in `src/doorstopServer.ts` (or a new `src/serverStartup.ts`) that returns `{pythonPath}` or `{warning: string}` using the exact existing messages ('No .doorstop.yml project was found in the workspace.' and `Doorstop server unavailable: <reason>`). `startDoorstopServer` calls it and shows `warning` with `showWarningMessage`. No behaviour change. Prerequisite for T010 and T011.
- [ ] T010 [US1] Test FR-004 in `src/test/serverLifecycle.test.ts` against `resolveStartInputs` with fakes: no workspace folder gives the marker warning; marker missing gives the marker warning; `getPythonPath` throwing `No active Python environment was selected for this workspace.` gives `Doorstop server unavailable: ...`; none of them throws, and a valid input returns the interpreter path. Comment `// Spec 001 FR-004`.
- [ ] T011 [US1] Test FR-001 and the interpreter half of FR-002 in `src/test/serverLifecycle.test.ts`: export `findDoorstopMarker(workspaceFolder)` (the `findFiles('**/.doorstop.yml', exclude node_modules/.git/out/dist/.venv/venv, 1)` logic currently a closure in `src/extension.ts`) next to `resolveStartInputs`, then assert it returns true for the fixture workspace folder and false for a temp folder (`fs.mkdtemp`) containing no marker, and that a marker only under `node_modules` is ignored. Comment `// Spec 001 FR-001`. Also add one case that `vscode.extensions.getExtension('ms-python.python')` missing yields the `The Python extension is not installed.` warning through `resolveStartInputs` (fake `getPythonPath`), tagged `// Spec 001 FR-002`.
- [ ] T012 [US1] Fold the T009/T011 extraction into one change set in `src/extension.ts` so `findDoorstopMarker`, `getActivePythonPath` (kept in `extension.ts` because it needs `vscode.extensions`) and the warnings behave exactly as before; run `npm run compile` and the existing regression suite to confirm no change.

**Checkpoint**: FR-001, FR-002, FR-003, FR-004, FR-006 each have a tagged test.

---

## Phase 4: User Story 2 - Manual restart (Priority: P2)

**Goal**: "Doorstop: Restart Server" recovers a running or stuck server without a window reload.

- [X] T013 [US2] Implemented: `doorstop.restartServer` command and `DoorstopServer.restart` (`src/extension.ts`, `src/doorstopServer.ts`)
- [ ] T014 [US2] Test FR-005 in `src/test/serverLifecycle.test.ts`: start a server, record a marker from `/health` (process identity is observable via `isRunning` plus a successful second `start`); call `restart(fixture, python)`; assert it resolves, `/health` is ok again, and the first process has exited (a request to the old process is impossible, so assert the port was re-bound by checking `restart` resolved only after `/health` answered). Also assert `(await vscode.commands.getCommands(true)).includes('doorstop.restartServer')`. Comment `// Spec 001 FR-005`.
- [ ] T015 [US2] Add to the T014 test a restart where the interpreter cannot serve (stub that sleeps, `startupTimeoutMs: 500`): `restart` rejects with a message containing the stderr tail (second half of FR-006; tag `// Spec 001 FR-006` as well).

---

## Phase 5: User Story 3 - Graceful shutdown (Priority: P3)

**Goal**: no orphaned server after the editor closes.

- [X] T016 [US3] Implemented: `context.subscriptions.push(doorstopServer)` in `src/extension.ts`; `DoorstopServer.dispose()` / `stopProcess()` (SIGTERM, SIGKILL after 5 s) in `src/doorstopServer.ts`
- [ ] T017 [US3] Test FR-007 in `src/test/serverLifecycle.test.ts`: start a server, `await server.dispose()`, then `isRunning === false` and `fetch(.../health)` rejects (port free), and a new `DoorstopServer` can bind the same port. Comment `// Spec 001 FR-007`.

---

## Phase 6: Server-side requirements (pytest, already running in CI)

- [X] T018 FR-008 implemented (`lock.py`, `cli.py` `workers=1`) and tested by `server/tests/test_serialization.py::test_concurrent_add_requests_are_processed_one_at_a_time`
- [X] T019 FR-009 implemented (`_UNLOCKED_PATHS`) and tested by `server/tests/test_serialization.py::test_health_is_not_blocked_by_the_lock` and `server/tests/test_health.py`
- [X] T020 FR-010 implemented (`errors.py`) and tested by `server/tests/test_errors.py` (400 DOORSTOP_ERROR, 500 INTERNAL_ERROR, 422)
- [ ] T021 [P] Add trace comments `# Spec 001 FR-008` above `test_concurrent_add_requests_are_processed_one_at_a_time` in `server/tests/test_serialization.py`
- [ ] T022 [P] Add trace comments `# Spec 001 FR-009` above `test_health_is_not_blocked_by_the_lock` in `server/tests/test_serialization.py` and above `test_health_reports_ok_and_project_root` in `server/tests/test_health.py`
- [ ] T023 [P] Add trace comments `# Spec 001 FR-010` above `test_doorstop_error_becomes_structured_400`, `test_unexpected_exception_becomes_structured_500` and `test_validation_error_on_bad_request_body_returns_422` in `server/tests/test_errors.py`
- [ ] T024 FR-011: create `server/tests/test_tree_root.py` using the `tmp_path`/app fixtures from `server/tests/conftest.py` (see how `test_serialization.py` builds its own app): build a project with two documents that both have no `parent:` (and a second case with every document naming a parent, so no root). With `TestClient`: `GET /health` returns 200; `GET /tree` and one other data route (for example `GET /documents`) return a 4xx/5xx JSON body of the shape `{"error": {"code": ..., "message": ...}}` (not 200, not a raw traceback). Comment `# Spec 001 FR-011`. If the server currently returns a 200 partial tree for either case, STOP and report it as a bug rather than weakening the assertion.

---

## Phase 7: Polish & traceability

- [ ] T025 Confirm every FR-001..FR-011 appears in a `Spec 001 FR-NNN` comment: `grep -rn "Spec 001 FR-" src/test server/tests` lists all eleven IDs.
- [ ] T026 Run `npm run compile`, `npm test` and `pytest server/tests`; all green in CI.
- [ ] T027 Spec follow-up (needs the owner's decision, not part of this task list's code): reconcile `spec.md` with the code, namely "tree rebuilt fresh on every request" (now cached by mtime/size) and US1 scenario 2 ("no error shown" vs FR-004 warning). Tracked here, not edited.

---

## Dependencies

- T004 before T006..T017. T009 before T010, T011, T012. T012 last in Phase 3.
- Phase 6 tasks are independent of the extension-host phases; T021..T024 can run in parallel with everything else.
- Stories are independent apart from the shared helpers in T004.

## Implementation strategy

MVP: T004, T006, T008, T017 (server up, failure text, shutdown), then T014, then the extraction T009/T012 with T010/T011, then Phase 6 and T025..T026.
