# Phase 0 Research: Prompt to Install Missing Server Package

**Feature**: `016-install-server-package` | **Date**: 2026-09-11

All findings below were derived from the current implementation in
`src/doorstopServer.ts` and `src/extension.ts`, and from `server/pyproject.toml` /
`server/.github/workflows/publish.yml`. No `NEEDS CLARIFICATION` markers remain.

---

## 1. Checking whether `doorstop_server` is importable in an arbitrary interpreter

**Decision**: Spawn the selected interpreter with
`-c "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('doorstop_server') else 1)"`
and treat exit code `0` as installed, any other exit code (or a spawn error) as not
installed.

**Rationale**: `doorstop_server` is the module name `DoorstopServer.start` already
invokes via `-m doorstop_server` (`src/doorstopServer.ts`); `find_spec` answers "is
this importable" without actually importing the package (so it has no side effects
and can't fail due to the package's own import-time behavior) and without the
overhead of starting the FastAPI app and waiting on a health check. It also works
for a package that renames its distribution but keeps the same import name — the
check is against what `-m doorstop_server` actually needs, not against the PyPI
listing name (`doorstop-vscode-server`), which can legitimately differ.

**Alternatives considered**:

- *Run `python -m pip show doorstop-vscode-server`* — rejected. `pip show` answers
  "is this distribution installed," which is a different question from "is the
  module `python -m doorstop_server` needs importable" — the two could diverge (e.g.
  a broken/partial install, or a differently-named distribution providing the same
  module). Checking the actual import target is more direct and needs no
  distribution-name knowledge in the check itself.
- *Attempt `python -m doorstop_server --help` and parse the failure* — rejected. It
  is slower (imports and argument-parses the whole app), and distinguishing "module
  not found" from "found but crashed for another reason" from stderr text is fragile
  compared to a dedicated, unambiguous exit code.
- *Reuse the existing spawn-and-wait-for-health-check path and parse its stderr for
  `ModuleNotFoundError`* — rejected (this was the original assumption during
  `/speckit-specify`, revisited here): it conflates "missing package" with every
  other possible startup failure, and any change to the error string wording would
  silently break detection. A dedicated pre-flight check is unambiguous by
  construction.

---

## 2. Running the install and capturing output for progress/failure display

**Decision**: Spawn `pythonPath -m pip install doorstop-vscode-server`, streaming
`stdout`/`stderr` the same way `DoorstopServer.start` already accumulates
`recentStderr` for its own error messages. Report progress via
`vscode.window.withProgress({ location: ProgressLocation.Notification, cancellable: false }, ...)`
while the process runs, and on a non-zero exit, show the captured output (tail-
truncated, mirroring `DoorstopServer`'s existing 2000-character cap) in an error
notification.

**Rationale**: `pip install` on the selected interpreter is the same "run the user's
own environment's tool for them" approach `DoorstopServer.start` already takes for
launching the server itself — no new dependency, no assumption about a system-wide
`pip` on PATH. Streaming output (rather than collecting it only at the end) lets a
"View Output" affordance show real progress if the notification is expanded, and
reusing the truncation convention keeps failure messages consistent with the
existing startup-failure message shape (Constitution III/consistency).

**Alternatives considered**:

- *Shell out to a bare `pip install ...` on PATH* — rejected; would install into
  whatever `pip` resolves to system-wide, not necessarily the interpreter the user
  selected for this workspace — silently disconnecting the check from the install.
- *Use the Python extension's own "install package" command/API, if any* — considered
  but rejected for this feature: introduces a dependency on a Python-extension API
  surface beyond the `environments.getActiveEnvironmentPath` call already used, for
  a capability (`pip install <name>`) the extension can already perform directly
  with the tool it already spawns things with.

---

## 3. Preventing a second install from racing an in-flight one

**Decision**: Track at most one in-flight install `Promise` per interpreter path in
a small module-level map (mirroring the single `startPromise` field
`DoorstopServer` already uses for "don't start twice concurrently"). A start attempt
that finds an install already running for the same interpreter awaits the existing
promise instead of spawning a second `pip install`.

**Rationale**: FR-008 requires no concurrent installs; the existing `DoorstopServer`
class already solves the identical "collapse concurrent callers onto one in-flight
operation" problem for `start()`, so the same shape is reused rather than
introducing a new concurrency primitive.

**Alternatives considered**:

- *A boolean "installing" flag with an error on re-entry* — rejected; it would
  surface a confusing error to a second caller (e.g. a user who clicks "Restart
  Server" while an install they started is still running) instead of just letting
  them ride the same install to completion.

---

## 4. Testing the flow in `src/test` without a real interpreter or network call

**Decision**: Write the presence-check and install functions to accept an
injectable spawn function (defaulting to `node:child_process`'s `spawn`, exactly the
pattern already usable in `doorstopServer.ts`), so `src/test/serverPackageInstall.test.ts`
can substitute a fake child process that exits with a scripted code and emits
scripted stdout/stderr, deterministically exercising: module present, module
missing, install success, install failure, and the concurrent-install guard.

**Rationale**: Constitution VI requires a deterministic, headless-safe,
developer-machine-independent test. A real check against a real interpreter would
depend on what happens to be installed on the CI runner's Python, and a real install
would require network access PyPI and take an unpredictable amount of time — both
disqualifying for a suite that must be deterministic and non-interactive. Dependency
injection is the same technique the codebase already reaches for (e.g. `doorstopServer.ts`
itself is exercised via its public `start`/`restart` surface in existing tests
without a real Python process where avoidable).

**Alternatives considered**:

- *Spin up a real temporary virtualenv in the test and actually install a tiny dummy
  package from a local index* — rejected; slow, network-shaped (even a local index
  needs setup), and disproportionate to what is genuinely pure control-flow logic
  (parse an exit code, format a message, serialize concurrent callers).
- *Skip automated testing and rely on the quickstart manual walk-through only* —
  rejected; Constitution VI requires an automated, CI-runnable test for the primary
  success path, and the manual walk-through alone would not satisfy it.
