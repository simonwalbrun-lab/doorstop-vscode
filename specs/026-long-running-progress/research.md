# Research: Progress Notifications for Long-Running Commands

## R1 — Where to apply the 1-second rule

**Decision**: One small helper, `withDelayedProgress(title, work)`, called
explicitly around the *work* part of each covered operation (after any prompts).

**Rationale**: Wrapping at the call site is the only place that knows where the
prompts end and the work begins (FR-005), which commands are user-triggered
(FR-006), and what the user-facing title is (FR-003). The existing `run()`
helper in `src/doorstopCommands.ts` already follows this pattern
("Progress … wraps only the server work, never the prompts", spec 021 FR-008);
this feature generalises its progress part and reuses it everywhere.

**Alternatives considered**:

- *Wrap every `server.request` call*: covers everything automatically, but a
  command that makes several short requests in a row (Publish all, Reorder,
  document view save) would never reach 1 s per request even when the whole
  command takes 5 s; background requests (debounced re-check, tree auto-load)
  would need extra context tracking to be excluded.
- *Wrap at `registerCommand` (like timing)*: includes prompt time, violating
  FR-005; misses server start on workspace open and webview-triggered work.

## R2 — How to show a toast only after 1 second

**Decision**: Start the work immediately; arm a 1000 ms timer. If the work has
not settled when it fires, call `vscode.window.withProgress` with
`ProgressLocation.Notification` and hand it the *same* work promise, so the
toast closes the moment the work settles. Clear the timer when the work
settles first. The rejection seen by `withProgress` is caught and dropped; the
caller still receives the original rejection unchanged.

**Rationale**: Native API, no dependency (Principle IV); the toast's lifetime
is tied to the real work promise, so it cannot outlive or undershoot it
(SC-003). Swallowing only the *copy* passed to `withProgress` avoids an
unhandled rejection without hiding errors (Principle III).

**Alternatives considered**: Status-bar progress (`ProgressLocation.Window`) —
rejected, the constitution requires a notification. Showing immediately and
hiding after a minimum time — rejected by clarification Q1.

## R3 — Duplicate runs (FR-008)

**Decision**: Keep the existing duplicate-run guard in `run()` in
`src/doorstopCommands.ts` unchanged; it now calls `withDelayedProgress`
instead of `withProgress`. Other covered operations are either not re-entrant
in practice (server start already serialises; tree load is shared via its
`loading` promise) or are single short requests.

**Rationale**: Smallest change; no new guard where no duplicate problem exists.

## R4 — Testing in CI without reading the screen (Principle VI)

**Decision**: The helper module exposes `setProgressForTest(fn)` that replaces
the `withProgress` function it calls (same pattern as `setMaxEntriesForTest`
in `src/timing.ts`). A vscode-test suite `src/test/progress.test.ts` runs the
helper with real timers and a recording fake:

1. work taking 1.5 s → fake called exactly once, at ≤ 1.2 s, and its task
   settles when the work does;
2. work taking 0.1 s → fake never called;
3. work failing after 1.5 s → fake called once, caller gets the original
   error, no unhandled rejection.

**Rationale**: The VS Code API offers no way to read open notifications, so
the call into `withProgress` is the observable boundary. Real timers keep the
test honest about the 1 s threshold; total run time ≈ 3.5 s.

**Alternatives considered**: Fake timers (sinon) — new dev dependency for a
3-second saving, rejected per Principle IV. Stubbing `vscode.window.withProgress`
directly — the API object is not guaranteed writable in the extension host.

## R5 — Covered call sites

**Decision** (each wraps only the work, after prompts):

| Operation | File | What is wrapped |
| --------- | ---- | --------------- |
| Server start / restart | `src/extension.ts` `spawnServerProcess` | `doorstopServer.start` / `restart` |
| Refresh | `src/doorstopCommands.ts` `doorstop.refresh` | `tree.refresh()` + awaiting `tree.getChildren()` (shares the load VS Code triggers) |
| Recheck Problems | `src/extension.ts` `doorstop.recheckProblems` | `problemsProvider.refreshNow()` — not `scheduleRefresh` (FR-006) |
| Open document view | `src/documentViewProvider.ts` `openDocumentView` | opening the view (loads the snapshot) |
| Save document view | `src/documentViewProvider.ts` save handler | the write loop after all confirmations |
| Diagram load | `src/diagrammPanel.ts` `refreshItemMeta()` call in the ready/load path (~line 197) | the `/tree` fetch on open |
| Diagram link/create from canvas | `src/diagrammPanel.ts` `handleAddLink`, `handleRemoveLink`, `handleCreateLinkedItem` | the server requests (after `choosePrefix`) |
| Derive | `src/deriveProvider.ts` | add + link requests after the target pick |
| Review / Clear lens actions | `src/reviewLensProvider.ts` `runLensAction` | `send()` |
| Existing `run()` commands | `src/doorstopCommands.ts` `run` | unchanged scope, delayed toast |

Install Server Package (`src/extension.ts`) keeps its immediate `withProgress`
(FR-007). Background `scheduleRefresh`, automatic tree loads from VS Code,
hover, completion, call hierarchy and notebook cells are left untouched (FR-009).
Insert Item Here / New Item Below (`insertPlaceholder`) only edit text and do no
server work, so they are not wrapped; nor is the diagram ghost preview fetch
(hover-driven, like the editor hover).
