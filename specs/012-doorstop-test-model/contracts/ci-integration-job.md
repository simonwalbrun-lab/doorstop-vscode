# Contract: Automated Integration Test CI Job

**Feature**: `012-doorstop-test-model` | **Date**: 2026-09-10

Describes the new job this feature adds to `.github/workflows/ci.yml`,
alongside the existing `server-tests` and `extension-build` jobs (see
research.md §5 for why it's a separate job).

## Job identity

- **Name**: `extension-integration-tests`
- **Triggers**: Same as the existing jobs — `push` to `main`, and every
  `pull_request` (inherited from the workflow-level `on:` block; the job adds
  no trigger of its own).
- **Runner**: `ubuntu-latest`, matching the other two jobs.
- **Dependency on other jobs**: None (`needs:` omitted) — runs in parallel,
  per research.md §5.

## Steps (contract, not literal YAML)

1. Checkout the repository (`actions/checkout@v4`, matching existing jobs).
2. Set up Node (`actions/setup-node@v4`, same version/cache config as
   `extension-build`).
3. Set up Python (`actions/setup-python@v5`, same version/cache config as
   `server-tests`) so a dependency-installed interpreter is on `PATH` for
   `DoorstopServer.start()` to use (research.md §3).
4. Install server dependencies (`pip install -e .[dev]` under `server/`,
   identical to `server-tests`' step) — the suite needs a working
   `doorstop_server` module, not just `doorstop` itself.
5. Install Node dependencies (`npm ci`).
6. Run the automated suite headlessly: `xvfb-run -a npm test` (or the
   `coactions/setup-xvfb` action wrapping `npm test` — see research.md §1),
   which transitively runs `pretest` (`compile-tests` + `compile` + `lint`)
   before executing `src/test/regressionFixture.test.ts` against
   `testdata/regression`.

## Pass/fail contract (FR-013, FR-014)

- The job's exit code MUST reflect the suite's result: a failing assertion
  in `regressionFixture.test.ts` (or a compile/lint failure from the
  inherited `pretest` gate) MUST fail the job, which GitHub reports as a
  failed required check on the pull request — the same visibility every
  other `ci.yml` job's failure already gets.
- If the Doorstop server fails to start in this environment (e.g., a
  dependency-install step failed upstream in the same job), the suite's
  setup MUST throw/fail rather than silently skip its test cases, so this
  shows as a job failure too, not a false pass (spec's CI-prerequisite edge
  case, Constitution Principle III).
- The job MUST NOT be marked `continue-on-error` — a regression here is
  exactly the kind of failure this feature exists to make visible and
  blocking, not advisory.

## Non-goals for this job

- It does not replace or modify `server-tests` (server-only pytest
  coverage) or `extension-build` (packaging) — both continue unchanged.
- It does not publish artifacts (no `.vsix`, no coverage report) unless a
  future feature asks for that; this feature's scope is "run and report
  pass/fail," per spec User Story 3.
