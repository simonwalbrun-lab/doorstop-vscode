# Implementation Plan: Review and Suspect-Link Actions via Problems Quick Fix

**Branch**: `017-gutter-icon-actions` | **Date**: 2026-09-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-gutter-icon-actions/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Retire the "Do Review", "Clear the Suspicion", and "Clear All Suspicions" CodeLenses and replace them with VS Code Quick Fix (`CodeAction`) entries attached to the Problems Doorstop's own validation already reports for exactly those conditions (`needs_initial_review` / `unreviewed_changes` on the `reviewed:` line, `suspect_link` on each link-entry line). This gives each action a real, clickable, left-of-line affordance (VS Code's lightbulb) without inventing any new validation logic, satisfying the requester's original "move the access point left of the line" intent within what VS Code's stable API actually allows (see spec.md's Revision note). "+ Derive Requirement" is untouched. Separately, the doorstop TreeView's inline "Review" and "Clear Suspect Link" icon buttons are removed (context menu entries for both stay exactly as they are).

## Technical Context

**Language/Version**: TypeScript (extension, `src/`) on the VS Code Extension API `^1.75.0`; no server (Python) changes — this feature is presentation-only against existing `/review` and `/clear` routes and the existing `/validate` diagnostics pipeline.

**Primary Dependencies**: VS Code Extension API only — `vscode.languages.registerCodeActionsProvider`, `vscode.CodeAction`, `vscode.CodeActionKind.QuickFix`, and the existing `vscode.DiagnosticCollection` from `src/problemsProvider.ts`. No new npm or pip dependency (Constitution IV).

**Storage**: N/A — no persisted state introduced; all mutation continues to go through the existing Doorstop server (`POST /review`, `POST /clear`).

**Testing**: `vscode-test` (mocha) in `src/test/`, extending `src/test/regressionFixture.test.ts`, which drives the real extension against the real server and the real `testdata/regression` fixture (Constitution V/VI — Doorstop is never mocked). `npm run check-types` and `npm run lint` gate the change as today.

**Target Platform**: VS Code desktop extension (Windows/macOS/Linux), same as the rest of the project.

**Project Type**: Single project — VS Code extension (`src/`) + existing local Python server (`server/`), unchanged layout. This feature touches only the extension side.

**Performance Goals**: Code Action computation for a document must stay synchronous/local (read from the already-published `vscode.Diagnostic[]` for that document — no new network call), matching the existing CodeLens provider's "no network call in `provideCodeLenses`" discipline (013 research.md §2) so Quick Fixes stay available even while the server is briefly unreachable for other things.

**Constraints**: MUST NOT invent new validation checks or duplicate Doorstop's own logic (Principle II) — Quick Fixes are only offered for `check` values Doorstop's `/validate` response already reports (`needs_initial_review`, `unreviewed_changes`, `suspect_link`). MUST reuse the existing unsaved-changes confirmation and server-call/error-handling pattern from `src/reviewLensProvider.ts` rather than reimplementing it.

**Scale/Scope**: Small, surgical change: `src/reviewLensProvider.ts` (drop three of its four lens emissions, keep the command handlers to reuse as Quick Fix targets), a new Code Action provider consuming `src/problemsProvider.ts`'s diagnostics, and `package.json` (drop `doorstop.review` / `doorstop.clear` from `view/item/context`'s `inline@2`/`inline@3` groups only — their `1_requirement@*` context-menu entries stay).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
| --- | --- |
| I. Server Is the Single Source of Truth | **Pass.** Quick Fixes call the same `POST /review` / `POST /clear` routes through `DoorstopServer.request()` that the current CodeLenses already use; no new client-side mutation path. |
| II. No Reinvention of Doorstop Functionality | **Pass.** Quick Fixes are offered only where a `vscode.Diagnostic` already exists, sourced from Doorstop's own `/validate` output via the existing `problemsProvider.ts` pipeline (spec FR-007). No new check is computed client-side. |
| III. All Features Must Include Error Handling | **Pass.** Reuses `reviewLensProvider.ts`'s existing `ensureSavedOrConfirm` / `runLensAction` error and confirmation handling for the Quick Fix command targets, rather than a new ad hoc path. |
| IV. No External Dependencies Without Justification | **Pass.** `vscode.languages.registerCodeActionsProvider` is part of the already-referenced `vscode` API; no new package. |
| V. Typed, Linted, and Tested Before It Ships | **Pass, pending execution.** `npm run check-types` / `npm run lint` gate as today; no server-side change, so no new `server/tests` obligation. |
| VI. Every Feature Ships With a CI-Runnable Test | **Pass, pending execution.** New assertions land in `src/test/regressionFixture.test.ts` (already CI-wired, already drives the real server + `testdata/regression`), covering Quick Fix availability and effect for `needs_initial_review`/`unreviewed_changes` and `suspect_link`. |

No violations identified; Complexity Tracking is not needed.

**Post-Phase-1 re-check**: research.md and data-model.md confirm the design reuses `scanRequirementDocument()`, the existing command handlers, and the existing diagnostics pipeline verbatim — no new dependency, no new client-side validation logic, and no server change was introduced during design. All six rows above still hold; the gate remains passed.

## Project Structure

### Documentation (this feature)

```text
specs/017-gutter-icon-actions/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── extension.ts             # activation; registers providers (touched: swap
│                             #   reviewLensProvider registration for the new
│                             #   code action provider's registration)
├── reviewLensProvider.ts     # touched: remove the reviewed:/links:/link-entry
│                             #   lens emissions; keep doReview/clearAllSuspicions/
│                             #   clearSuspicion command handlers as Quick Fix targets
├── reviewCodeActionProvider.ts  # NEW: CodeActionProvider reading the doorstop
│                             #   DiagnosticCollection, emitting the three Quick Fixes
├── problemsProvider.ts       # unchanged: existing diagnostics source (014)
├── deriveProvider.ts         # unchanged: "+ Derive Requirement" CodeLens stays
├── requirementTree.ts        # unchanged: row icon logic untouched (icon removal
│                             #   is a package.json menu change, not a TreeItem change)
└── test/
    └── regressionFixture.test.ts  # touched: new Quick Fix assertions against
                                    #   testdata/regression (REQ-005, REQ-007, REQ-010)

package.json                  # touched: remove `doorstop.review` / `doorstop.clear`
                               #   from view/item/context's inline@2 / inline@3 groups;
                               #   1_requirement@* context-menu entries unchanged;
                               #   remove the two retired CodeLens command titles if
                               #   no longer user-facing, keep their command IDs

testdata/regression/          # unchanged fixture; REQ-005 (needs_initial_review),
                               #   REQ-007 (one suspect link), REQ-010 (two suspect
                               #   links) already cover this feature's scenarios
```

**Structure Decision**: Single project (this repository's existing layout: `src/`
for the TypeScript extension, `server/` for the untouched Python backend). No new
top-level directories; this feature only edits existing extension source files plus
`package.json` menu contributions, and adds one new provider module.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
