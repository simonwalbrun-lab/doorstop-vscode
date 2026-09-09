# Feature Specification: Doorstop Server Connection & Lifecycle

**Feature Branch**: `N/A (retroactive documentation)`

**Created**: 2026-09-09

**Status**: Implemented (reverse-engineered from existing code)

**Input**: User description: "Reverse-engineered from existing implementation — see CHANGELOG.md and README.md for release history."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automatic server startup on workspace open (Priority: P1)

As a developer opening a workspace containing a Doorstop project, I want the extension
to automatically find my Python environment and start the local Doorstop server, so
that every requirement feature works without manual setup.

**Why this priority**: Nothing else in the extension functions without a running
server; this is the entry point every other feature depends on.

**Independent Test**: Open a workspace with a `.doorstop.yml` marker and a configured
Python interpreter; confirm the server becomes reachable (health check succeeds)
without running any command manually.

**Acceptance Scenarios**:

1. **Given** a workspace containing a `.doorstop.yml` marker and a Python interpreter
   selected via the Python extension, **When** the extension activates, **Then** it
   starts the local server pointed at the workspace and waits until its health
   endpoint responds before other features query it.
2. **Given** a workspace with no `.doorstop.yml` marker anywhere, **When** the
   extension activates, **Then** no server is started and no error is shown.
3. **Given** a workspace with a marker but no Python interpreter selected, **When**
   the extension activates, **Then** the user sees a warning explaining a Python
   environment must be selected, and no crash occurs.

---

### User Story 2 - Manual restart (Priority: P2)

As a developer, after installing/upgrading the server package or hitting a stuck
connection, I want to restart the server without reloading VS Code.

**Why this priority**: A recovery path used occasionally, not daily.

**Independent Test**: Run "Doorstop: Restart Server" while the server is already
running; confirm it stops and restarts cleanly and subsequent requests succeed.

**Acceptance Scenarios**:

1. **Given** a running server, **When** the user runs "Doorstop: Restart Server",
   **Then** the old process is stopped and a new one is started and becomes healthy.
2. **Given** the server fails to become healthy after restart, **When** the timeout
   elapses, **Then** the user sees an error message including recent server output.

---

### User Story 3 - Graceful shutdown (Priority: P3)

As a developer closing VS Code or the workspace, I want the background server
process to be cleaned up automatically.

**Why this priority**: Prevents orphaned processes/port conflicts; invisible unless
it fails.

**Independent Test**: Close the workspace/VS Code and confirm the server process is
not left running (port free for the next session).

**Acceptance Scenarios**:

1. **Given** a running server, **When** the extension is deactivated, **Then** the
   server process is terminated.

---

### Edge Cases

- How does the system handle the fixed server port already being in use by another
  process?
- What prevents multiple server processes/workers from ever running against the same
  project at once (which would break the single-writer guarantee other features rely
  on)?
- What happens when a workspace contains multiple `.doorstop.yml` files but none of
  them (or more than one of them) has no `parent:` specified — i.e. the tree has no
  single root document, or more than one? Doorstop refuses to build a tree in this
  case: the server process itself stays up and `/health` still reports healthy (it
  never touches the tree), but every other request fails with a structured error
  the moment it tries to build the tree, because the tree is rebuilt fresh on every
  request rather than once at startup.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST detect Doorstop workspaces by locating a `.doorstop.yml`
  marker file before attempting to start a server.
- **FR-002**: System MUST resolve the active Python interpreter via the Python
  extension and use it to launch the local Doorstop server process.
- **FR-003**: System MUST wait for the server's health endpoint to report ready
  before other features (tree, hover, commands) issue requests against it.
- **FR-004**: System MUST warn the user, without crashing, when no workspace folder
  is open, no Doorstop marker is found, or no Python interpreter is available.
- **FR-005**: Users MUST be able to manually restart the server via a command,
  without reloading the VS Code window.
- **FR-006**: System MUST surface recent server output/errors to the user when
  startup or restart fails.
- **FR-007**: System MUST terminate the background server process when the
  extension is deactivated.
- **FR-008**: Server MUST process incoming requests one at a time (single-worker,
  request-serialized) so concurrent operations never corrupt the underlying
  Doorstop repository.
- **FR-009**: Server MUST respond to health checks even while a slow request is
  being processed (health checks are exempt from the serialization queue).
- **FR-010**: Server MUST return every error as a structured, typed response rather
  than an unhandled exception, distinguishing domain errors (e.g. unknown
  document/item) from unexpected internal errors.
- **FR-011**: Health checks MUST reflect only "the server process is running", not
  "the Doorstop tree is valid" — the tree is rebuilt fresh from disk on every
  data-bearing request (by design, so hand-edits made outside VS Code are always
  picked up), so a workspace with no single root document (zero or more than one
  document with no `parent:`) still reports a healthy server, but every other
  request MUST fail with a structured error rather than succeeding against a
  broken or partial tree.

### Key Entities

- **Doorstop Workspace Marker**: a `.doorstop.yml` file identifying a folder as
  a Doorstop document. A workspace normally contains several (one per
  document); the presence of at least one is what triggers server startup. The
  project's single root document is whichever one has no `parent:` specified —
  determined by the Doorstop library when it builds the tree, not by the
  extension's marker search.
- **Server Process**: the local HTTP server instance bound to a fixed port, scoped
  to one project root, alive for the life of the extension session.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can open a Doorstop workspace and use any requirement
  feature (tree, hover, commands) within a few seconds, without running a setup
  command.
- **SC-002**: A developer encountering a stuck server can recover without
  restarting their editor, in under 30 seconds.
- **SC-003**: No background server process remains running after the
  workspace/editor is closed.
- **SC-004**: Every error returned by the server is understandable (a structured
  code and message) rather than a raw stack trace, in 100% of observed failure
  cases.

## Assumptions

- Exactly one Doorstop server process is expected per workspace/session;
  multi-root workspaces with multiple Doorstop projects are not explicitly handled
  today.
- The fixed server port is assumed free; no port-conflict fallback exists today.
- Python and the `doorstop`/`fastapi`/`uvicorn` packages are assumed already
  installed per the README's setup instructions before first use.
