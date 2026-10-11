# Research: 029 Empty-Folder Bootstrap

## Activation without marker
- **Decision**: add `onView:doorstop.commandsView` and `onCommand:doorstop.createDoc`; keep `workspaceContains:**/.doorstop.yml`.
- **Rationale**: the Doorstop activity-bar icon is visible in any folder; opening it activates the extension. No always-on activation.
- **Alternatives**: `onStartupFinished` (activates in every unrelated workspace; rejected).

## Server start in an empty folder
- **Decision**: remove the marker gate in `startDoorstopServer`; the server starts whenever a workspace folder is open and the extension is active.
- **Rationale**: `doorstop_server/doorstop_tree.py` calls `doorstop.build(cwd=root, root=root)`, which gives an empty tree when no documents exist; `POST /documents` then creates the document.
- **Alternatives**: start the server lazily inside `createDoc` (needs plumbing across modules; rejected). The first test against an empty git folder confirms this.

## Git detection
- **Decision**: walk up from the workspace folder looking for a `.git` entry (directory or file, which covers worktrees and submodules) using `node:fs`.
- **Rationale**: no process spawn and no dependency; matches "under git version control".
- **Alternatives**: `git rev-parse` (needs git on PATH, slower); the VS Code git extension API (optional extension).

## File dialog start
- **Decision**: `defaultUri` is the workspace folder root.
- **Rationale**: FR-010; `options.workspaceFolder` is already the folder used everywhere else in the extension.

## Waiting for the activated Python environment (FR-011, FR-012, SC-005)
- **Decision**: use the Python extension environments API: `getActiveEnvironmentPath(uri)` for the current value and `onDidChangeActiveEnvironmentPath` to react when it becomes available or changes. If no path is reported, show a one-time notice and wait; never fall back to a PATH interpreter.
- **Rationale**: the supported way to follow the environment VS Code activated; the event avoids polling, so the server starts right after activation (SC-005).
- **Alternatives**: poll with a timer (wasteful, slower); `python.defaultInterpreterPath` or `python` on PATH (forbidden by FR-012).
- **Activation impact**: the wait must not block `activate()`; start the server without awaiting when no environment is ready yet.

## Re-check before install (FR-013)
- **Decision**: after Install is chosen, call the same resolver again and compare paths; a mismatch means no install and the check restarts via `startDoorstopServer`.
- **Rationale**: the prompt is non-modal and can stay open while the user switches environments.
- **Alternatives**: close the prompt on environment change (VS Code messages cannot be closed programmatically).

## Restart Extension (FR-014)
- **Decision**: rename the command id and title; same handler path as today (`startDoorstopServer(true)`) plus a refresh of tree, commands and problems.
- **Rationale**: the spec says it replaces Restart Server; the restart already re-resolves the environment and re-checks the package.
- **Alternatives**: keep both commands (rejected by the spec assumption); a window reload (heavier, loses state).
