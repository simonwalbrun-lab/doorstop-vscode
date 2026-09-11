# Feature Specification: Prompt to Install Missing Server Package

**Feature Branch**: `016-install-server-package`

**Created**: 2026-09-11

**Status**: Draft

**Input**: User description: "If the extension determins during startup that the python package doorstop-vscode-server is not installed it should bring a toast on which I can click to install the package from pypi."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One-click install when the server package is missing (Priority: P1)

As a developer opening a Doorstop workspace whose selected Python environment does
not yet have the `doorstop-vscode-server` package installed, I want the extension to
tell me exactly that and offer a button to install it, so I don't have to open a
terminal, guess the package name, or dig through a stack trace to get started.

**Why this priority**: Without this, a first-time user (or one who switched Python
interpreters) hits a raw startup failure with no clear next step. This is the single
biggest gap in the onboarding path documented in spec 001's Assumptions ("Python and
the `doorstop`/`fastapi`/`uvicorn` packages are assumed already installed").

**Independent Test**: Select a Python interpreter that does not have
`doorstop-vscode-server` installed, open a workspace containing a `.doorstop.yml`
marker, and confirm a notification appears naming the missing package with an
"Install" action, instead of a generic startup error.

**Acceptance Scenarios**:

1. **Given** a workspace with a `.doorstop.yml` marker and a selected Python
   interpreter that lacks the `doorstop-vscode-server` package, **When** the
   extension attempts to start the server, **Then** the user sees a notification
   stating the package is missing, with an "Install" action and a "Dismiss" option,
   instead of the generic server-startup error.
2. **Given** the selected interpreter already has `doorstop-vscode-server` installed,
   **When** the extension attempts to start the server, **Then** no install
   notification appears and startup proceeds as today.
3. **Given** the missing-package notification is shown, **When** the user clicks
   "Dismiss" (or closes it without choosing an action), **Then** no install is
   attempted and the server remains stopped, matching today's behavior when startup
   fails.

---

### User Story 2 - Installing from the notification starts the server (Priority: P1)

As a developer who clicked "Install" on the missing-package notification, I want the
extension to install the package into the selected interpreter and then get the
server running, so accepting the prompt is the only action I need to take.

**Why this priority**: The prompt from User Story 1 only has value if acting on it
actually unblocks the user; otherwise it's a dead end that just renames the error.

**Independent Test**: Click "Install" on the notification and confirm the package is
installed into the selected interpreter, progress is visible while it runs, and the
server becomes reachable afterward without any further manual action.

**Acceptance Scenarios**:

1. **Given** the user clicks "Install", **When** the installation starts, **Then**
   the user sees progress feedback (the install is in progress) rather than the UI
   appearing to hang.
2. **Given** the installation completes successfully, **When** it finishes, **Then**
   the extension automatically starts the server using the now-installed package and
   the user is told installation succeeded.
3. **Given** the server starts successfully after installation, **When** the user
   next runs any requirement feature (tree, hover, commands), **Then** it works
   without the user running a setup command or reloading the window.

---

### User Story 3 - Clear feedback when the install itself fails (Priority: P2)

As a developer clicking "Install" on a machine with no network access or a broken
pip configuration, I want to be told the install failed and why, so I know to fix my
environment instead of assuming the extension is broken.

**Why this priority**: An install can fail for reasons outside the extension's
control (no network, restricted registry, permission errors). This is a recovery
path, not the primary flow, but the extension must not fail silently.

**Independent Test**: Simulate a failing install (e.g. no network reachability to
PyPI) after clicking "Install" and confirm the user sees an actionable error
including relevant output, and can retry.

**Acceptance Scenarios**:

1. **Given** the install command exits with a non-zero status, **When** the failure
   is detected, **Then** the user sees an error notification including the relevant
   captured output, and the server is not started.
2. **Given** an install has just failed, **When** the user clicks "Install" again (or
   reruns server startup, e.g. via "Doorstop: Restart Server"), **Then** the
   extension attempts the install again rather than remembering the failure
   permanently.

---

### Edge Cases

