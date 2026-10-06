# Research: Execution Timing

All Technical Context unknowns are resolved below. No new dependency is introduced
anywhere (Constitution IV).

## R1 — Carrying server-side timings to the extension

- **Decision**: The server adds a standard W3C `Server-Timing` response header to every
  response, e.g.
  `Server-Timing: wait;dur=0.04, load;dur=81.3, work;dur=12.7, route;desc="GET /tree"`.
  The extension reads it in `DoorstopServer.request()` and attaches it to the operation
  that issued the request.
- **Rationale**: The extension already holds the response, so the link between an
  extension operation and its server request (FR-005) comes for free — no correlation
  IDs, no server-side store, no extra endpoint. Measurements live in the extension, so
  they survive a server restart (edge case). An older server simply sends no header →
  extension-side timing still works, server detail is absent (edge case).
- **Alternatives considered**:
  - Server keeps its own ring buffer + `GET /timing` endpoint: second store, needs a
    correlation ID, lost on restart. Rejected.
  - Server writes to its stdout log: not machine-joinable with extension entries. Rejected.

## R2 — Server stages and where they are measured

- **Decision**: Three stages, measured with `time.perf_counter()`:
  - `wait` — time spent acquiring the request lock in `SerializeRequestsMiddleware`
    (`lock.py`). `0` for the unlocked `/health` path.
  - `load` — time inside `get_tree()` (`deps.py`), i.e. `doorstop.build(...)`.
  - `work` — remaining time from lock acquired to `http.response.start`; this
    includes the route body, Doorstop's lazy item loading, and response serialization.
  The per-request accumulator is a mutable `dict` held in a `contextvars.ContextVar`
  set by the middleware. Sync dependencies run in a thread pool via
  `anyio.to_thread.run_sync`, which copies the context, so the *same dict object*
  is visible there and writes to it are seen by the middleware.
  The route template (`scope["route"].path`, set by FastAPI's `APIRoute.matches`) is
  emitted as `route;desc="<METHOD> <template>"` so `/items/REQ-001/links` and
  `/items/REQ-002/links` aggregate under one name.
- **Rationale**: `wait` and `load` are the two costs every request pays and the
  likeliest bottlenecks (tree rebuilt from disk on every request, one-at-a-time
  processing). Because `work` is defined as the remainder, the stages cover 100 % of
  the server total (SC-005).
- **Spec deviation**: FR-004 lists "preparing the response" as its own stage. FastAPI
  serializes `response_model` inside its route handler, so splitting it out needs a
  custom `APIRoute` subclass wrapping every endpoint. Not worth it until `work` is shown
  to be slow; folded into `work`. FR-004 and User Story 3 were updated to match.
- **Alternatives considered**: Starlette `BaseHTTPMiddleware` — rejected for the reason
  documented in `lock.py` (breaks the structured error path, Constitution III).

## R3 — Header is always on (server side)

- **Decision**: The server always emits `Server-Timing`; there is no server-side toggle.
- **Rationale**: Four `perf_counter()` calls and one header per request cost microseconds
  against a request that rebuilds a Doorstop tree from disk (FR-011 / SC-003 hold).
  A toggle would need a new CLI flag or endpoint plus restart handling for no measurable gain.
  The extension ignores the header while timing is disabled.

## R4 — Nesting extension operations and server requests

- **Decision**: `AsyncLocalStorage` from `node:async_hooks` holds the current
  `TimingEntry`. `timing.measure(name, fn)` runs `fn` inside `als.run(entry, …)`;
  `DoorstopServer.request()` reads `als.getStore()` and appends the server entry as a
  child. Requests outside any measured operation (index refresh, file watchers) become
  top-level server entries.
- **Rationale**: Node stdlib (stable since Node 16.4; VS Code ≥ 1.75 ships Node 16+).
  Correct under concurrency — two overlapping commands each get their own children —
  without threading a context parameter through every call site.
- **Alternatives considered**: An explicit `parent` parameter on `request()` — touches
  ~30 call sites and every intermediate function. A global "current operation" variable
  — wrong as soon as two operations overlap. Rejected.

## R5 — Covering every command (SC-002)

- **Decision**: `timing.ts` exports `registerCommand(id, handler)`, which wraps the handler in
  `measure(id, …)` and delegates to `vscode.commands.registerCommand`. All existing
  `vscode.commands.registerCommand(` call sites (~25, across 9 files) switch to it
  mechanically. A test scans `src/**/*.ts` and fails if any raw
  `vscode.commands.registerCommand(` call remains outside `timing.ts`.
- **Rationale**: One wrapper, enforced by one test, so newly added commands are covered too.
- **Alternatives considered**: Monkey-patching `vscode.commands.registerCommand` at
  activation — depends on the API object being mutable, which VS Code doesn't
  guarantee, and is invisible at call sites. VS Code's command-execution event
  (`onDidExecuteCommand`) is a proposed API and not available to marketplace
  extensions. Rejected.

## R6 — Providers and other named operations

- **Decision**: Wrap with `timing.measure(...)` only the operations FR-002 names that are not
  commands:
  - tree load (`RequirementTreeProvider.loadItems`, replacing the ad-hoc
    `console.log` timer — FR-013)
  - document view load (`documentView.load`, shared by open and refresh)
  - diagram load
  - validation run (`problemsProvider`)
  - filter execution (`filterNotebook`)
  - hover, CodeLens, and completion `provide*` callbacks
  Other providers (definition, reference, call hierarchy, code actions) are not wrapped;
  any server requests they make are still recorded as top-level server entries.
- **Rationale**: Covers the spec's list without wrapping every provider callback.
  Add more `measure()` calls when a bottleneck points there.

## R7 — Presentation: log, summary, export

- **Decision**:
  - **Log**: an `OutputChannel` named "Doorstop Timing". Each entry is printed when it
    completes, e.g. `12:03:41.120  ok   doorstop.refresh  143.2 ms`, with its children
    and stages printed indented underneath.
  - **Summary**: command `Doorstop: Show Timing Summary` prints a fixed-width text
    table (operation | count | total | min | avg | p95 | max) to the same channel and
    reveals it.
  - **Reset**: command `Doorstop: Reset Timing Data`.
  - **Export**: command `Doorstop: Export Timing Data…` opens a save dialog and writes
    JSON (see [contracts/timing-export.schema.json](contracts/timing-export.schema.json)).
    If there is nothing to export, it shows an info message and writes no file.
  - The three commands appear in the Command Palette only when
    `config.doorstop.timing.enabled` is set.
- **Rationale**: Uses only native VS Code UI and fits the developer audience. Charts
  are out of scope per the spec's Assumptions.
- **Alternatives considered**: A webview dashboard — more code, and charts are out of
  scope. An untitled editor document for the summary — the output channel is already
  open, so one less surface.

## R8 — Retention and statistics

- **Decision**: Keep a ring buffer of the most recent 10,000 top-level entries. For
  each operation name, keep exact running count, total, min, and max, updated on every
  entry including ones later evicted. Compute p95 on demand by the nearest-rank method
  over that name's durations among retained entries (children included, so server
  routes get their own rows).
