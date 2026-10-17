# Implementation Plan: Background Problem Checking and Reporting Modes

**Branch**: `032-background-validation` | **Date**: 2026-10-17 | **Spec**: [spec.md](spec.md)

## Summary

The check moves into a long-lived worker process with its own Doorstop tree
(Principle I v1.6.0). `/validate` no longer takes the request lock. It hands a job
to the worker and waits on a pipe, so other requests keep running at their normal
speed. The worker brings its own tree up to date with the same partial reload as
the server. It stops within one item when the job is no longer wanted:
superseded, changed, or the client disconnected. Reads and mutations in the
server share one tree, which reloads only the documents whose files changed. The
extension gets a three-way `doorstop.problemReporting` mode with a tree-view
button that cycles it, a status-bar spinner for automatic checks, and a
cancellable check on Refresh.

Rework (2026-10-17): the already implemented design that yielded the request
lock between documents is replaced. The extension side, the partial reload and
the performance fixes stay as they are.

## Technical Context

**Language/Version**: TypeScript (VS Code Extension API) and Python ≥3.10 (dev venv 3.14)
**Primary Dependencies**: FastAPI/Starlette, Doorstop 3.2, stdlib `multiprocessing` and `ctypes`. No new dependencies
**Storage**: Doorstop files on disk, plus the VS Code workspace settings
**Testing**: `server/tests` (pytest against real temporary Doorstop projects); `src/test` (vscode-test)
**Target Platform**: VS Code desktop, local server process plus one worker process; Windows, macOS, Linux (spawn start method everywhere)
**Project Type**: VS Code extension + local Python server
**Performance Goals**: SC-001 (median ≤ 1.2× without a check, 2+ cores, measured as in [R8](research.md#r8-measuring-no-influence-sc-001-principle-i-v160)); FR-003 (stop within 1 s); SC-006 (partial reload ≤ ½ of a full reload)
**Constraints**: Principle I: one request at a time; background validation separate, read-only, on its own copy, never holds a lock requests need
**Scale/Scope**: ≥1,500 items across ≥5 documents. Memory: a second tree in the worker

## Constitution Check

| Principle | Status | How |
|---|---|---|
| I One at a time | PASS | Requests stay serialized. Only `/validate` leaves the lock, as the background-validation exception allows |
| I Background validation (v1.6.0) | PASS | Separate process ([R2](research.md#r2-a-separate-check-process-fr-001-principle-i-v160)), with its own tree loaded from disk and read-only settings. It holds no request lock and doesn't run on the event loop. Its only lock is the validator's own, which only `/validate` uses. "No influence" means within the constitution's 20% tolerance, measured as in R8. The worker runs at lower OS priority |
| I Cancellation | PASS | C1–C4 in [R3](research.md#r3-cancellation-principle-i-fr-002003). All cancel only the read-only check, never a mutation, and answer `409 CANCELLED`. A result from a changed state is never returned (C2/C2') |
| II No reinvention | PASS* | Uses Doorstop's own `get_issues` with its `item_hook` parameter, and Doorstop's item loading. *Private `_iter`/`_item_cache`, see Complexity Tracking |
| III Error handling | PASS | `CANCELLED` is a structured response. A crashed worker becomes a structured 500 and is restarted on the next check. A failed partial reload falls back to a full one, and a failed mutation invalidates the cache |
| IV Dependencies | PASS | stdlib only |
| V/VI/VIII Tests | PASS | Every FR is covered by a test with `Spec 032 FR-xxx` (table below) |
| VII Visible progress | PASS | Explicit checks show a cancellable toast. Automatic checks are exempt background work and show the window spinner |

Re-checked after the design: no change.

## Project Structure

```text
specs/032-background-validation/  plan.md research.md data-model.md quickstart.md contracts/

server/src/doorstop_server/
├── validation_worker.py # NEW: worker loop (own tree, refresh, item_hook cancel, priority) + Validator (start, check, cancel)
├── routers/validation.py# send a job to app.state.validator, poll, map replies → 200 / 409 / 500; no tree dependency
├── lock.py              # /validate in _UNLOCKED_PATHS; drop request.state.request_lock
├── deps.py              # every tree_version bump also cancels the running check ("changed")
├── validation_rules.py  # collect_document_issues(document, item_hook=None)
├── app.py               # app.state.validator; drop validation_generation
└── doorstop_tree.py     # unchanged (refresh_tree reused by the worker)
server/tests/
├── test_validation_background.py   # rewritten for the worker (see map)
└── test_tree_reload.py             # unchanged
server/tools/profile_server.py      # "validate" scenario profiles the worker's check in-process

src/  (unchanged by the rework)
├── problemsProvider.ts  # mode, AbortController, keep unfiltered result, re-filter, window spinner
├── doorstopServer.ts    # request(..., { signal }) → never shared
├── progress.ts          # withDelayedProgress(..., { cancellable })
├── extension.ts         # mode commands, context key, config listener; doorstop.recheckProblems removed
├── doorstopCommands.ts  # Refresh → explicit check; status report via the provider
├── statusReport.ts      # "Problem reporting is off" section
└── test/problemReporting.test.ts
```

## Requirement → test map (Principle VIII)

| FR / SC | Test |
|---|---|
| 001, SC-001 | `test_validation_background.py`: while a check keeps a core busy (CPU-bound test `item_hook`), the median of uncached `GET /tree?fields=…` stays ≤ 1.2× its median without a check, plus 10 ms. A `PATCH` during a check is answered without waiting for it. The check runs in another process (`os.getpid()` differs) |
| 002, 003 | same file: a second `/validate` makes the first answer 409 `superseded` within 1 s. A disconnect gives `disconnected`. The worker survives a cancel, and the next check reloads nothing (warm copy) |
| 003, 005 | same file: a `PATCH` during a check makes it answer 409 `changed` within 1 s, and the edit is on disk exactly once. An outside file edit during a check gives `changed` (C2'). SC-002: a `/tree` reload of a save the check already sees does not cancel it |
| 006 | same file plus the existing `test_validation.py`: worker results equal `collect_issues` on the spec 014 regression fixtures |
| 020 (copy) | same file: after an item edit, the worker reports a partial reload (job reply carries the refresh kind), and its results equal a fresh process's |
| edge: worker dies | same file: kill the worker; the next `/validate` answers 200 from a new worker |
| 004, 007, 008, 009 | `problemReporting.test.ts` (unchanged) |
| 010–019 | `problemReporting.test.ts`, `packageMenus.test.ts`, `statusReport.test.ts` (unchanged) |
| 020–023 | `test_tree_reload.py` (unchanged) |

## Complexity Tracking

| Deviation | Why needed | Simpler alternative rejected because |
|---|---|---|
| A second process holding a second tree | Principle I v1.6.0: response times must not depend on a running check; a thread shares the interpreter lock | Yielding between documents still blocks on one huge document. A process per check pays a full load each time (R2) |
| Uses Doorstop private `Document._iter(reload=True)` and `Tree._item_cache` | Doorstop 3.2 has no public "reload one document's items" call | A full `doorstop.build()` is exactly the cost FR-020 removes. Pinned to 3.2 like `CHECK_TABLE`, and covered by `test_tree_reload.py` |
| Mutations now share the cached tree | FR-023: no reload if nothing changed. Before this change every mutation rebuilt the tree | A fresh tree per mutation is a full reload. Drift is prevented by the fingerprint check before each request and by invalidating after a failed mutation |
