# Implementation Plan: Doorstop Server Connection & Lifecycle

**Branch**: `N/A (retroactive)` | **Date**: 2026-10-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-server-connection-lifecycle/spec.md`

**Note**: Retroactive plan. It describes the implementation that already exists; it is not a new design. Remaining work is test coverage and traceability only (constitution v1.4.0, Principle VIII).

## Summary

The extension spawns a local FastAPI/uvicorn process (`python -m doorstop_server`) bound to `127.0.0.1:7867`, waits for `GET /health`, and then lets every other feature talk to it over HTTP. Restart and shutdown are handled by `DoorstopServer` (`src/doorstopServer.ts`) and wired up in `src/extension.ts`. The server side serialises requests (`lock.py`), exempts `/health`, and turns every failure into `{error:{code,message}}` (`errors.py`).

## Technical Context

**Language/Version**: TypeScript (VS Code extension host, Node `fetch`/`child_process`); Python 3 for the server

**Primary Dependencies**: `vscode` API, `ms-python.python` extension (interpreter lookup); server: `doorstop`, `fastapi`, `uvicorn`, `starlette`

**Storage**: N/A (the Doorstop repository on disk; the server keeps only a tree cache)

**Testing**: extension-host tests (`src/test/*.test.ts`, CI job `extension-integration-tests`); `pytest server/tests` (CI job `server-tests`)

**Target Platform**: VS Code desktop on Windows, macOS, Linux

**Project Type**: VS Code extension plus a bundled Python web service (`server/` submodule)

**Performance Goals**: ready within a few seconds (SC-001); recovery from a stuck server in under 30 s (SC-002)

**Constraints**: fixed port 7867, single uvicorn worker, startup timeout 15 s (retry every 100 ms), SIGKILL 5 s after SIGTERM

**Scale/Scope**: one server per workspace (first folder only); multi-root not handled

## Constitution Check

Gate evaluated against `.specify/memory/constitution.md` v1.4.0.

| Principle | Status |
|-----------|--------|
| III Structured errors (FR-010) | Pass: `errors.py` |
| VI CI-runnable test | Partial: server tests exist; lifecycle tests are missing |
| VII Long-running operations visible | Pass: `withDelayedProgress` wraps start and restart |
| VIII Every FR has a traceable test | **Open work**: FR-001..007 and FR-011 have no test, and no test carries a `Spec 001 FR-NNN` trace comment. Tracked as tasks, not a justified violation. |

Post-design re-check: same result. Closing the open tasks resolves the gate.

## Implementation map (as built)

| FR | Implementation | Existing test |
|----|----------------|---------------|
| FR-001 | `findDoorstopMarker` in `src/extension.ts` (`**/.doorstop.yml`, excludes node_modules/.git/out/dist/.venv/venv); `activationEvents: workspaceContains:**/.doorstop.yml` | none |
| FR-002 | `getActivePythonPath` (ms-python API), then `DoorstopServer.start` spawns `<python> -m doorstop_server --project --host --port` | none (the fixture suite uses its own `resolvePythonCommand`) |
| FR-003 | `waitForHealthy` polls `/health`; `start()` resolves only once healthy | indirect only (regressionFixture `suiteSetup`) |
| FR-004 | `startDoorstopServer` warns (no workspace, no marker, no interpreter) and returns | none |
| FR-005 | command `doorstop.restartServer`, then `DoorstopServer.restart` (`stopProcess` then `start`) | none |
| FR-006 | `recentStderr` (last 2000 chars) in `outputSuffix()`, plus `portInUseHint`; shown via `showWarningMessage` | none |
| FR-007 | `DoorstopServer` is in `context.subscriptions`, so `dispose()` runs `stopProcess` (SIGTERM, SIGKILL after 5 s); `deactivate()` is empty | none |
| FR-008 | `SerializeRequestsMiddleware` lock; `cli.py` uses `workers=1, reload=False` | `server/tests/test_serialization.py::test_concurrent_add_requests_are_processed_one_at_a_time` |
| FR-009 | `_UNLOCKED_PATHS = {"/health"}` | `test_serialization.py::test_health_is_not_blocked_by_the_lock`, `test_health.py` |
| FR-010 | `errors.py` handlers (`DoorstopApiError`, `DoorstopError` to 400, `Exception` to 500) | `server/tests/test_errors.py` (400, 500, 422) |
| FR-011 | `/health` never loads the tree; other routes load it via `doorstop_tree.load_tree` and surface `DoorstopError` as 400 `DOORSTOP_ERROR` | none |

### Spec drift to note (spec not edited here)

- Spec says the tree is rebuilt fresh on every request. The code now caches it keyed on file mtime/size (`doorstop_tree.py`, `test_tree_cache.py`); hand-edits are still picked up, so behaviour holds.
- US1 scenario 2 says "no error is shown" without a marker, but FR-004 says to warn. The extension only auto-activates when a marker exists, so the "No .doorstop.yml project" warning appears only via the restart command. A test should pin the actual behaviour.
- Spec 016 added a pre-start "is the package installed" check and an install prompt in the same flow; out of scope here.

## Project Structure

### Documentation (this feature)

```text
specs/001-server-connection-lifecycle/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/server-http.md
└── tasks.md
```

### Source Code (existing)

```text
src/
├── doorstopServer.ts      # DoorstopServer: spawn, health wait, restart, dispose, request
├── extension.ts           # marker search, python lookup, startDoorstopServer, restart command
└── test/
    ├── regressionFixture.test.ts
    └── serverLifecycle.test.ts   # NEW (open work)
server/src/doorstop_server/{cli,app,lock,errors,doorstop_tree}.py
server/tests/{test_serialization,test_errors,test_health,test_tree_cache}.py
server/tests/test_tree_root.py    # NEW (open work)
```

**Structure Decision**: keep the existing layout. New lifecycle tests go in one extension-host file that drives `DoorstopServer` directly; FR-011 goes in one new pytest file.

## Complexity Tracking

No unjustified violations.
