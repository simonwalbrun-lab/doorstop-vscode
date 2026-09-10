# Implementation Plan: Doorstop Regression Test Model

**Branch**: `012-doorstop-test-model` | **Date**: 2026-09-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/012-doorstop-test-model/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Add a single checked-in Doorstop project fixture (`testdata/regression/`) that
deliberately covers every state the extension's currently shipped features
read or act on — normal/suspect/dangling links, an empty document, minimal
and long item text, a persisted diagram — paired with a human-readable
regression checklist mapping each shipped feature area to a fixture
element and expected outcome. Extend the existing `npm test`
(`@vscode/test-cli` / `@vscode/test-electron`) integration suite with a new
test file that opens the fixture as its workspace, starts the real Doorstop
server against it (same `DoorstopServer.start()` path the extension already
uses — Constitution Principle I), and exercises the same feature areas
programmatically. Wire that suite into a new job in the existing
`.github/workflows/ci.yml` pipeline so it runs automatically on every push
and pull request, alongside the current `server-tests` and `extension-build`
jobs, and fails the pipeline visibly on a regression.

## Technical Context

**Language/Version**: TypeScript (extension, Node 24 per CI) for the automated integration test suite; the fixture itself is data only (Doorstop's YAML item files + `.doorstop.yml` markers) — no new server-side (Python) code

**Primary Dependencies**: `@vscode/test-cli` + `@vscode/test-electron` (already a devDependency, already wired to `npm test`) for the automated suite; `doorstop`/FastAPI server (`server/`, already present) is exercised as-is, not modified

**Storage**: Plain files — the fixture is a real Doorstop project (`.doorstop.yml` document markers + per-item `.yml` files) and one `*.doorstop.json` diagram file, checked into the repository; no database

**Testing**: `npm test` (Mocha via `@vscode/test-cli`/`@vscode/test-electron`) for the new automated integration suite; the existing `server/tests` pytest suite is unaffected and unchanged by this feature

**Target Platform**: Local developer machines (Windows/macOS/Linux) for the manual checklist; `ubuntu-latest` GitHub Actions runners (matching the existing `ci.yml` jobs) for the automated pipeline run

**Project Type**: Existing VS Code extension + local Python server monorepo (repo-root TypeScript extension, `server/` Python package) — this feature adds a fixture directory and one new CI job, no new top-level project

**Performance Goals**: No new performance target on the extension/server themselves; the added CI job should complete within a normal CI job's time budget (comparable to the existing `extension-build`/`server-tests` jobs) so it doesn't materially slow down pull request feedback

**Constraints**: Automated suite MUST run headless on a CI runner with no pre-existing display server (VS Code integration tests require a display); MUST NOT require network access or paid/external services beyond what the existing pipeline already uses (Constitution Principle IV); MUST leave the fixture unchanged on disk after a run (spec FR item, checklist re-runnable)

**Scale/Scope**: One fixture project (a handful of documents, dozens of items, one diagram file) exercised by roughly one new Mocha suite file and one new CI job — not a new subsystem

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Status |
| --- | --- | --- |
| I. Server Is the Single Source of Truth | The automated suite starts the real Doorstop server against the fixture via the extension's existing `DoorstopServer.start()`/`getActivePythonPath()` path and drives it only through the same commands/API calls the extension already uses. No file parsing is added on the client side, and the fixture itself is just data Doorstop already understands. | PASS |
| II. No Reinvention of Doorstop Functionality | The fixture is an ordinary Doorstop project (created via Doorstop's own item format); nothing about link/suspect/review computation is reimplemented — the server (and Doorstop) compute it as they already do. | PASS |
| III. All Features Must Include Error Handling | FR-012–FR-014 require the CI job to fail clearly and visibly (not silently skip or false-pass) when the fixture-driven suite finds a regression or when the server itself fails to start in CI — treated as a first-class failure path in the job definition, not a follow-up. | PASS |
| IV. No External Dependencies Without Justification | No new npm or Python package is required: `@vscode/test-cli`/`@vscode/test-electron` are already devDependencies wired to `npm test`; running them headless on `ubuntu-latest` needs a virtual display, which GitHub's own runners support via the standard `xvfb-action` (or equivalent) — this is CI plumbing, not a product dependency, and is the standard way every VS Code extension runs `@vscode/test-electron` in headless CI. Documented as a research decision (see research.md) rather than silently added. | PASS |
| V. Typed, Linted, and Tested Before It Ships | The new suite file is TypeScript under `src/test/`, so it is covered by the existing `compile-tests`/`check-types`/`lint` gates already required before `npm test` runs (`pretest` script) — no new gate needed, just actually invoking `npm test` in CI, which today it is not. | PASS |

No violations to record in Complexity Tracking.

**Post-Phase-1 re-check**: research.md, data-model.md, contracts/, and
quickstart.md introduced no new dependency, no client-side re-parsing of
Doorstop files, and no bypass of the server API beyond what's already
justified above (the suite calls `DoorstopServer.start()`/`.request()`
directly rather than through `getActivePythonPath()`'s `ms-python.python`
dependency — see research.md §3 — which is a test-harness wiring choice, not
a new architectural layer). All five principles still PASS; no updates
needed to the table above.

## Project Structure

### Documentation (this feature)

```text
specs/012-doorstop-test-model/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── fixture-layout.md
│   └── ci-integration-job.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
testdata/
└── regression/                    # NEW — the checked-in Doorstop fixture project
    ├── CHECKLIST.md                # NEW — the human-readable regression checklist (FR-008)
    ├── .doorstop.yml                # NEW — root document marker (prefix e.g. REQ)
    ├── REQ-001.yml … REQ-00N.yml    # NEW — items covering FR-002–FR-006 states
    ├── children/
    │   ├── ARCH/.doorstop.yml       # NEW — a child document (parent: REQ)
    │   ├── ARCH-001.yml …
    │   └── EMPTY/.doorstop.yml      # NEW — the empty document (FR-005), no items
    └── diagram.doorstop.json        # NEW — persisted diagram fixture (FR-007)

src/
└── test/
    ├── extension.test.ts            # EXISTING — unchanged
    └── regressionFixture.test.ts    # NEW — automated suite (US3): opens testdata/regression
                                      #        as its workspace, starts the real server
                                      #        against it, and exercises the feature areas
                                      #        the manual checklist covers

.vscode-test.mjs                     # MODIFIED — add a second test project/config whose
                                      #            workspaceFolder is testdata/regression,
                                      #            so the new suite runs against that fixture
                                      #            without disturbing the existing suite's
                                      #            (workspace-less) run

.github/workflows/
└── ci.yml                           # MODIFIED — new `extension-integration-tests` job:
                                      #            checkout, setup-node, setup-python,
                                      #            install server deps, npm ci, npm test
                                      #            (headless via xvfb), runs on every
                                      #            push/PR alongside server-tests and
                                      #            extension-build (FR-013)
```

**Structure Decision**: This feature adds data (the fixture + checklist) and
one new test file to the existing single-repo extension+server layout — it
does not introduce a new top-level project. The fixture lives under
`testdata/` (sibling to `src/` and `server/`) so it reads clearly as sample
data rather than product code, is reachable at a fixed, documented path by
both the manual checklist and the automated suite (FR-010), and is excluded
from the packaged `.vsix` the same way `testdata/reqs` was already implied
to be in the 011 feature's quickstart. The automated suite is added to the
existing `npm test` entry point (not a separate test runner) so it inherits
the same type-check/lint gates as every other extension test, per
Constitution Principle V.

## Complexity Tracking

*No Constitution Check violations — table intentionally omitted.*