- **Rationale**: Satisfies FR-010 and the spec's p95 assumption. At roughly 300 bytes
  per entry, 10,000 entries take about 3 MB, under SC-006.

## R9 — Outcome and toggle semantics

- **Decision**:
  - **Outcome**: a resolved handler is `ok`. A rejection with `vscode.CancellationError`
    (or an error named `Canceled`) is `cancelled`. Any other rejection is `failed`, and
    the original error is re-thrown unchanged.
  - **Toggle**: whether an operation is recorded is decided once, when it starts. A
    setting change mid-operation never produces a partial entry (edge case).
  - **Failure isolation**: all bookkeeping runs inside `try/catch` that swallows errors
    and writes them to the channel at most once, so the measured result is never
    altered (FR-012).
  - **Resolution**: `performance.now()` gives sub-millisecond resolution; durations
    are printed with one decimal (edge case: no zero-length entries).

## R10 — Tests (Constitution V/VI)

- **Server** (`server/tests/test_timing.py`, runs in the CI `server-tests` job):
  - `GET /tree` returns a `Server-Timing` header with numeric `wait`, `load`, and
    `work` values and `route;desc="GET /tree"`.
  - Two concurrent `POST` requests through `httpx.ASGITransport` (same pattern as
    `test_serialization.py`). To make this deterministic, `deps.load_tree` is wrapped
    to sleep 50 ms *before calling the real* `load_tree`. Doorstop itself is not mocked,
    so this complies with Constitution V. Assert that one response reports `wait ≥ 40`.
  - An error response (unknown item) still carries the header.
- **Extension**:
  - `src/test/timing.test.ts`:
    - `measure` records outcome and duration.
    - Nested `measure` plus a recorded server child attach to the right parent under
      concurrent operations.
    - Disabled → nothing is recorded.
    - Ring-buffer eviction keeps summary counts exact.
    - `parseServerTiming` handles a missing or garbled header.
    - The source scan from R5.
  - One end-to-end case in the existing real-server suite: with timing enabled,
    `doorstop.refresh` yields an entry whose child server entry has a `route` and
    `wait`/`load`/`work` stages.
