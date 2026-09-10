# Research: Doorstop Regression Test Model

**Feature**: `012-doorstop-test-model` | **Date**: 2026-09-10

## 1. How should the automated suite run a real VS Code instance headlessly in CI?

**Decision**: Run the new suite through the existing `npm test` (`@vscode/test-cli` →
`@vscode/test-electron`) entry point, wrapped with `xvfb-run` (via the
`coactions/setup-xvfb` GitHub Action, or an inline `xvfb-run -a` prefix) in the
new CI job, matching the documented approach for headless `@vscode/test-electron`
on Linux runners.

**Rationale**: `@vscode/test-electron` launches a real (headed) VS Code/Electron
instance; `ubuntu-latest` GitHub runners have no display server by default, so
the process needs a virtual framebuffer. This is the standard, widely-used
pattern for this exact library in CI (it's called out in `@vscode/test-electron`'s
own docs) — not a new product dependency, just CI plumbing, so it does not
trip Constitution Principle IV (no *product* dependency is added; `xvfb` is a
build/CI-time tool, the same category as the `actions/setup-node` step already
in `ci.yml`).

**Alternatives considered**:
- *`xvfb-maven`-style manual `Xvfb :99 &` step*: works, but more brittle
  (manual PID/display-number bookkeeping) than a maintained action; rejected
  for maintainability, not correctness.
- *`--no-sandbox`/headless Electron flag only*: insufficient on its own —
  Electron/VS Code's test harness still needs a display target even in
  "headless-looking" CLI runs; still requires Xvfb underneath.
- *Running on `windows-latest`/`macos-latest` instead (which have displays)*:
  rejected — the existing `ci.yml` jobs already standardize on
  `ubuntu-latest`; introducing a second OS purely for this job adds cost and
  divergence without a corresponding requirement in the spec.

## 2. How does the automated suite get a real Doorstop server running against the fixture, consistent with Constitution Principle I?

**Decision**: Reuse the extension's existing `DoorstopServer` class exactly as
`extension.ts` does today (`getActivePythonPath()` + `server.start(projectPath, pythonPath)`),
pointed at `testdata/regression` as `projectPath`. The new CI job installs the
server's Python dependencies the same way the existing `server-tests` job
already does (`pip install -e .[dev]` under `server/`) so a `doorstop_server`-capable
Python is on `PATH` before `npm test` runs.

