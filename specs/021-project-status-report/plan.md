# Implementation Plan: Commands Panel Updates & Project Status Report

**Branch**: `021-project-status-report` | **Date**: 2026-10-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/021-project-status-report/spec.md`

## Summary

This feature makes three changes, all in the extension:

1. Publish gets an `all` choice (reusing the existing `chooseDocumentOrAll`
   picker). It loops over the existing per-document publish endpoint, stopping at the
   first failing document with an error (fail fast).
2. Every command shows the editor's progress notification while its server work
   runs, and can't be launched twice in parallel. Both are added at one
   choke point, `run(title, op)` in `src/doorstopCommands.ts`.
3. A new `doorstop.statusReport` command writes `doorstop-status.md` with
   Mermaid `xychart` bar charts:
   - items per document (from `GET /tree`);
   - problems per type for each document (from `GET /validate`, grouped by
     `check`);
   - 26-week requirement volatility (from `git log --name-only`).

The server is unchanged and no dependency is added.

## Technical Context

**Language/Version**: TypeScript (VS Code extension, engine `^1.75.0`). Python
server unchanged.

**Primary Dependencies**: VS Code Extension API, Node stdlib (`child_process`,
`path`). No new packages.

**Storage**: one generated file, `<workspace>/doorstop-status.md`.

**Testing**: vscode-test (`src/test`, run in CI via `xvfb-run -a npm test`).
Existing pytest publish tests.

**Target Platform**: VS Code desktop (Windows/macOS/Linux). `git` on PATH is
needed for volatility only.

**Project Type**: VS Code extension + local Python server (desktop tool).

**Performance Goals**: report < 10 s for 10 documents / 2,000 items (SC-004).
Progress visible within 1 s of the work starting (SC-002).

**Constraints**: the report must render on GitHub (Mermaid `xychart`). No
partial report is written on a data-fetch failure.

**Scale/Scope**: about 4 source files touched, 1 new source file, 1 new test file.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Note |
| --------- | ------ | ---- |
| I. Server is source of truth | PASS | Item and problem data come only from `/tree` and `/validate`. Publish still goes through the server, and its lock serializes the per-document calls. Git history is not Doorstop data. |
| II. No reinvention of Doorstop | PASS | Rendering stays in Doorstop's `publisher.publish`. Problem types are the server's `check`. No item parsing in the extension: volatility looks only at file names and paths of changed files. |
| III. Error handling | PASS | Publish All stops at the first failing document and names it in the error. The report fails cleanly with no write when `/tree` or `/validate` fails. A git failure only marks its section unavailable. The busy guard is released in `finally`. |
| IV. No unjustified dependencies | PASS | No packages added. Uses `child_process.execFile` from the Node stdlib. |
| V. Typed/linted/tested | PASS | Normal `check-types` / `lint` gates. No server change, so no new pytest is needed. |
| VI. CI-runnable test | PASS | `src/test/statusReport.test.ts`, a pure-function test that needs no server or git, runs in the existing `extension-integration-tests` job. Per-document publish is covered by `server/tests/test_documents.py::test_publish_*`. |

Post-design re-check (after Phase 1): unchanged, all PASS.

## Project Structure

### Documentation (this feature)

```text
specs/021-project-status-report/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── commands.md
│   └── status-report-format.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
src/
├── doorstopCommands.ts    # busy guard + progress in run(title, op),
│                          #   publish "all", doorstop.statusReport handler
├── statusReport.ts        # NEW: buildStatusReport(), parseGitLog(), weekly buckets,
│                          #   readVolatility() (execFile git)
├── commandsProvider.ts    # + "Generate Status Report" row
└── test/
    └── statusReport.test.ts   # NEW
package.json               # + doorstop.statusReport command contribution
```

**Structure Decision**: This is the existing single-extension layout. The only
new module is `statusReport.ts`, so the Markdown/chart logic is a pure,
testable function and stays out of the already long `doorstopCommands.ts`.

## Complexity Tracking

No violations. Nothing to justify.
