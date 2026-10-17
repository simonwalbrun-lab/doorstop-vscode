---
description: "Tasks for spec 032 – Background Problem Checking and Reporting Modes"
---

# Tasks: Background Problem Checking and Reporting Modes

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: Required. Constitution Principle VIII asks for at least one test per FR, and each test starts with the comment `# Spec 032 FR-xxx` (Python) or `// Spec 032 FR-xxx` (TypeScript).

**Stack facts**: FastAPI 0.141 / Starlette 1.6 (`starlette.concurrency.run_in_threadpool`), Doorstop 3.2 (`Document.get_issues(item_hook=...)` calls the hook before each item). There is no pytest-asyncio; async server tests use `@pytest.mark.anyio` with `httpx.AsyncClient(transport=httpx.ASGITransport(app))`. No new dependencies (Principle IV).

## Format: `- [ ] [ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Add `app.state.tree_version = 0` and `app.state.validation_generation = 0` next to `tree_fingerprint` in `server/src/doorstop_server/app.py`, with a one-line comment for each (see data-model.md "Server state"). *(Superseded 2026-10-17: `validation_generation` is removed by T037.)*

---

## Phase 2: Foundational (blocks US1 and US3)

- [X] T002 In `server/src/doorstop_server/lock.py`, inside the locked branch and before `await self.app(...)`, expose the lock to routes with `scope.setdefault("state", {})["request_lock"] = self.lock`, so `request.state.request_lock` works. Extend the class docstring: `/validate` may release and reacquire this lock between documents (Principle I v1.5.0, research R2). Only one request makes progress at a time. *(Superseded 2026-10-17: T035 takes `/validate` out of the lock instead.)*
- [X] T003 [P] In `src/doorstopServer.ts`, give `request<T>(method, pathName, body?, options?: { signal?: AbortSignal })` an options parameter. A request with a `signal` bypasses `inflightGets` (it is never shared) and passes `signal` to `fetch`. Update the doc comment to explain why: an abortable check must not join an older in-flight one (research R5).
- [X] T004 [P] In `src/progress.ts`, extend `withDelayedProgress(title, work, options?: { cancellable?: boolean; location?: vscode.ProgressLocation })`.
  - `work` receives `(report, token: vscode.CancellationToken)`.
  - Create a `CancellationTokenSource` at the start. When the delayed notification appears with `cancellable: true`, forward its token's cancellation to the source.
  - `location` defaults to `Notification`.
  - Existing callers stay source-compatible.
  - Extend `src/test/progress.test.ts`: a cancellable toast cancels the token, and `location: Window` is passed through.

---

## Phase 3: User Story 1 – Keep working while problems are checked (P1) 🎯 MVP

**Goal**: other requests are served between documents, and a newer check or a change supersedes the running one.
**Independent test**: in a tree where a check takes several seconds, `/tree` and a mutation issued during `/validate` answer before it finishes.

### Tests

- [X] T005 [P] [US1] Create `server/tests/test_validation_background.py`. The fixture is a project with at least 2 documents. Monkeypatch `doorstop_server.routers.validation.collect_document_issues` so the first document blocks on a `threading.Event`. Tests: *(Superseded 2026-10-17: rewritten for the worker process by T031.)*
  - `# Spec 032 FR-001`: a `GET /tree` started during `/validate` completes while the first document is still blocked, released, or done. Assert that `/tree` returns before `/validate` returns.
  - `# Spec 032 FR-002, FR-003`: a second `/validate` makes the first answer `409 {"error":{"code":"CANCELLED","message":"superseded"}}`, and the second answers 200.
  - `# Spec 032 FR-003, FR-005`: a `PATCH /items/{uid}` between documents makes `/validate` answer 409 `changed`. The item file on disk contains exactly the PATCH result.
  - `# Spec 032 FR-003`: when `request.is_disconnected()` returns `True` (monkeypatched), the answer is 409 `disconnected`.
  - `# Spec 032 FR-006`: without blocking, `/validate` returns exactly `list(collect_issues(fresh_tree))` for `testdata/regression`, so the existing `tests/test_validation.py` stays green and unchanged.