**Rationale**: This is the same code path the shipped extension uses in
production, so the automated suite is testing the real integration, not a
reimplementation of it — directly satisfying Principle I ("no file is read or
parsed client-side beyond what the extension already does") and giving
the strongest regression signal for the exact thing User Story 3 asks for.

**Alternatives considered**:
- *Mock `DoorstopServer.request` like `extension.test.ts`'s existing
  `definitionProvider` tests do*: appropriate for unit-style provider tests,
  but explicitly insufficient here — the whole point of this feature (FR-001,
  "server-loadable") is to catch regressions in the real server integration,
  which a mock cannot do.
- *Spin up the Python server manually via a separate CI step (`uvicorn ...`) instead of letting the extension start it*: rejected — it would test a
  different startup path than what users actually hit, and would duplicate
  logic already implemented in `doorstopServer.ts`.

## 3. Where does `getActivePythonPath()` resolve to in a CI runner with no `ms-python.python` extension installed?

**Decision**: Read `src/extension.ts:42-61` directly: `getActivePythonPath()`
has **no `PATH` fallback** — it requires the `ms-python.python` extension to
be installed and to have an active interpreter selected, and throws
otherwise. Installing and pre-configuring `ms-python.python` inside a
headless `@vscode/test-electron` CI instance is heavy (a large marketplace
download) and would exercise interpreter-selection UI plumbing that no
shipped feature area (001–010) actually depends on for its own correctness.
So the new suite does **not** go through `getActivePythonPath()` at all: it
imports `DoorstopServer` directly (the same class `extension.ts` uses) and
calls `.start(fixturePath, pythonPath)` itself, resolving `pythonPath` from
`PATH` (the `python3`/`python` the new CI job's `actions/setup-python` step
already put there — mirroring how `server-tests` already relies on that same
step). This still exercises the real server process and real HTTP API
(Principle I: UI/test surfaces talk to the server's API, not the file
system), it just supplies the interpreter path the way the test harness
reasonably can, instead of through the `ms-python.python` extension's UI.

**Rationale**: Keeps the new CI job's Python setup identical in spirit to the
existing `server-tests` job (`actions/setup-python` + `pip install -e .[dev]`),
adds no new marketplace/extension dependency, and keeps the suite's scope
tied to what the spec actually asks to be regression-tested — the shipped
feature areas' behavior against real fixture data — not the unrelated
`ms-python.python` interpreter-discovery integration.

**Alternatives considered**:
- *Install and pre-configure `ms-python.python` in the CI test instance, and
  go through `getActivePythonPath()` unchanged*: rejected — meaningfully
  heavier CI setup (extension download + interpreter-selection API calls)
  for coverage of a VS Code integration point this feature isn't asking to
  test; also makes the suite depend on a marketplace extension's exact API
  shape rather than just Doorstop server behavior.
- *Set an explicit `doorstop.pythonPath` workspace setting in the fixture's
  `.vscode/settings.json` and add a `PATH` fallback to `getActivePythonPath()`
  itself*: changing shipped extension code to add a fallback is a bigger,
  separate change than this test-infrastructure feature's scope — worth
  proposing later, but not required to satisfy this spec's FRs, since the
  suite can resolve the interpreter itself without touching `extension.ts`.

## 4. What minimal fixture shape satisfies every shipped feature area without becoming unmaintainable?

**Decision**: One root document (e.g. prefix `REQ`) plus two child documents —
one populated (e.g. prefix `ARCH`, `parent: REQ`) and one deliberately empty
(zero items) — under `testdata/regression/`, sized in the tens of items total
(per spec Assumptions: "one shared fixture project ... at a basic level").
Item states (plain, linked, derived, suspect, dangling, reviewed,
cleared, heading-only, minimal-text, long-text) are distributed across a
small, deliberately named set of items (e.g. `REQ-001`…`REQ-010`) rather than
one item per state family, so the fixture stays small enough to read and
maintain by hand.

**Rationale**: Directly satisfies FR-001–FR-007 with the smallest fixture
that still lets every checklist step point at a specific, named item —
matching SC-003 ("identify which fixture item to use... within 2 minutes").

**Alternatives considered**:
- *One item per individual state (dozens of near-duplicate items)*: rejected
  as needless size/maintenance overhead — spec Assumptions explicitly says a
  single shared fixture "at a basic level" is sufficient, and several states
  (e.g., suspect + reviewed) can coexist on carefully chosen individual items.
- *Generating the fixture programmatically at test-time instead of checking
  it in*: rejected — spec Assumptions explicitly calls this "a static,
  checked-in fixture rather than a generated-on-demand project," so both the
  manual checklist and the automated suite read from the same on-disk state.

## 5. How does the new CI job avoid duplicating the existing `server-tests`/`extension-build` jobs?

**Decision**: Add a third, independent job (`extension-integration-tests`) to
`.github/workflows/ci.yml`, running in parallel with the other two (same
`on: push`/`pull_request` triggers, no `needs:` dependency on the others,
since it needs its own Python+Node setup regardless and gains nothing by
serializing after them).

**Rationale**: Keeps each job's failure independently attributable (a
regression this suite catches shows as its own red check, distinct from a
server-unit-test failure or a packaging failure), matching FR-014's
"clear, visible failure attributable to that feature."

**Alternatives considered**:
- *Extend the existing `extension-build` job with an extra step*: rejected —
  would conflate "does it build/package" with "does it still behave
  correctly," muddying which failure means what, and would force the
  integration suite to wait on packaging steps it doesn't need.
