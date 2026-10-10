---

description: "Task list for 023 Execution Timing"
---

# Tasks: Execution Timing

**Input**: Design documents from `/specs/023-execution-timing/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included. Constitution V and VI require at least one CI-runnable test per feature, and server changes need pytest coverage against real Doorstop. Doorstop itself is never mocked.

**Organization**: Tasks are grouped by user story. Paths are relative to the repo root.

`server/` is a git submodule. Server tasks are committed inside `server/` first, then this repo's submodule pointer is bumped (T030).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4 from spec.md

---

## Phase 1: Setup

**Purpose**: Declare the setting and commands so the rest of the code can refer to them.

- [X] T001 Add the timing contributions to `package.json` exactly as listed in [contracts/extension-contributions.md](contracts/extension-contributions.md).
  - **Setting**: add `doorstop.timing.enabled` (boolean, default `false`, markdownDescription "Record how long extension operations and server requests take, and print them to the *Doorstop Timing* output channel. Intended for developing the extension.") as a new `contributes.configuration` entry titled "Timing".
  - **Commands**: add `doorstop.timing.showSummary` ("Doorstop: Show Timing Summary"), `doorstop.timing.reset` ("Doorstop: Reset Timing Data") and `doorstop.timing.export` ("Doorstop: Export Timing Data…") to `contributes.commands`.
  - **Palette**: give all three a `menus.commandPalette` entry with `"when": "config.doorstop.timing.enabled"`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The core `src/timing.ts` module that every story builds on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Create `src/timing.ts` with the data types and a module-level singleton. Use plain exported functions, not a class.
  - **Types**: export `TimingEntry`, `Stage` and `TimingOutcome` per [data-model.md](data-model.md):
    - `name: string`
    - `source: 'extension' | 'server'`
    - `start: number` (epoch ms)
    - `durationMs: number`
    - `outcome: 'ok' | 'failed' | 'cancelled'`
    - `stages: Stage[]`
    - `children: TimingEntry[]`
  - **State**:
    - `let enabled = false`
    - `const MAX_ENTRIES = 10_000`
    - `const entries: TimingEntry[] = []` (top-level only, oldest first)
    - `const summaries = new Map<string, { count: number; totalMs: number; minMs: number; maxMs: number }>()`
    - `const als = new AsyncLocalStorage<TimingEntry>()` from `node:async_hooks`
  - **Exports**: `setTimingEnabled(value: boolean)`, `isTimingEnabled()` and `getEntries(): readonly TimingEntry[]`. The tests use them.
- [X] T003 Implement `measure<T>(name: string, fn: () => T | Promise<T>): Promise<T>` in `src/timing.ts` (research R4, R9, data-model "Lifecycle"):
  1. **Disabled at start** → `return await fn()` with no bookkeeping. Decide this once at start; a toggle mid-run must never give a partial entry.
  2. **Run**: create the entry with `start = Date.now()` and `t0 = performance.now()`, then run `fn` inside `als.run(entry, fn)`.
  3. **Outcome**: a resolve is `ok`. A rejection with `vscode.CancellationError`, or an error whose `name === 'Canceled'`, is `cancelled`. Any other rejection is `failed`.
  4. **Duration**: set `durationMs = performance.now() - t0`.
  5. **Placement**: give every entry an internal `done` flag (not exported), and set it to `true` when the entry settles. If the enclosing ALS store (captured *before* `als.run`) exists **and its `done` is false**, push the entry into its `children`. Otherwise call the internal `addTopLevel(entry)`, which pushes and does `entries.shift()` while `entries.length > MAX_ENTRIES`. Late work whose parent already finished, such as a debounced re-check, therefore becomes top-level and is printed (spec Clarifications 2026-10-06).
  6. **Summary**: update `summaries` for `name` (count/total/min/max). Do this for children too.
  7. **Return / re-throw**: return the original result or re-throw the original error unchanged.
  8. **FR-012**: wrap every bookkeeping step after `fn` settles in `try/catch` that never throws. The first internal error goes to `console.warn('[Doorstop][timing] …')`, and later ones are silent.
- [X] T004 Add `registerCommand(id: string, handler: (...args: any[]) => unknown): vscode.Disposable` to `src/timing.ts`. It returns `vscode.commands.registerCommand(id, (...args) => measure(id, () => handler(...args)))` (research R5).
- [X] T005 Add `initTiming(context: vscode.ExtensionContext): void` to `src/timing.ts`:
  - **Channel**: create the output channel `vscode.window.createOutputChannel('Doorstop Timing')`.
  - **Setting**: read `doorstop.timing.enabled` into `enabled`, and subscribe to `vscode.workspace.onDidChangeConfiguration` for `doorstop.timing.enabled` to update it live. Turning it off keeps collected data.
  - **Disposal**: push both onto `context.subscriptions`.
  - **Wiring**: call `initTiming(context)` as the first statement of `activate()` in `src/extension.ts`, before `new DoorstopServer()` at line 26.

**Checkpoint**: `measure()` / `registerCommand()` compile and are callable. Nothing is shown yet.

---

## Phase 3: User Story 1 - See how long each operation took (Priority: P1) 🎯 MVP

**Goal**: With timing on, every command and named operation is logged to "Doorstop Timing" with its duration and outcome. Server requests appear nested under the operation that issued them.

**Independent Test**: Enable `doorstop.timing.enabled`, refresh the tree, open a document view, and run *Doorstop: Recheck Problems*. The channel shows one line per operation with a plausible duration. The refresh appears as a short `doorstop.refresh` line, followed by a separate top-level `tree.load` that has `GET /tree` nested under it. `doorstop.recheckProblems` has `validation.run` with its `GET /validate` / `GET /tree` children nested beneath it.

### Tests for User Story 1

- [X] T006 [P] [US1] Create `src/test/timing.test.ts` (mocha `suite`/`test`, same style as `src/test/packageMenus.test.ts`), with `setTimingEnabled(true)` in `setup` and `false` in `teardown`. Cases:
  - (a) `measure('x', async () => 1)` resolves to `1` and records one top-level entry with outcome `ok` and `durationMs >= 0`.
  - (b) A rejecting `fn` re-throws the *same* error object and records outcome `failed`.
  - (c) `fn` throwing `new vscode.CancellationError()` records `cancelled`.
  - (d) With `setTimingEnabled(false)`, `measure` records nothing.
  - (e) Two concurrent `measure('a', …)` / `measure('b', …)`, each awaiting a nested `measure('inner-a' | 'inner-b', …)` with interleaved `setTimeout`s: each child lands under its own parent and neither appears top-level.
  - (f) Enabling inside a running `measure` that started disabled records nothing for it.
  - (g) Late child: inside `measure('parent', …)`, schedule `setTimeout(() => measure('late', …), 20)` and return immediately. After 50 ms, `parent` has no children, and `late` is a top-level entry.
  - (h) Overhead bound (SC-004): 10,000 sequential `measure('noop', () => undefined)` calls with timing on finish in under 10 s. This generous bound catches only gross regressions; the < 1 ms target itself is checked by hand in T041.
- [X] T007 [P] [US1] Add a source-scan test to `src/test/timing.test.ts`. Recursively read every `*.ts` under `src/` except `src/test/**` and `src/timing.ts`, and assert that none contains `vscode.commands.registerCommand(`. List the offending files in the assertion message (research R5, SC-002).
- [X] T008 [P] [US1] Add one end-to-end case to `src/test/regressionFixture.test.ts`. It uses the suite's real `server` (started at line 146). With `setTimingEnabled(true)`, `await measure('e2e', () => server.request('GET', '/tree'))`. Assert that the last top-level entry is `e2e` with exactly one child, that the child has `source === 'server'` and outcome `ok`, and that `child.durationMs > 0`. Reset the enabled flag in `finally`.

### Implementation for User Story 1

- [X] T009 [US1] Add `recordServer(name: string, durationMs: number, outcome: TimingOutcome, stages: Stage[])` to `src/timing.ts`. It builds a `source: 'server'` entry, attaches it as a child of `als.getStore()` when that parent is not `done`, or as top-level otherwise (no store, or the parent already finished, same rule as T003), and updates `summaries`. It uses the same never-throw guard as T003. Export `timingActive(): boolean` (= `enabled`) so callers can skip the work when off.
- [X] T010 [US1] Instrument `DoorstopServer.request()` in `src/doorstopServer.ts`. If `timingActive()`, take `t0 = performance.now()` before `fetch`, and in a `finally` around the whole body call `recordServer(`${method} ${pathName}`, performance.now() - t0, ok ? 'ok' : 'failed', [])`. When timing is off, the code path is unchanged (FR-011). The name is overwritten by the server's route template in T033.
- [X] T011 [US1] Implement the live log in `src/timing.ts`. When a *top-level* entry completes, from both `measure` and `recordServer`, append the entry and its children recursively to the channel in the format from [contracts/extension-contributions.md](contracts/extension-contributions.md):
  - **Top line**: `HH:MM:SS.mmm  <outcome padded 9>  <name padded 32>  <ms with 1 decimal> ms`.
  - **Child lines**: indented with a `└` prefix.
  - **Stages**: append `wait x · load y · work z · other r` when `stages.length > 0`, where `other = durationMs − sum(stages)` and is clamped to ≥ 0. Durations always use one decimal, so sub-ms shows as `0.3 ms`, never `0`.
  - **Guard**: printing is part of the T003 never-throw guard.
- [X] T012 [P] [US1] Replace every `vscode.commands.registerCommand(` with `registerCommand(` imported from `./timing` in `src/extension.ts` (8 sites, including `doorstop.recheckProblems` at line 204).
- [X] T013 [P] [US1] Replace every `vscode.commands.registerCommand(` with `registerCommand(` from `./timing` in `src/documentViewProvider.ts` (5 sites, lines ~619–652).
- [X] T014 [P] [US1] Replace every `vscode.commands.registerCommand(` with `registerCommand(` from `./timing` in `src/reviewLensProvider.ts` (3 sites).
- [X] T015 [P] [US1] Replace every `vscode.commands.registerCommand(` with `registerCommand(` from `./timing` in `src/documentViewLanguage.ts` (2 sites, line ~466).
- [X] T016 [P] [US1] Replace `vscode.commands.registerCommand(` with `registerCommand(` from `./timing` in these files (1 site each):
  - `src/doorstopCommands.ts`: the `register` helper at line ~154
  - `src/callHierarchyProvider.ts`
  - `src/deriveProvider.ts`
  - `src/filterNotebook.ts`
- [X] T017 [P] [US1] In `src/requirementTree.ts` `loadItems()`, wrap the `this.server.request<TreeResponse>('GET', '/tree')` call (line ~156) in `measure('tree.load', …)`. Delete the `const start = Date.now()` line and the `console.log(... loadItems via server took ...)` line (FR-013).
- [X] T018 [P] [US1] In `src/documentViewProvider.ts`, wrap the body of `loadSnapshot` (line ~230), which is shared by open and refresh, in `measure('documentView.load', …)`.
- [X] T019 [P] [US1] In `src/diagrammPanel.ts` `refreshItemMeta()`, wrap the `this._server.request<TreeResponse>('GET', '/tree')` call (line ~234), inside the existing `try`, in `measure('diagram.load', …)`. That way a failure is recorded as `failed` before the existing catch returns `undefined`.
- [X] T020 [P] [US1] In `src/problemsProvider.ts` `refreshNow()`, wrap the `Promise.all([... '/validate', ... '/tree'])` (line ~320) in `measure('validation.run', …)`, inside the existing `try`.
- [X] T021 [P] [US1] In `src/filterNotebook.ts` `runCell`, wrap the `server.request<FilterResponse>('POST', '/filter', { query })` call (line ~173), inside the existing `try`, in `measure('filter.execute', …)`, so a rejected filter is recorded as `failed`.
- [X] T022 [P] [US1] Wrap each provider callback body in `measure(...)` from `./timing`:
  - `provideHover` in `src/hoverProvider.ts` (line ~89): `'hover'`
  - `provideCompletionItems` in `src/completionProvider.ts` (line ~78): `'completion'`
  - `provideCodeLenses` in `src/deriveProvider.ts` (line ~214): `'codeLens.derive'`
  - `provideCodeLenses` in `src/documentViewLanguage.ts` (line ~266): `'codeLens.documentView'`

  Sync callbacks become `async` and return the awaited value. VS Code accepts `ProviderResult` promises.

**Checkpoint**: US1 is fully usable. Run T006–T008 and `npm run compile`.

---

## Phase 4: User Story 2 - Analyse durations across many runs (Priority: P2)

**Goal**: Per-operation summary (count, total, min, avg, p95, max) sorted by total, plus reset.

**Independent Test**: Refresh 5×, open a document view 2×, run *Doorstop: Show Timing Summary*. Expect `doorstop.refresh` count 5, `documentView.load` count 2, and min ≤ avg ≤ max on every row. *Reset* followed by summary prints `No timing data recorded.`

### Tests for User Story 2

- [X] T023 [P] [US2] Add cases to `src/test/timing.test.ts`:
  - (a) After 3 `measure('s', …)` calls, `getSummary()` has a row `s` with `count === 3` and `minMs <= avgMs <= p95Ms <= maxMs`.
  - (b) Rows are sorted by `totalMs` descending.
  - (c) Eviction: temporarily lower the cap via an exported test hook `setMaxEntriesForTest(n)`, record `n + 5` entries, then assert `getEntries().length === n` and the summary `count === n + 5` (FR-010).
  - (d) `resetTiming()` empties both entries and summary.
  - (e) Memory bound (SC-006): record 10,000 top-level entries, each with one server child carrying 3 stages, and assert that `Buffer.byteLength(JSON.stringify(getEntries())) < 10 * 1024 * 1024`. The serialized size is a deterministic stand-in for heap use, which is too noisy to assert on.

### Implementation for User Story 2

- [X] T024 [US2] Add `getSummary(): { name; count; totalMs; minMs; avgMs; p95Ms; maxMs }[]` to `src/timing.ts`:
  - `avgMs = totalMs / count`.
  - `p95Ms` is nearest-rank: sort the durations of all *retained* entries **and their descendants** with that name, then take index `ceil(0.95 · n) − 1`. Fall back to `maxMs` when no retained sample exists.
  - Sort rows by `totalMs` descending.
  - Also add `resetTiming()`, which clears `entries` and `summaries`, and `setMaxEntriesForTest(n)`.
- [X] T025 [US2] In `initTiming()` in `src/timing.ts`, register `doorstop.timing.showSummary` and `doorstop.timing.reset` with the **raw** `vscode.commands.registerCommand`. They are not timed, and the T007 scan already excludes `src/timing.ts`.
  - **showSummary**: prints a fixed-width table `operation | count | total | min | avg | p95 | max` (ms, 1 decimal) to the channel, or `No timing data recorded.` when it is empty, then `channel.show(true)`.
  - **reset**: calls `resetTiming()` and prints `Timing data reset.`

**Checkpoint**: US1 and US2 work.

---

## Phase 5: User Story 3 - Break a slow operation into its parts (Priority: P3)

**Goal**: Each server request reports `wait` / `load` / `work` stages via the `Server-Timing` header. The extension shows them, plus `other`, under the server child.

**Independent Test**: Trigger a server-backed command. Its `GET /tree` child line shows `wait · load · work · other`. Two quick commands in a row: the second request's `wait` is > 0.

### Tests for User Story 3

- [X] T026 [P] [US3] Create `server/tests/test_timing.py` using the `client` / `document` fixtures from `server/tests/conftest.py`, and add a small helper to parse the header. Cases:
  - (a) `client.get("/tree")` has a `server-timing` header with numeric `wait`, `load` and `work` `dur` values, all ≥ 0, plus `route;desc="GET /tree"`.
  - (b) `POST /documents/REQ/items` reports `route;desc="POST /documents/{prefix}/items"`, i.e. the template, not the concrete path.
  - (c) `GET /items/NOPE-999` (error path) still carries the header.
  - (d) `/health` carries `wait;dur=0`.
  - (e) Contention: monkeypatch `doorstop_server.deps.load_tree` with a wrapper that `time.sleep(0.05)` and *then calls the real* `load_tree`. Doorstop itself is not mocked (Constitution V). Fire two `POST /documents/REQ/items` concurrently via `httpx.ASGITransport` + `asyncio.gather`, exactly like `server/tests/test_serialization.py`, and assert that `max(wait) >= 40`.
- [X] T027 [P] [US3] Add to `src/test/timing.test.ts`:
  - `parseServerTiming` on `'wait;dur=1.5, load;dur=80, work;dur=12.25, route;desc="GET /tree"'` returns stages `[wait 1.5, load 80, work 12.25]` and route `GET /tree`.
  - `parseServerTiming(null)`, `''` and `'garbage;;dur=x'` return `{ stages: [], route: undefined }` without throwing.
- [X] T028 [US3] Extend the end-to-end case from T008 in `src/test/regressionFixture.test.ts`. Assert that the child's `name === 'GET /tree'` and that its stage names are exactly `['wait', 'load', 'work']`. (Needs the server from this branch; CI installs it with `pip install -e ./server[dev]`.)

### Implementation for User Story 3

- [X] T029 [P] [US3] Create `server/src/doorstop_server/timing.py`, about 20 lines:
  - `stages: ContextVar[dict | None] = ContextVar("timing_stages", default=None)`
  - `record(stage: str, ms: float) -> None`: adds to the dict if one is set. It accumulates; it does not overwrite.
  - `header_value(d: dict, route: str) -> bytes`: formats `wait;dur=%.2f, load;dur=%.2f, work;dur=%.2f, route;desc="<route>"` per [contracts/server-timing-header.md](contracts/server-timing-header.md), with `"` and `\` in the route escaped.
- [X] T030 [US3] Instrument `SerializeRequestsMiddleware.__call__` in `server/src/doorstop_server/lock.py`:
  1. Set a fresh dict on `timing.stages` (keys `wait`, `load`, `work` = 0.0).
  2. Measure `wait` with `time.perf_counter()` around lock acquisition. Restructure to `t0 = perf_counter(); async with self.lock: d["wait"] = …`. For unlocked `/health`, `wait` stays 0.
  3. Wrap `send`. On the `http.response.start` message, compute `work = (now − t_acquired)·1000 − d["load"]`. The route is `f'{scope["method"]} {getattr(scope.get("route"), "path", scope["path"])}'`. Append `(b"server-timing", header_value(...))` to `message["headers"]` (a list of byte pairs; copy it if it is a tuple).
  4. Keep the existing bare-ASGI design and its docstring rationale. Do **not** switch to `BaseHTTPMiddleware`.
  5. Non-`http` scopes stay untouched.
- [X] T031 [US3] In `server/src/doorstop_server/deps.py` `get_tree()`, time `load_tree(...)` with `perf_counter()` and call `timing.record("load", ms)`. Keep the plain `load_tree(...)` call. The T026(e) monkeypatch target is `doorstop_server.deps.load_tree`, which a module-level call already looks up at call time.
- [X] T032 [US3] Add `parseServerTiming(header: string | null): { stages: Stage[]; route?: string }` to `src/timing.ts`:
  - Split on `,`. For each metric, read `name` and its `dur=` / `desc=` params.
  - Every metric with a numeric `dur` becomes a stage, in header order. Unknown names are kept.
  - `route`'s `desc`, unquoted, becomes `route`.
  - Ignore anything unparseable and never throw.
- [X] T033 [US3] In `DoorstopServer.request()` in `src/doorstopServer.ts`, when timing is active, read `response.headers.get('server-timing')`, run it through `parseServerTiming`, and pass `parsed.route` (falling back to the T010 name `METHOD path`) as the name and `parsed.stages` to `recordServer`. A `fetch` rejection (no response) keeps the T010 fallback name with empty stages. This also covers an older server without the header.

**Checkpoint**: US1–US3 work. `pytest server/tests` and `npm test` are green.

---

## Phase 6: User Story 4 - Keep the measurements for later comparison (Priority: P3)

**Goal**: Export all retained entries plus the summary to a JSON file.

**Independent Test**: Collect data, run *Doorstop: Export Timing Data…*, save, and open the file. Every entry is present with name, start, duration, stages, children and outcome. With no data, an info message appears and no file is written.

### Tests for User Story 4

- [X] T034 [P] [US4] Add cases to `src/test/timing.test.ts`:
  - `buildExport()` with no data returns `undefined`.
  - With data, it returns an object with `exportedAt` (ISO string), `entries` and `summary` arrays.
  - Every entry recursively has the `required` keys from [contracts/timing-export.schema.json](contracts/timing-export.schema.json), with `start` as an ISO date-time string.

### Implementation for User Story 4

- [X] T035 [US4] Add `buildExport()` to `src/timing.ts`. It returns `undefined` when `entries` is empty. Otherwise it returns `{ exportedAt, entries (start → new Date(start).toISOString(), recursively), summary: getSummary() }`, matching [contracts/timing-export.schema.json](contracts/timing-export.schema.json).
- [X] T036 [US4] In `initTiming()` in `src/timing.ts`, register `doorstop.timing.export` with raw `vscode.commands.registerCommand`:
  1. If `buildExport()` is `undefined`, show `showInformationMessage('Doorstop: no timing data to export.')` and stop.
  2. Otherwise call `showSaveDialog` with the default URI `<first workspace folder>/doorstop-timing-<yyyyMMdd-HHmmss>.json` and filter `{ JSON: ['json'] }`.
  3. On a chosen URI, write the file with `vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(data, null, 2)))`.
  4. Catch write errors and show `showErrorMessage('Doorstop: could not write timing export (<message>).')` (Constitution III).

**Checkpoint**: All four stories work.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T037 [P] Add a "Timing" bullet to `README.md` under `## Settings` (line ~136): `doorstop.timing.enabled`, plus a sentence naming the three commands and the "Doorstop Timing" channel.
- [X] T038 [P] Add an entry to `CHANGELOG.md` under `## [Unreleased]` → `### Added`:
  - **Extension**: Execution timing (`doorstop.timing.enabled`) — log, summary (count/total/min/avg/p95/max), reset, JSON export.
  - **Server**: `Server-Timing` header with `wait`/`load`/`work` on every response.
- [X] T039 Run `npm run compile` (type-check + lint + build) and fix every issue.
- [X] T040 Run `pytest server/tests` and `npm test`. Both must be green, with no new skips (Constitution VI).
- [X] T041 (manual — passed by user 2026-10-09) Walk through [quickstart.md](quickstart.md) steps 1–9 in the Extension Development Host. In particular, confirm step 8: with the setting disabled, the channel stays silent and the three commands are hidden. Also check these two targets by hand (spec Clarifications 2026-10-06):
  - **SC-003**: with timing disabled, time 5 tree loads, 5 document view opens and 5 validation runs on this branch and on `main`. The medians must differ by less than 2 %.
  - **SC-004**: with timing enabled, the `(h)` run from T006 averages under 1 ms per call. Note the measured figures in the PR description.
- [X] T042 Commit the server changes (T026, T029–T031) inside the `server/` submodule, then commit the bumped submodule pointer together with the extension changes in this repo.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001)** → **Foundational (T002–T005)** → user stories → **Polish**.
- **Foundational**: T002 → T003 → T004, T005. They are sequential because they are all in the same file.

### User Story Dependencies

- **US1** depends only on Foundational.
- **US2** depends on Foundational. It reads the same `summaries` that `measure` already fills, so it can be built in parallel with US1. Its manual test needs US1's command wrapping.
- **US3**:
  - The server half (T026, T029–T031) is independent of all extension work.
  - The extension half (T032–T033) needs T009/T010 from US1.
  - T028 needs T008.
- **US4** depends on Foundational plus T024 (`getSummary`) from US2.

### Within Each Story

- Write the tests first and see them fail. Then: `timing.ts` functions → call-site edits → checkpoint.
- **Same file, so sequential**:
  - All `src/timing.ts` tasks: T002–T005, T009, T011, T024, T025, T032, T035, T036.
  - The `src/doorstopServer.ts` tasks: T010, then T033.
  - The `src/test/timing.test.ts` tasks: T006, T007, T023, T027, T034.
  - The `src/documentViewProvider.ts` tasks: T013, then T018.
  - The `src/documentViewLanguage.ts` tasks: T015, then T022.
  - The `src/deriveProvider.ts` tasks: T016, then T022.
  - The `src/filterNotebook.ts` tasks: T016, then T021.

### Parallel Opportunities

- **US1 call-site edits**: T012–T021 are all different files, and T022 runs once T015/T016 are done.
- **US3 server work**: T026, T029, T030 and T031 can be done by a second person while US1 is in progress.
- **Polish**: T037 and T038.

---

## Parallel Example: User Story 1

```text
# After T009–T011 land in src/timing.ts, fan out the call-site edits:
Task: "T012 registerCommand swap in src/extension.ts"
Task: "T013 registerCommand swap in src/documentViewProvider.ts"
Task: "T014 registerCommand swap in src/reviewLensProvider.ts"
Task: "T017 measure('tree.load') in src/requirementTree.ts"
Task: "T019 measure('diagram.load') in src/diagrammPanel.ts"
Task: "T020 measure('validation.run') in src/problemsProvider.ts"

# Meanwhile, independent server track (US3):
Task: "T029 server/src/doorstop_server/timing.py"
Task: "T026 server/tests/test_timing.py"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. **Setup and foundation**: T001–T005.
2. **US1**: T006–T022. The commands and named operations are timed, and server round-trips appear nested.
3. **Validate**: quickstart steps 1–3 and 8. This already replaces the ad-hoc `console.log` timer.

### Incremental Delivery

1. **US2** (summary + reset): turns the log into answers about where time goes.
2. **US3** (Server-Timing stages): answers *why* a request is slow. The server can ship first; the extension ignores the header until T033.
3. **US4** (export): for before/after comparisons.
4. **Polish**: T037–T042.

---

## Notes

- `[P]` = different file and no dependency on an incomplete task.
- **Timing never changes results**: every bookkeeping path is guarded (FR-012). If you see a timing bug change a command's behaviour, that is a defect in T003/T009.
- **No new npm or pip dependencies** (Constitution IV).

---

## Phase 8: Convergence

Constitution VIII: every FR needs an automated CI test carrying a `Spec 023 FR-NNN` trace comment.

- [ ] T043 Add a trace comment `// Spec 023 FR-NNN` (one per FR the test exercises) to every existing test in `src/test/timing.test.ts` and to the end-to-end case in `src/test/regressionFixture.test.ts`; add `# Spec 023 FR-NNN` to every test in `server/tests/test_timing.py`. Mapping: FR-002 (US1 cases, command-wrapper scan), FR-003/FR-005 (e2e nesting), FR-004 (py wait/load/work, queued wait), FR-007/FR-008 (US2 summary/reset), FR-009 (US4 export), FR-010 (eviction), FR-011 (disabled / overhead cases) per Constitution VIII (partial)
- [ ] T044 Add a test for the enable setting: default is disabled and toggling the `doorstop` timing setting enables/disables recording, traced `Spec 023 FR-001` per FR-001 (missing)
- [ ] T045 Add a test that recorded entries are written to the timing log channel as they happen with operation name, duration and outcome (and nothing is written while disabled), traced `Spec 023 FR-006` / `FR-011` per FR-006 (missing)
- [ ] T046 Add a test that a throwing/broken timing internal (e.g. failing log sink or summary update) does not fail or alter the measured operation's result, traced `Spec 023 FR-012` per FR-012 (missing)
- [ ] T047 Add a test (or extend the T007 source scan) asserting no ad-hoc timing `console.log`/`console.time` lines remain under `src/` outside `src/timing.ts`, traced `Spec 023 FR-013` per FR-013 (missing)