- The selected interpreter has no Python environment selected at all: the existing
  "no Python interpreter available" warning (spec 001, FR-004) applies instead of
  the missing-package flow, since there is no interpreter to check or install into.
- The user has no network connectivity when clicking "Install": treated as an
  install failure (User Story 3), with the underlying pip output surfaced.
- The user switches to a different Python interpreter (via the Python extension)
  after dismissing the notification, then retries startup: the package presence is
  re-checked against the newly selected interpreter, not cached from the earlier
  check.
- The user runs "Doorstop: Restart Server" while a package is missing: the same
  missing-package notification flow applies as on initial activation.
- An install is already in progress and the user triggers another server start
  attempt (e.g. via "Doorstop: Restart Server"): the extension does not start a
  second concurrent install.
- The package is technically installed but at a version too old to work correctly:
  out of scope for this feature (see Out of Scope) — only presence is checked, not
  version compatibility.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Before attempting to launch the local server, System MUST check
  whether the `doorstop-vscode-server` package is installed in the currently
  selected Python interpreter.
- **FR-002**: When the package is not installed, System MUST show a notification
  naming the missing package, offering an "Install" action and a way to dismiss it,
  instead of proceeding to a generic server-startup failure.
- **FR-003**: When the package is installed, System MUST proceed with server startup
  exactly as it does today, with no additional prompt.
- **FR-004**: Choosing "Install" MUST install `doorstop-vscode-server` from PyPI into
  the selected Python interpreter using that interpreter's package installer.
- **FR-005**: System MUST show progress feedback while an install is running.
- **FR-006**: On a successful install, System MUST automatically start the server
  using the newly installed package and inform the user of the outcome.
- **FR-007**: On a failed install, System MUST show an actionable error containing
  the relevant captured output and MUST NOT attempt to start the server.
- **FR-008**: System MUST NOT start a second install while one is already in
  progress for the same interpreter.
- **FR-009**: Dismissing the notification MUST leave the server stopped without
  retrying the install, matching today's behavior when startup does not proceed.
- **FR-010**: The package-presence check MUST be re-evaluated on every server start
  attempt (initial activation and manual restart), not cached across a change of
  selected interpreter.

### Key Entities

- **Python Interpreter**: The environment selected via the Python extension, into
  which the server package is checked for and, if needed, installed. Existing
  concept from spec 001, reused here as the install target.
- **Install Notification**: A one-time-per-attempt prompt shown when the package is
  missing, carrying an "Install" action and a dismiss option, followed by
  progress/result feedback for that attempt.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of server-start attempts against an interpreter missing the
  `doorstop-vscode-server` package show the install notification instead of a raw
  startup error.
- **SC-002**: A user who clicks "Install" on a machine with working network access
  reaches a running, reachable server without opening a terminal or reloading the
  editor.
- **SC-003**: A failed install always leaves the user with a specific, actionable
  reason rather than a silent failure or an unrelated generic error.

## Assumptions

- The selected Python interpreter's package installer (pip) is available and
  functional; this feature does not set up pip itself.
- "Not installed" is determined by directly checking for the package in the
  selected interpreter (e.g. an import or package-metadata check) before spawning
  the server process, rather than by parsing the failure output of a failed server
  launch.
- The package is published on PyPI under the same name declared in
  `server/pyproject.toml` (`doorstop-vscode-server`), so an unqualified
  `pip install doorstop-vscode-server` resolves to the correct package.
- Only package *presence* is checked, not version — verifying the installed version
  is new enough is a separate concern from this feature.
- This flow only applies when a workspace has already been identified as a Doorstop
  workspace (a `.doorstop.yml` marker is present) and a Python interpreter is
  selected; the no-marker and no-interpreter cases keep their existing behavior from
  spec 001.

## Dependencies

- Builds on the existing server startup flow (spec 001): this feature intercepts
  that flow before the process is spawned, and reuses its "no Python interpreter"
  warning and manual restart command for the missing-interpreter case and the retry
  path.

## Out of Scope

- Checking or enforcing a minimum installed version of `doorstop-vscode-server`.
- Upgrading an already-installed package.
- Installing Python itself, or configuring pip/network/proxy settings.
- Uninstalling or offering to uninstall the package.
