# Implementation Plan: Progress Notifications for Long-Running Commands

**Branch**: `026-long-running-progress` | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/026-long-running-progress/spec.md`

## Summary

Every user-triggered operation that sends work to the Doorstop server shows a
progress notification once its work has run for 1 second, and none if it
finishes sooner. One new helper, `withDelayedProgress(title, work)` in
`src/progress.ts`, starts the work, arms a 1 s timer and, if the work is still
running, hands the same promise to `vscode.window.withProgress`. The existing
`run()` helper in `src/doorstopCommands.ts` switches to it, and the remaining
call sites (server start/restart, Refresh, Recheck Problems, document view
open/save, diagram load and canvas actions, Derive, review lens actions)
wrap their work, after any prompts, in it. Install Server Package keeps its
immediate notification.

## Technical Context

**Language/Version**: TypeScript (strict), VS Code Extension API (`engines.vscode` per package.json)

**Primary Dependencies**: VS Code Extension API only — no new dependencies

**Storage**: N/A

**Testing**: vscode-test (mocha) suite in `src/test/` — new `progress.test.ts`

**Target Platform**: VS Code desktop (Windows, Linux, macOS), CI on GitHub Actions

**Project Type**: VS Code extension (TypeScript) + local Python server (unchanged)

**Performance Goals**: Toast visible ≤ 1.2 s after work start (SC-001); closed ≤ 0.5 s after work ends (SC-003)

**Constraints**: No toast during user input (FR-005) or background work (FR-006); no change to error messages (FR-004)

**Scale/Scope**: 1 new module (~30 lines), ~11 call sites in 7 existing files, 1 new test file

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Note |
| --------- | ------ | ---- |
| I. Server is single source of truth | ✅ | No server change; extension only wraps existing requests |
| II. No reinvention of Doorstop | ✅ | Not touched |
| III. Error handling | ✅ | Helper rethrows the original error, never swallows it, no unhandled rejection (contract G5); existing messages unchanged |
| IV. No new dependencies | ✅ | Native `withProgress` + `setTimeout`; sinon fake timers rejected (research R4) |
| V. Typed, linted, tested | ✅ | `npm run compile` gate unchanged |
| VI. CI-runnable test | ✅ | `src/test/progress.test.ts` runs in the existing `extension-integration-tests` CI job, real timers, deterministic margins |
| VII. Long-running ops visible | ✅ | This feature implements v1.3.0 of the principle |

**Post-design re-check**: ✅ all pass; no violations, Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/026-long-running-progress/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── delayed-progress.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── progress.ts              # NEW: withDelayedProgress, setProgressForTest
├── doorstopCommands.ts      # run() → withDelayedProgress; doorstop.refresh awaits load
├── extension.ts             # server start/restart, doorstop.recheckProblems
├── documentViewProvider.ts  # open, save write loop
├── diagrammPanel.ts         # diagram load, canvas link/create requests
├── deriveProvider.ts        # derive add+link
├── reviewLensProvider.ts    # runLensAction send()
└── test/
    └── progress.test.ts     # NEW: slow / fast / failing cases
```

**Structure Decision**: Single extension project; one new module next to
`timing.ts`, call sites edited in place. No server (`server/`) changes.

## Complexity Tracking

None.
