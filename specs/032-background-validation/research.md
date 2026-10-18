# Research: Background Problem Checking and Reporting Modes

## R1 Why the server blocks today

`SerializeRequestsMiddleware` ([lock.py](../../server/src/doorstop_server/lock.py))
holds one `asyncio.Lock` for each whole request. `GET /validate` runs synchronous
Doorstop code inside an `async def`, so for the entire check the lock is held and
the event loop is blocked. Every other request waits.

## R2 A separate check process (FR-001, Principle I v1.6.0)

- **Decision**: a long-lived worker process, started with
  `multiprocessing.get_context("spawn")` on the first `/validate`, does the whole
  check. It keeps its own Doorstop tree and brings it up to date before every
  check, with the same `fingerprint()` and `refresh_tree()` as the server (R4).
  `/validate` is taken out of `SerializeRequestsMiddleware` (`_UNLOCKED_PATHS`,
  like `/health`). It never touches the shared tree. It sends a job to the worker
  over a `multiprocessing.Pipe` and waits for the answer with
  `run_in_threadpool(conn.poll, 0.2)`, so neither the event loop nor the request
  lock is held.
- **Why a process**: in CPython a thread shares the interpreter lock with request
  handling. The check is pure-Python CPU work (Doorstop's per-item link scan), so
  a thread would slow every request. The constitution names a process as the
  expected way. Its own interpreter, its own tree, read-only: no request object
  is ever shared with it.
- **Priority**: the worker lowers its own OS priority when it starts
  (`os.nice(10)` on POSIX; `SetPriorityClass(BELOW_NORMAL)` via `ctypes` on
  Windows), so the OS schedules it behind the server and VS Code if CPU gets short.
- **Stays loaded** (clarification 2026-10-17): later checks pay only the partial
  reload. The worker is started lazily, so Off and On demand without a check
  never start it. If the process died, the next check starts a new one, which
  loads the whole tree once. It ends with the server: the pipe breaks
  (`EOFError`) and it is a daemon process.
- **Read-only settings**: the worker still runs every check inside
  `read_only_validation()`, so it never writes files. That scope now covers the
  whole check, because nothing else runs in that process.
- **Spawn safety**: the child imports `doorstop_server.validation_worker` only.
  The server starts as `python -m doorstop_server`, whose `__main__` is guarded,
  so spawn does not start a second server.
- **Rejected**:
  - Yielding the request lock between documents (the v1.5.0 design): one huge
    document still blocks everyone.
  - A thread: the interpreter lock (see above).
  - A fresh process per check: each check would pay a full load first (≈5 s on
    1,500 items).
  - `ProcessPoolExecutor`: it can't keep a tree between jobs in a way we
    control, and it can't stop a running job.

## R3 Cancellation (Principle I, FR-002/003)

Each check gets a job number. A shared `multiprocessing.Value("i")` named
`wanted` holds the number of the job whose result is still wanted. The worker
passes Doorstop an `item_hook` (`Document.get_issues(item_hook=...)`). Doorstop
calls it before every item, and it raises when `wanted` no longer matches the
job, so a check stops within one item's check, which is milliseconds. The handler
answers 409 as soon as it sees the change, within one poll of 0.2 s, without
waiting for the worker. The worker sends no reply for a cancelled job, and the
handler ignores replies for older jobs.

| # | Trigger (sets `wanted` to another number) | Reason (Principle I) |
|---|---|---|
| C1 | A newer `/validate` starts | superseded |
| C2 | A mutation through the server (`deps.get_tree`) | superseded by a change |
| C2' | The worker's fingerprint after the check differs from the one before (an edit outside the server) | superseded by a change |
| C3 | `await request.is_disconnected()` in the poll loop: the user cancelled, or the mode switched to Off | user cancel / feature switched off |
| C4 | The server stops: the pipe breaks and the worker exits | shutdown |

A cancelled check answers `409 {"error": {"code": "CANCELLED", "message": "<reason>"}}`.

- **A read-side reload does not cancel.** After a save, the extension sends
  `/validate` and `/tree` together. `/tree` then reloads the saved file, but the
  worker took its own fingerprint after the save and already checks the new
  content. Cancelling there would run every automatic check twice (SC-002). A
  change that really lands during the check is caught by C2' when the check ends.
- Only `/validate` handlers use the worker. An `asyncio.Lock` inside the
  validator lets one handler at a time talk to the pipe. A new check first cancels
  the old one, then waits at most one poll for that lock. No other request ever
  takes this lock (Principle I v1.6.0).
- A full tree load in the worker can't be interrupted. Its result is kept for
  the next check, so a cancel during the load only delays that answer. The
  handler still answers 409 at once.

## R4 Partial reload (FR-020–023)

- **Decision**: the existing `fingerprint()` dict is diffed against the previous
  one. Each changed path is assigned to the *deepest* document folder that
  contains it.
  - Any changed `.doorstop*` file → full reload. This covers a config change, an
    added or removed document, and a skip marker.
  - A changed file inside a document → reload only that document:
    `document._iter(reload=True)`, then clear `tree._item_cache` **and refill
    it** from the items in memory. Clearing drops deleted UIDs and stale
    "unknown" entries. Clearing alone made every later lookup scan the documents
    item by item: `GET /tree` after an edit took 4.4 s instead of 0.4 s on 1,500
    linked items (found by profiling).
  - Files a successful mutation wrote are taken into the fingerprint, unless one
    is a `.doorstop*` file, so the next request does not re-read them.
  - A changed file outside every document and not `.doorstop*` → no reload,
    because it cannot be part of the tree. (`ref` checks read files at validation
    time, not from the tree.)
  - Any exception during a partial reload → full reload (Principle III).
- **Mutations share the tree too**: today `get_tree` builds a fresh tree for every
  mutating request. That is a full reload even when nothing changed, which
  FR-023 forbids. Both dependencies now use the same refreshed shared tree. If a
  mutation raises, the cache is invalidated, so the next request does a full
  reload and memory never drifts from disk. Every mutation bumps `tree_version`
  and cancels a running check (C2). A reload on the read path does not (R3).
- **The check's own copy** (FR-020) uses the same `refresh_tree()` in the worker,
  with its own fingerprint. A failed check drops that fingerprint, so the next
  check does a full reload.
- **Private Doorstop API**: `Document._iter(reload=True)` and `Tree._item_cache`
  are not public. They are pinned to Doorstop 3.2, like `CHECK_TABLE`. See
  Complexity Tracking.

## R5 Client: superseding and cancelling

- The `/validate` request gets an `AbortSignal`. A request with a signal is
  never shared through `inflightGets`. Otherwise a new check after a save would
  join the older in-flight check and show its out-of-date result.
- An abort (user cancel, Off) or a `CANCELLED` response is not a failure: the
  previous problems are kept and no message is shown (FR-009). If the server
  reports a change-based cancellation (C2) and the pass is still the newest, the
  client schedules the check again, so problems still catch up after outside
  edits.

## R6 Indicator and progress (FR-007/008, Principle VII)

- Automatic check: `withProgress({ location: ProgressLocation.Window })` after
  1 s. This is VS Code's own status-bar spinner; it takes no focus and needs no
  new UI code.
- Explicit check (Refresh, status report): `withDelayedProgress` gets an
  optional `cancellable` flag that passes VS Code's cancellation token through.

## R7 Mode setting and button (FR-010–019)

- The setting is `doorstop.problemReporting`: `"automatic" | "onDemand" | "off"`,
  default `"automatic"`. It goes in the existing "Problems" configuration section.
- The button follows the existing auto-reveal pattern (spec 010): three commands
  with one icon each (`eye`, `eye-watch`, `eye-closed`), shown by the context key
  `doorstop.problemReporting`. The command's title is its tooltip, and it names
  the current and the next mode. A click writes the next mode with
  `ConfigurationTarget.Workspace`. `onDidChangeConfiguration` updates the context
  key, so changes from any source move the button (FR-019).
- **Per-kind filter**: the provider keeps the *unfiltered* last result. A change
  to `doorstop.problems` re-filters that result without a new check, so the On
  demand mode never checks just because a box was ticked.
- **Status report**: it calls the provider (`refreshNow` + `getLastRefresh`)
  instead of its own `/validate`, so modes and cancellation apply in one place.
  In Off mode it writes "Problem reporting is off" (FR-016).
- **Existing `doorstop.recheckProblems`** (spec 014): removed, as the user
  decided (FR-014). Delete its registration in `extension.ts`, its entry in
  `package.json`, the comment in `problemsProvider.ts`, and the README line.
  Refresh is the only explicit check.

## R8 Measuring "no influence" (SC-001, Principle I v1.6.0)

- **Automated**: `test_validation_background.py` gives the worker a CPU-bound test
  `item_hook` (a busy loop of about 50 ms per item), so the check keeps one core
  fully busy, like a real check on a huge tree. It measures the median of 15
  uncached read requests (`GET /tree?fields=f<n>`, a new field name each time, so
  the `/tree` cache never answers) without a check, then during one. It asserts
  that the median during the check is at most 1.2× the median without one, plus
  10 ms of slack for timer noise. The hook reaches the child by import path
  (spawn pickles functions by name), so production code has only an optional
  `item_hook` parameter.
- **Manual**: quickstart row 1 on a large tree, reading `wait` and `work` in
  Output → Doorstop timing (spec 023) with and without a check.
