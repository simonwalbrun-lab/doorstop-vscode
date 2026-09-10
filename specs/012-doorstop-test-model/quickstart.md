# Quickstart: Doorstop Regression Test Model

**Feature**: `012-doorstop-test-model` | **Date**: 2026-09-10

## Prerequisites

- Node dependencies installed (`npm ci`).
- A Python environment with the server installed in editable mode
  (`pip install -e .[dev]` from `server/`), and its interpreter reachable
  on `PATH` as `python3`/`python`.
- No network access or external accounts required beyond that (spec SC-004).

## Scenario 1 — Manual regression pass (User Story 1 / FR-001–FR-011)

1. Open the repository in VS Code, then open `testdata/regression` as (or
   within) your workspace.
2. Confirm the Doorstop server starts automatically (per `001-server-connection-lifecycle`)
   against the fixture — the Explorer tree populates with the `REQ`, `ARCH`,
   and `EMPTY` documents.
3. Open `testdata/regression/CHECKLIST.md` and follow it top to bottom, one
   row per shipped feature area.
4. **Expect**: every step references a specific fixture item/document by
   name and completes with the outcome the checklist documents — see
   `contracts/fixture-layout.md`'s invariants for what "correct" means for
   links, the empty document, and the dangling-link case.
5. **Expect**: after finishing, `git status` shows no unintended changes
   under `testdata/regression/` (any edits made while exercising item
   lifecycle commands were reverted per the checklist's own instructions).

## Scenario 2 — Edge-case coverage spot check (User Story 2 / FR-003–FR-006)

1. In the Explorer tree, open the `EMPTY` document.
2. **Expect**: it renders with zero items, no error.
3. Hover `REQ-007` (the suspect-link item) in its editor.
4. **Expect**: the hover preview shows the link as suspect; running
   Doorstop: Clear Suspect on it clears the flag.
5. Hover or go-to-definition on `REQ-009`'s link to `REQ-999`.
6. **Expect**: the broken reference is reported clearly (no crash, no
   silent no-op).

## Scenario 3 — Automated suite, local run (User Story 3 / FR-012)

```sh
npm test
```

**Expect**: `src/test/regressionFixture.test.ts` runs alongside the
existing `extension.test.ts` suites, opens `testdata/regression` as its
workspace, starts a real Doorstop server against it, and reports one
passing test per automated-covered feature area (see `CHECKLIST.md`'s
"Automated coverage" column for which rows these correspond to).

## Scenario 4 — Automated suite, CI (User Story 3 / FR-013–FR-014)

1. Open a pull request (or push to `main`).
2. **Expect**: the `extension-integration-tests` job (see
   `contracts/ci-integration-job.md`) appears alongside `server-tests` and
   `extension-build`, and passes.
3. To verify it actually catches a regression: locally, temporarily break
   one exercised behavior (e.g., make the tree provider skip suspect items),
   run `npm test`, and confirm the corresponding test fails with a message
   naming the feature area — then revert the change.