- [X] T006 [P] [US1] Create `src/test/problemReporting.test.ts`. Build the provider with a fake `server.request`.
  - `// Spec 032 FR-004`: the diagnostics stay as they were until the pass resolves, then are replaced in one `collection.set` round.
  - `// Spec 032 FR-002`: a second `refreshNow()` aborts the first pass's `AbortSignal`.
  - `// Spec 032 FR-009`: a rejected `DoorstopApiError('CANCELLED', …, 409)` or an `AbortError` keeps the diagnostics and never calls `reportFailure`.
  - `// Spec 032 FR-003`: a `CANCELLED`/`changed` response for the newest pass schedules one more refresh.

### Implementation

- [X] T007 [US1] In `server/src/doorstop_server/validation_rules.py`, extract the loop body of `collect_issues` into `collect_document_issues(document) -> List[ValidationRecord]`. It enters `read_only_validation()` itself, *per document*, so the settings are normal while the lock is yielded (research R2). Keep `collect_issues(tree)` as `for document in tree: yield from collect_document_issues(document)`. *(Superseded 2026-10-17: T032 adds the `item_hook` parameter; the per-document scope stays.)*
- [X] T008 [US1] Rewrite `validate_tree` in `server/src/doorstop_server/routers/validation.py` (research R2/R3, contracts/validation-api.md): *(Superseded 2026-10-17: replaced by the worker design, T033/T034.)*
  1. `state.validation_generation += 1` and remember it; take the tree from `get_tree_for_reading`; `load_items(tree)`; remember `state.tree_version`.
  2. For each document: `records += await run_in_threadpool(collect_document_issues, document)`. Then yield: `lock = request.state.request_lock; lock.release(); await lock.acquire()`.
  3. After reacquiring, raise `DoorstopApiError(409, "CANCELLED", reason)`: `"superseded"` if the generation changed (C1), `"changed"` if `tree_version` changed (C2), `"disconnected"` if `await request.is_disconnected()` (C3).
  4. The lock MUST be held whenever the handler returns or raises, because the middleware's `async with` releases it. If `acquire()` is interrupted, do not swallow the exception and do not release twice.
  5. The docstring lists C1–C4 with their Principle I reasons.
- [X] T009 [US1] In `server/src/doorstop_server/deps.py`, do `request.app.state.tree_version += 1` whenever `get_tree_for_reading` rebuilds and on every `get_tree` call (mutation), so C2 works. US2 replaces this with the shared tree.
- [X] T010 [US1] In `src/problemsProvider.ts` `runPass`:
  - Keep the current pass's `AbortController` in `running` and abort the previous one when a new pass starts.
  - Call `request('GET', '/validate', undefined, { signal })`.
  - In `catch`, treat `error.name === 'AbortError'` or `DoorstopApiError` with code `CANCELLED` as a cancellation: keep the collection, keep `lastRefresh`, no `reportFailure`. If the message is `changed` and `pass === latestPass`, call `scheduleRefresh()`.
  - Other errors behave as today (spec 014 FR-014).

**Checkpoint**: US1 is shippable alone.

---

## Phase 3b: User Story 1 rework – check in a separate process (P1) 🎯 MVP

Constitution v1.6.0 and the 2026-10-17 clarifications (FR-001, FR-003, FR-020, SC-001). Research R2, R3, R8; data-model.md "Validator" and "Worker process state"; contracts/validation-api.md.

**Goal**: the check runs in a long-lived worker process with its own tree. `/validate` holds no request lock, so other requests keep their normal speed. A cancelled check stops within 1 s.
**Independent test**: while a CPU-bound check runs, the median of uncached `GET /tree?fields=…` stays ≤ 1.2× its median without a check, plus 10 ms. A `PATCH` during the check cancels it with 409 `changed` within 1 s.

### Tests

