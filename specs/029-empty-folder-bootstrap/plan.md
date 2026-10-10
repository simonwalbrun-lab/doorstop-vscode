# Implementation Plan: Empty-Folder Bootstrap & Create Document in Commands Panel

**Branch**: `029-empty-folder-bootstrap` | **Date**: 2026-10-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/029-empty-folder-bootstrap/spec.md`

## Summary

Today the extension only activates when a `.doorstop.yml` exists (`package.json` `activationEvents`), and `startDoorstopServer` in `src/extension.ts` refuses to start the server without one. An empty folder therefore has no commands panel and no server, so a first document can never be created. Plan:

1. **Activate without a marker.** Add `onView:doorstop.commandsView` and `onCommand:doorstop.createDoc` activation events (keep the `workspaceContains` one).
2. **Start the server without a marker.** Drop the marker gate in `startDoorstopServer`; `doorstop.build(root=...)` already yields an empty tree for an empty folder, and the server needs no other change.
3. **Git precondition.** `createDoc` checks that the workspace folder is inside a git working tree (walk up for `.git`) before any prompt and shows a clear error if not (FR-004). No `git init`.
4. **Dialog start folder.** `defaultUri` of the folder dialog becomes the workspace folder (FR-010), replacing `<workspace>/<prefix>`.
5. **Move the action.** Remove `doorstop.createDoc` from `menus.view/title` in `package.json`; add a "Create Document" node to `DoorstopCommandsProvider`. The command stays in the palette (FR-005..007).
6. **Empty-tree hint.** `viewsWelcome` entry for `doorstop.treeView` pointing to the commands panel (FR-008).
7. **Refresh after first create.** The existing `run()` already refreshes the tree and commands; a test verifies no reload is needed (FR-003).
8. **Wait for the active Python environment (FR-011, FR-012, SC-005).** `getActivePythonPath` in `src/extension.ts` currently throws when no environment is active, and `startDoorstopServer` then warns and gives up. Replace this with a wait: resolve the interpreter through the Python extension API (`environments.getActiveEnvironmentPath`); if none is active, show a one-time "waiting for Python environment" notice and subscribe to `environments.onDidChangeActiveEnvironmentPath`, then start the server when it fires. No fallback to PATH python. The wait must not block `activate()` (the initial `await startDoorstopServer()` must not hang while waiting), otherwise views never register.
9. **Re-check before install (FR-013).** In `promptToInstallServerPackage`, after the user chooses Install and immediately before `installServerPackage`, re-read the active interpreter; if it differs from `pythonPath`, skip the install and call `startDoorstopServer(restart)` again for the new environment.
10. **Restart Extension (FR-014).** Rename `doorstop.restartServer` to `doorstop.restartExtension` (title "Doorstop: Restart Extension") in `package.json` and `src/extension.ts`. The handler re-resolves the environment, re-checks the package, restarts the server (`startDoorstopServer(true)`) and refreshes the tree, commands and problems views. Update user-facing strings that mention "Doorstop: Restart Server" (`src/doorstopServer.ts`, `src/diagrammPanel.ts`) and docs.
11. **Environment switch while running.** The same `onDidChangeActiveEnvironmentPath` subscription restarts the server with the new interpreter when the path changed.

## Technical Context

**Language/Version**: TypeScript (VS Code extension); Python server unchanged

**Primary Dependencies**: VS Code API and the already-used `ms-python.python` extension API (`environments`); no new dependencies

**Storage**: Files on disk (Doorstop YAML)

**Testing**: Existing extension test runner (`.vscode-test.mjs`, `src/test/*.test.ts`)

**Target Platform**: VS Code desktop, Windows/Linux CI

**Project Type**: VS Code extension + local Python server

**Performance Goals**: First document visible in the explorer within 1 minute of user time (SC-001)

**Constraints**: No window reload; cancel leaves the folder unchanged

**Scale/Scope**: about 6 source files touched

## Constitution Check

| Principle | Status |
|-----------|--------|
| I. Server single source of truth | Pass: creation still goes through `POST /documents`; the git check is a client-side precondition only |
| II. No reinvention of Doorstop | Pass |
| III. Error handling | Pass: explicit git error (FR-004), cancel paths (FR-009) |
| IV. No new dependencies | Pass: `node:fs` only |
| V. Typed, linted, tested | Pass: planned |
| VI/VIII. CI test per FR with trace comments | Planned: tests for FR-001..FR-010 in `src/test/` |
| VII. Long-running visible | Pass: server start and create already use `withDelayedProgress`; the environment wait shows a one-time notice (FR-012) |

Re-check after design: no violations.

## Project Structure

### Documentation (this feature)

```text
specs/029-empty-folder-bootstrap/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/ui-contract.md
└── tasks.md        # /speckit-tasks
```

### Source Code (repository root)

```text
package.json                 # activationEvents, remove view/title createDoc, viewsWelcome
src/extension.ts             # drop marker gate; wait for active Python env; re-check before install; doorstop.restartExtension
src/pythonEnvironment.ts     # small testable helper: resolve/wait for the active interpreter (injected API)
src/doorstopCommands.ts      # git precondition, dialog defaultUri
src/commandsProvider.ts      # "Create Document" node
src/test/                    # new test file for FR-001..FR-010
```

**Structure Decision**: Existing single extension project; no new modules (the git check is a small helper in `doorstopCommands.ts`).

## Complexity Tracking

No violations.
