# Feature Specification: Empty-Folder Bootstrap & Create Document in Commands Panel

**Feature Branch**: `029-empty-folder-bootstrap`

**Created**: 2026-10-10

**Status**: Draft

**Input**: User description: "If I setup a new project I need to be able to start from scratch. It shall be possible to start with an empty folder. Further move the doorstop create document from the doorstop treeview to the doorstop command panel"

## Clarifications

### Session 2026-10-10

- Q: What happens when the empty/new folder is not under git version control? → A: Creation is refused with a clear error message explaining that the folder must be under git version control (no automatic `git init`).
- Q: Where does the file dialog start when adding a new document? → A: In the current working directory (the open workspace folder).
- Q: Which Python interpreter does the extension use, and when? → A: Only the interpreter of the Python environment VS Code has activated for the workspace; the extension waits until VS Code has activated it and never falls back to another interpreter.
- Q: What must happen before the extension installs a missing server package? → A: It re-checks that the active Python environment is still the one it was about to install into; if it changed, nothing is installed into the old one and the flow restarts for the new environment.
- Q: How can a user restart the extension? → A: A "Doorstop: Restart Extension" command in the command palette that re-resolves the active Python environment, re-checks the server package, restarts the server and refreshes the views (it replaces the former "Doorstop: Restart Server").

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Start a Doorstop project in an empty folder (Priority: P1)

A user opens an empty folder in the editor. The Doorstop extension is available even though no Doorstop document exists yet, and the user can create the first document directly from the Doorstop commands panel without any manual preparation outside the editor.

**Why this priority**: Without this, a new project cannot be started inside the tool at all; it is the entry point to everything else.

**Independent Test**: Open an empty folder, open the Doorstop commands panel, run "Create Document", and confirm a first document exists and appears in the Doorstop explorer.

**Acceptance Scenarios**:

1. **Given** an empty folder is open and no Doorstop document exists, **When** the user opens the Doorstop commands panel, **Then** it is visible and offers "Create Document".
2. **Given** an empty folder is open, **When** the user completes "Create Document" (prefix, location), **Then** the document is created, the extension becomes fully active, and the document shows up in the explorer without reloading the window.
3. **Given** the folder is not under git version control, **When** the user tries to create the first document, **Then** a clear error message states that the folder must be under git version control, and nothing is created.
5. **Given** the user creates a document, **When** the file dialog opens, **Then** it starts in the current working directory.
4. **Given** the extension's server/tooling is not yet running because no project existed, **When** the first document is created, **Then** the connection is established automatically.

---

### User Story 2 - Create Document lives in the commands panel (Priority: P2)

"Create Document" is no longer an action in the Doorstop explorer tree (toolbar/context entry) and is instead offered in the Doorstop commands panel alongside the other commands.

**Why this priority**: Consolidates project-level actions in one place; also required so the action is reachable when the tree is empty.

**Independent Test**: With an existing project, confirm the tree no longer shows a Create Document action, and the commands panel does and works.

**Acceptance Scenarios**:

1. **Given** a project with documents, **When** the user looks at the explorer tree's toolbar and context menus, **Then** no "Create Document" entry is present.
2. **Given** the same project, **When** the user opens the commands panel, **Then** "Create Document" is listed and creates a document as before.
3. **Given** the command palette, **When** the user searches "Doorstop: Create Document", **Then** it is still available.

---

### Edge Cases

- Folder contains unrelated files but no Doorstop document: treated like an empty project.
- User cancels the prompts mid-way: nothing is created and no error is shown.
- Folder is not under git: see FR-004 (error, no files created).
- No Python environment is active yet (still being activated, or none selected): the extension waits, tells the user once that it is waiting for the Python environment, and starts the server when the environment becomes active; no other interpreter is tried.
- The user switches the Python environment while running: the server is restarted with the new environment's interpreter.
- The environment changes between the install prompt and the install: the install is cancelled for the old environment and the check restarts for the new one.
- Prefix collides with an existing document: user gets a clear message and can retry.
- Multi-root workspace: the user chooses which folder receives the document.
- Tree is empty: tree shows a hint pointing to the commands panel.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The extension MUST be usable (commands panel visible, Create Document runnable) in a folder that contains no Doorstop document.
- **FR-002**: Users MUST be able to create the first document of a project from the commands panel without prior manual setup outside the editor.
- **FR-003**: After the first document is created, the extension MUST become fully active (explorer, connection, features) without a window reload.
- **FR-004**: If the folder is not under git version control, the system MUST refuse to create a document and show a clear error message stating the requirement; it MUST NOT initialise version control automatically.
- **FR-010**: The file dialog shown when creating a document MUST start in the current working directory (the open workspace folder; in a multi-root workspace, the chosen folder).
- **FR-011**: The extension MUST start the Doorstop server only with the interpreter of the Python environment VS Code has activated for the workspace, and MUST wait for that activation to finish before starting it (including for the first-document flow in an empty folder).
- **FR-012**: The extension MUST NOT fall back to any other interpreter (for example one found on the system path); while no environment is active it MUST say that it is waiting for the Python environment.
- **FR-013**: Immediately before installing a missing server package, the extension MUST re-check that the active Python environment is the same one the install was offered for; if not, it MUST NOT install into the old environment and MUST restart the check for the new one.
- **FR-014**: The command palette MUST offer "Doorstop: Restart Extension", which re-resolves the active environment, re-checks the server package, restarts the server and refreshes the Explorer, Commands and Problems views.
- **FR-005**: "Create Document" MUST be removed from the explorer tree's toolbar and context menus.
- **FR-006**: "Create Document" MUST be listed in the commands panel and behave as before once invoked.
- **FR-007**: "Create Document" MUST remain available from the command palette.
- **FR-008**: When no documents exist, the explorer MUST show guidance pointing to the commands panel.
- **FR-009**: Cancelling any step of creation MUST leave the folder unchanged.

### Key Entities

- **Project folder**: The opened folder that holds (or will hold) Doorstop documents; may be empty.
- **Document**: A Doorstop document (prefix, location) that is the first artifact of a new project.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From an empty folder, a user creates a first document and sees it in the explorer in under 1 minute, with no window reload.
- **SC-002**: 100% of explorer tree menus contain no "Create Document" entry, while the commands panel and command palette both do.
- **SC-003**: A user starting from an empty folder completes the first-document flow on the first attempt without consulting external documentation.
- **SC-004**: Cancelling at any step leaves zero new files in the folder.
- **SC-005**: With the Python environment still activating at startup, the server starts on its own within 5 seconds after the environment becomes active, with no manual restart and no use of any other interpreter.

## Assumptions

- Existing "Create Document" behaviour and prompts (prefix, parent, settings for format/digits/separator) are reused unchanged.
- Git version control is a hard prerequisite; the user initialises it themselves.
- No migration is needed for existing projects; only the entry point moves.
- "Restart Extension" replaces the existing "Doorstop: Restart Server" command rather than adding a second one.
- Creating further documents later uses the same commands-panel entry.