- [X] T031 [P] [US1] Rewrite `server/tests/test_validation_background.py` for the worker, and add `server/tests/worker_hooks.py` with three module-level item hooks. `busy(**_)` spins the CPU for 50 ms (a `time.perf_counter()` loop) and returns `[]`. `slow(**_)` does `time.sleep(0.2)` and returns `[]`. `pid(**_)` writes `os.getpid()` to the file named by the environment variable `DOORSTOP_TEST_PID_FILE` and returns `[]`. The spawned child imports them by name. Fixture: a project with REQ and a child TST, 10 items each, and `app.state.validator = Validator(root, item_hook=worker_hooks.busy or .slow)`. Call `validator.close()` in teardown. Drive concurrent requests with `httpx.AsyncClient(transport=httpx.ASGITransport(app))` as the current file does. Tests:
  - `# Spec 032 FR-001`: the check runs in another process. With the `pid` hook, and `DOORSTOP_TEST_PID_FILE` set before the worker starts, the PID in the file differs from the test's own.
  - `# Spec 032 FR-001, SC-001`: the median of 15 `GET /tree?fields=f<n>` (new `n` each time, so the `/tree` cache never answers) with no check, then the median of 15 during a `busy` check. Assert median_during ≤ 1.2 × median_without + 0.010 s.
  - `# Spec 032 FR-001`: during a `slow` check, `GET /tree` answers with a `server-timing` `wait` near 0, well below the check's duration.
  - `# Spec 032 FR-002, FR-003`: a second `/validate` makes the first answer `409 {"error":{"code":"CANCELLED","message":"superseded"}}` within 1 s of the second request, and the second answers 200.
  - `# Spec 032 FR-003, FR-005`: a `PATCH /items/{uid}` during a `slow` check answers 200 without waiting for it. The check answers 409 `changed` within 1 s, and the item file holds the PATCH text once (rebuild with `doorstop.build`).
  - `# Spec 032 FR-003`: an outside edit during a `slow` check (write an item file directly) makes it answer 409 `changed` (C2').
  - `# Spec 032 SC-002`: edit an item file directly, then start a `slow` check and, while it runs, send `GET /tree`. `/tree` reloads the file, but the check still answers 200 (a reload on the read path does not cancel, research R3).
  - `# Spec 032 FR-003`: when `starlette.requests.Request.is_disconnected` is monkeypatched to return `True`, the answer is 409 `disconnected` within 1 s.
  - `# Spec 032 FR-020`: after a cancelled check, the next check reports reload kind `"none"`; after one item edit it reports `"partial"`. Read it from `Validator.last_reload`, which `check()` records.
  - `# Spec 032 FR-006`: for a copy of `testdata/regression` and no hook, `/validate` returns exactly `list(collect_issues(doorstop.build(...)))`, as the current FR-006 test does.
  - Edge case: `validator.process.kill()`, then `/validate` answers 200 from a new worker.

### Implementation

- [X] T032 [P] [US1] In `server/src/doorstop_server/validation_rules.py`, give `collect_document_issues(document, item_hook=None)` an `item_hook` and pass it on as `document.get_issues(item_hook=item_hook)`. Same for `collect_issues(tree, item_hook=None)`. Update the docstring: the per-document read-only scope stays, but the reason is now "the worker never writes files" (research R2), not "requests run between documents".
- [X] T033 [US1] Create `server/src/doorstop_server/validation_worker.py`, about 120 lines, stdlib only:
  - `class _Cancelled(Exception)`.
  - `_lower_priority()`: `os.nice(10)` on POSIX. On Windows, `ctypes.windll.kernel32.SetPriorityClass(ctypes.windll.kernel32.GetCurrentProcess(), 0x4000)` (BELOW_NORMAL). Wrap it in `try/except OSError`.
  - `run(conn, wanted, root, item_hook)`, the worker entry:
    - Call `_lower_priority()` and `use_libyaml()`. Set `settings = Settings(project_root=root, host="", port=0)`, `tree = None`, `fp = None`.
    - Loop:
      - `job = conn.recv()`, returning on `EOFError`.
      - If `wanted.value != job`, skip the job.
      - `new = fingerprint(root)`. If `fp is None`: `tree, kind = load_tree(settings), "full"`. Otherwise `tree, kind = refresh_tree(tree, settings, fp, new)`. Then `fp = new` and `tree.load()`.
      - The hook passed to `collect_issues` raises `_Cancelled` when `wanted.value != job`, and otherwise returns `item_hook(**kwargs)` if `item_hook` is set, else `[]`.
      - `records = list(collect_issues(tree, item_hook=hook))`.
      - If `fingerprint(root) != new`, send `(job, "changed", kind, None)`. Otherwise send `(job, "done", kind, records)`.
    - `except _Cancelled: continue` sends no reply.
    - `except Exception as error:` sets `fp = None` and sends `(job, "error", None, str(error))`.
  - `class Validator`, whose fields are exactly those in data-model.md "Validator":
    - `__init__(root, item_hook=None)`: `ctx = multiprocessing.get_context("spawn")`, `wanted = ctx.Value("i", 0)`, `job = 0`, `reason = None`, `process = None`, `conn = None`, `lock = None`. Create the lock lazily inside `check`, so it binds to the serving loop. Also `last_reload = None`.
    - `cancel(reason)`: if a job is running (`wanted.value == job != 0`), set `self.reason = reason` and `wanted.value = 0`.
    - `async check(is_disconnected) -> list[ValidationRecord]`:
      - Call `self.cancel("superseded")`, then `async with self.lock:`.
      - If the process is `None` or not alive, start it in `run_in_threadpool`: a new Pipe, a daemon `ctx.Process(target=run, args=(child_conn, wanted, root, item_hook))`.
      - `self.job += 1`, `self.reason = None`, `wanted.value = self.job`, `conn.send(self.job)`.
      - Loop:
        - `ready = await run_in_threadpool(conn.poll, 0.2)`.
        - If `wanted.value != self.job`, raise `DoorstopApiError(409, "CANCELLED", self.reason or "superseded")`.
        - If `await is_disconnected()`, call `self.cancel("disconnected")` and raise 409 `disconnected`.
        - If not ready and the process is not alive, set `self.process = None` and raise `DoorstopApiError(500, "VALIDATION_FAILED", "the check process ended")`.
        - If ready, `msg = conn.recv()`. On `EOFError`/`OSError`, treat it like the dead-process case. Skip any `msg[0] != self.job`.
        - Set `self.last_reload = msg[2]` and `wanted.value = 0`.
        - `"done"` returns `msg[3]`. `"changed"` raises 409 `changed`. `"error"` raises 500 `VALIDATION_FAILED` with `msg[3]`.
    - `close()`: cancel, close `conn`, and `process.join(1)` then `terminate()` if it is still alive. Safe to call twice.
  - Add a module docstring naming Principle I v1.6.0, R2 and R3 (C1–C4). Add a `# ponytail:` note: the idle worker keeps its tree in memory after a switch to Off, until the server stops. Stop it in `setMode('off')` if memory ever matters.
- [X] T034 [US1] Rewrite `server/src/doorstop_server/routers/validation.py`:
  - `validate_tree(request)` has no tree dependency. It does `records = await request.app.state.validator.check(request.is_disconnected)` and maps the records to `ValidationIssue` as today.
  - Remove the imports of `run_in_threadpool`, `get_tree_for_reading`, `load_items` and `collect_document_issues`.
  - The docstring explains the separate process (no request lock, own copy, read-only) and lists C1 superseded, C2/C2' changed, C3 disconnected and C4 shutdown.
- [X] T035 [P] [US1] In `server/src/doorstop_server/lock.py`:
  - Change `_UNLOCKED_PATHS` to `{"/health", "/validate"}`.
  - Delete `scope.setdefault("state", {})["request_lock"] = self.lock`.
  - Replace the docstring paragraph about yielding with: `/validate` is background validation, which runs in a separate process and never takes this lock (Principle I v1.6.0, spec 032 R2).
- [X] T036 [US1] In `server/src/doorstop_server/deps.py`, in `get_tree` only, call `state.validator.cancel("changed")` right after `state.tree_version += 1`. Do **not** cancel in `_shared_tree`: a reload on the read path is usually the very save the check already sees (research R3), and C2' catches a real change during the check. Update both docstrings: `get_tree` cancels a running check (C2), and `_shared_tree` deliberately doesn't.
- [X] T037 [US1] In `server/src/doorstop_server/app.py`:
  - Add `app.state.validator = Validator(settings.project_root)` with a one-line comment (the check process, started on the first `/validate`).
  - Remove `app.state.validation_generation` and its comment. Reword the `tree_version` comment: it keys the `/tree` answer cache, and a mutation, not a read-side reload, also cancels a running check (C2, `deps.get_tree`).
  - In `server/tests/conftest.py`, turn the `client` fixture into a `yield` fixture that calls `app.state.validator.close()` afterwards.
- [X] T038 [P] [US1] In `server/tools/profile_server.py`, the `validate` scenario now only measures waiting on a pipe. Replace it with an in-process profile of `list(collect_issues(tree))` on the generated tree, written to the same `.prof` and top-N output. Keep the file under 100 LOC, and update the `_inline` docstring that mentions `/validate`.

**Checkpoint**: `cd server && pytest` is green. US1 now meets Principle I v1.6.0.

---

## Phase 4: User Story 2 – Faster responses after a change (P2)

**Goal**: only changed documents are reloaded; reads and mutations share one tree.
**Independent test**: edit one item, then `GET /tree`. Only that document is reloaded, and the output equals a fresh server's output.

### Tests

- [X] T011 [P] [US2] Create `server/tests/test_tree_reload.py` against a temporary project with documents REQ, TST and a nested child. Spy on `doorstop.build` and on `Document._iter` with `reload=True`. Tests:
  - `# Spec 032 FR-020`: editing one REQ item file reloads only REQ. TST item objects keep their identity, and `build` is not called. The same holds for an added item and a deleted item.
  - `# Spec 032 FR-021`: editing REQ's `.doorstop.yml`, adding or removing a `.doorstop.skip`, and adding a new document folder each cause one `build` call.
  - `# Spec 032 FR-022`: after each change above, the `/tree` and `/validate` JSON equal those of a freshly created app.
  - `# Spec 032 FR-023`: with no change, neither `build` nor `_iter(reload=True)` is called, for a read *and* for a mutation request. A file outside every document (for example `README.md` at the root) causes no reload.
  - `# Spec 032 FR-020`: a mutation that raises (for example an unknown UID) sets the cache invalid, and the next request calls `build` once.
- [X] T012 [P] [US2] Adjust `server/tests/test_tree_cache.py`. Keep its read-cache assertions. Change any assertion that relies on mutations getting a fresh tree so it matches the shared tree, and add `# Spec 032 FR-020` where it now covers sharing.

### Implementation

- [X] T013 [US2] In `server/src/doorstop_server/doorstop_tree.py`, add `refresh_tree(tree, settings, old_fp, new_fp) -> tuple[Tree, str]` returning `"none" | "partial" | "full"`, exactly as in the data-model.md "Refresh decision":
  - Empty diff → `"none"`.
  - Any changed basename starting with `.doorstop` → `load_tree(settings)`, `"full"`.
  - Otherwise, group the paths by the *deepest* `document.path` that contains them, and ignore paths outside every document.
  - For each affected document, `list(document._iter(reload=True))`; then `tree._item_cache.clear()`; `"partial"`.
  - Any exception → `load_tree`, `"full"`.
  - Add `# ponytail:` comments naming the private Doorstop 3.2 API (`Document._iter`, `Tree._item_cache`) and the upgrade path (a public reload, if Doorstop gains one). Update the `load_tree` docstring, since mutations no longer get a fresh tree.
- [X] T014 [US2] Rewrite `server/src/doorstop_server/deps.py`.
  - One helper `_shared_tree(request)`: fingerprint → `refresh_tree` (or `load_tree` when `tree_fingerprint is None`) → store `cached_tree`/`tree_fingerprint` → `tree_version += 1` unless `"none"`. Keep the fingerprint-before-build order and the `timing.timed("load")` wrapper.
  - `get_tree_for_reading` returns `_shared_tree(request)`.
  - `get_tree` becomes a `yield` dependency: `tree = _shared_tree(request)`; `tree_version += 1`; `try: yield tree` / `except Exception: state.tree_fingerprint = None; raise`.
  - Replace T009's counters. Update both docstrings (research R4).

**Checkpoint**: US1 and US2 together; the server suite is green.

---

## Phase 5: User Story 3 – See that a check is running (P3)

**Goal**: automatic checks show the status-bar spinner; a Refresh check shows a cancellable toast.
**Independent test**: save in a large tree → the spinner appears after 1 s. Refresh → a toast with Cancel; cancelling keeps the problems.

### Tests

- [X] T015 [P] [US3] Add to `src/test/problemReporting.test.ts`:
  - `// Spec 032 FR-007`: an automatic pass running longer than 1 s calls `withProgress` with `ProgressLocation.Window`, and a pass under 1 s does not.
  - `// Spec 032 FR-008`: `checkExplicitly()` shows a `Notification` with `cancellable: true`.
  - `// Spec 032 FR-009`: cancelling that token aborts the request, keeps the diagnostics, and shows no message.

### Implementation

- [X] T016 [US3] In `src/problemsProvider.ts`:
  - Wrap automatic passes in `withDelayedProgress('Checking Doorstop problems…', …, { location: vscode.ProgressLocation.Window })`.
  - Add `checkExplicitly(): Promise<void>` to the `ProblemsProvider` interface. It wraps `refreshNow()` in `withDelayedProgress('Doorstop: Checking problems…', (_, token) => …, { cancellable: true })`, where the token's cancellation aborts `running`.
- [X] T017 [US3] Add `problems: () => ProblemsProvider | undefined` to `CommandOptions` in `src/doorstopCommands.ts`; commands are registered before the provider exists (`src/extension.ts` lines ~199/217). Pass the getter from `extension.ts`. In `doorstop.refresh`, after the tree reload, call `void options.problems()?.checkExplicitly()`. It is a separate toast and does not block Refresh.

---

## Phase 6: User Story 4 – Choose Automatic, On demand, or Off (P4)

**Goal**: a three-way mode, set in the settings and by a tree-view button that cycles it.
**Independent test**: click the button 3× → eye → eye-watch → eye-closed → eye, and the workspace setting follows. Each mode behaves as in the data-model.md "Triggers per mode".

### Tests

- [X] T018 [P] [US4] Add to `src/test/packageMenus.test.ts`:
  - `// Spec 032 FR-010`: `doorstop.problemReporting` has `"enum": ["automatic", "onDemand", "off"]` and `"default": "automatic"`.
  - `// Spec 032 FR-014`: there is no `doorstop.recheckProblems` command and no other re-check command.
  - `// Spec 032 FR-015`: the `doorstop.problems` description contains "Applies only while Problem Reporting is not Off".
  - `// Spec 032 FR-017, FR-018`: the three `doorstop.problemReporting.to*` commands, with icons `$(eye)` / `$(eye-watch)` / `$(eye-closed)`, are in `view/title` with the when-clauses from contracts/extension-ui.md, and are hidden in `commandPalette`.
- [X] T019 [P] [US4] Add to `src/test/problemReporting.test.ts`:
  - `// Spec 032 FR-011`: in On demand and Off, save and `scheduleRefresh` send no `/validate`. In On demand, `checkExplicitly` does.
  - `// Spec 032 FR-012`: switching to Off aborts, clears the diagnostics, `getLastRefresh()` is `undefined`, and `onDidRefresh` fires.
  - `// Spec 032 FR-013`: switching to Automatic sends `/validate`; switching to On demand sends nothing and does not abort.
  - `// Spec 032 FR-015`: changing `doorstop.problems` re-filters `lastRefresh.unfiltered` without a request.
  - `// Spec 032 FR-017, FR-019`: executing `doorstop.problemReporting.toOnDemand` writes `onDemand` to the workspace target and sets the context key. A config change from outside updates the context key.
- [X] T020 [P] [US4] Add to `src/test/statusReport.test.ts`: `// Spec 032 FR-016`: `buildStatusReport({ …, issues: 'off' })` contains "Problem reporting is off" and no problem table.

### Implementation

- [X] T021 [P] [US4] In `package.json`, following contracts/extension-ui.md exactly:
  - Add the `doorstop.problemReporting` property to the "Problems" configuration, with `"enum": ["automatic", "onDemand", "off"]`, `"enumItemLabels": ["Automatic", "On demand", "Off"]`, `"default": "automatic"`, and the given `markdownDescription`.
  - Append "Applies only while Problem Reporting is not Off." to the `doorstop.problems` `markdownDescription`.
  - Add the commands `doorstop.problemReporting.toOnDemand` / `.toOff` / `.toAutomatic`, with the titles and icons from the contract.
  - Add `view/title` entries (`group: "navigation"`, when `view == doorstop.treeView && doorstop.problemReporting == automatic|onDemand|off`).
  - Add `commandPalette` entries with `"when": "false"`.
  - **Delete** the `doorstop.recheckProblems` command (lines ~284–287) and any menu entry for it.
- [X] T022 [US4] In `src/problemsProvider.ts`:
  - Read `mode` from `doorstop.problemReporting`.
  - `ProblemsRefresh` gains `unfiltered: ValidationResponse`, and the filtering moves into a `refilter()` that rebuilds `validation` and the diagnostics from `unfiltered` and fires `onDidRefresh`.
  - `onSave`/`scheduleRefresh` only act in `automatic`; `checkExplicitly` does nothing in `off`.
  - Add `setMode(mode)` with the data-model.md "Mode transitions": off → abort, `collection.clear()`, `lastRefresh = undefined`, fire. Change the emitter type to `ProblemsRefresh | undefined` (`documentViewLanguage.ts` already re-reads `getLastRefresh()` and returns `[]` for `undefined`). automatic → `refreshNow()`. onDemand → nothing.
  - Expose `refilter` and `setMode` on the interface.
  - Delete the comment about `doorstop.recheckProblems` (line ~395).
- [X] T023 [US4] In `src/extension.ts`:
  - **Delete** the `doorstop.recheckProblems` registration (lines ~228–231).
  - Register the three mode commands. Each one does `getConfiguration('doorstop').update('problemReporting', next, vscode.ConfigurationTarget.Workspace)`, cycling automatic → onDemand → off → automatic.
  - Set the context key `doorstop.problemReporting` at activation.
  - In the existing `onDidChangeConfiguration`: `doorstop.problemReporting` → set the context key and call `problemsProvider?.setMode(...)`; `doorstop.problems` → `problemsProvider?.refilter()` (instead of `refreshNow`).
  - Run the startup `refreshNow()` only when the mode is `automatic`.
  - Register the commands even if the server did not start, so the button always works.
- [X] T024 [US4] In the `doorstop.statusReport` handler in `src/doorstopCommands.ts`, replace the direct `/validate` request:
  - If the mode is `off`, pass `issues: 'off'`.
  - Otherwise `await options.problems()?.refreshNow()`, then use `getLastRefresh()?.unfiltered.issues`, which keeps today's unfiltered report contents. If that is `undefined` (failed or cancelled), throw so nothing is written (spec 021 FR-019).
- [X] T025 [US4] In `src/statusReport.ts`, widen `issues` to `ValidationIssue[] | 'off'`. For `'off'`, the problems section prints "Problem reporting is off." in place of the per-type counts.

---

## Phase 7: Polish & Cross-Cutting

- [X] T026 [P] In `README.md` line ~61, replace "*Doorstop: Re-check Problems*" with: Refresh re-checks, and the tree-view eye button cycles Automatic / On demand / Off.
- [X] T027 [P] Add an Unreleased entry to `CHANGELOG.md`: background problem checking, partial reload, problem-reporting modes, and the removal of "Re-check Problems".
- [X] T028 [P] In `specs/014-doorstop-validation-diagnostics/spec.md`, append to FR-013: "(Superseded by spec 032 FR-014: re-check via the tree-view Refresh button; the command was removed.)"
- [X] T029 Run `npm run compile`, `npm test`, and `cd server && pytest`; all must be green. Then confirm that `grep -rhoE "Spec 032 FR-0[0-9]{2}" server/tests src/test | sort -u` lists FR-001 to FR-023 (Principle VIII).
- [X] T039 [P] Update `README.md` (server section, if it describes how problems are checked) and the `CHANGELOG.md` Unreleased line to "Problem checks run in a separate background process; the editor and server stay responsive on large trees".
- [X] T040 Run `npm run compile`, `npm test` and `cd server && pytest`; all must be green. Confirm that `grep -rhoE "Spec 032 FR-0[0-9]{2}" server/tests src/test | sort -u` lists FR-001 to FR-023, and that `grep -rnE "request_lock|validation_generation" server/src` finds nothing.
- [ ] T030 (SC-006 measured: one-item partial reload 221 ms vs full 10,855 ms on 1,500 items = 2%; UI rows 1–7 still need a manual run) Walk through [quickstart.md](quickstart.md) rows 1–8 on a large tree, and measure SC-001 and SC-006 using the Server-Timing output. Needs T031–T040 first.

---

## Dependencies

- T001 → T008. T002 → T008. T003 → T010. T004 → T016.
- **US1** (T005–T010) depends on Phase 1–2 only.
- **US2** (T011–T014) depends on T009 (T014 replaces it) and is otherwise independent of US1's client side.
- **US3** (T015–T017) depends on T004 and T010.
- **US4** (T018–T025) depends on T010 and T016 (`checkExplicitly`). T024 depends on T017 (the `problems` getter).
- **US1 rework** (T031–T038): T032 → T033 → T034, then T036 and T037 (both need `Validator`). T035 and T038 are independent. T031 is written first and fails until T037.
- Polish runs after all stories. T039 and T040 come after the rework.

## Parallel examples

- Phase 2: T003 ∥ T004 (T002 is server-side, also parallel).
- US1: T005 ∥ T006, then T007 → T008 (server) ∥ T010 (client).
- US1 rework: T031 ∥ T032 ∥ T035 ∥ T038, then T033 → T034 → T036 → T037.
- US2: T011 ∥ T012, then T013 → T014.
- US4: T018 ∥ T019 ∥ T020 ∥ T021, then T022 → T023 → T024 → T025.

## Implementation strategy

1. **MVP = Phase 1–3 plus 3b (US1)**: the blocking is gone, and the check no longer affects response times (Principle I v1.6.0).
   The remaining open work is Phase 3b, T039, T040 and the manual T030.
2. Add US2 (server speed), then US3 (visibility), then US4 (modes and button, removal of `recheckProblems`).
3. Finish with Phase 7. T029 is the Definition of Done (constitution Development Workflow).

## Phase 8: Convergence

- [X] T041 CRITICAL: in `server/src/doorstop_server/deps.py` `get_tree`, move `state.validator.cancel("changed")` to after the `yield`, and call it only when the request changed fingerprinted files (`written` is not empty), or when the request raised (`except` branch). Publish and export then no longer cancel a check whose result is still valid. Add `# Spec 032 FR-003` to `server/tests/test_validation_background.py`: a `POST /publish` (html into `tmp_path`) during a `slow` check leaves it at 200. Per Constitution I (allowed cancellation reasons), FR-003 (contradicts)
- [X] T042 In `server/src/doorstop_server/validation_worker.py` `run`, make the item hook also raise `_Cancelled` when `multiprocessing.parent_process()` is no longer alive, and return from `run` once the parent is gone, so a running check stops when the server dies. Per FR-003 (server shutdown), research R3 C4 (partial)
