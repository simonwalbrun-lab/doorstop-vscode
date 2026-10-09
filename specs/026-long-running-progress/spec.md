# Feature Specification: Progress Notifications for Long-Running Commands

**Feature Branch**: `026-long-running-progress`

**Created**: 2026-10-09

**Status**: Draft

**Input**: User description: "Show progress toasts for all commands expected to run longer than 1s"

## Clarifications

### Session 2026-10-09

- Q: How should the extension decide whether a command gets a progress toast? → A: By actual run time — every user-triggered command that works with the requirements server shows a toast once its work has been running for 1 second; work that finishes sooner shows none. (Constitution Principle VII amended to v1.3.0 accordingly.)
- Q: Should the commands that already show a toast immediately switch to the same 1-second rule? → A: Yes, all of them; only Install Server Package keeps its immediate toast.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Any slow command shows that it is still running (Priority: P1)

As a user working on a project of any size, I want every Doorstop command that
is still working after one second to show a progress notification until it
finishes, so that I can always tell a slow command from a hung or ignored one —
without fast commands flashing a notification on small projects.

**Why this priority**: This is the core rule. How long a command takes depends
on project size, so only the actual run time can tell which commands need a
notification.

**Independent Test**: Run a command whose work is made to take 3 seconds and
one whose work takes 0.1 seconds. Confirm the slow one shows its notification
by the 1-second mark and until it finishes, and the fast one shows none.

**Acceptance Scenarios**:

1. **Given** the server is running, **When** the user runs a command whose
   work takes longer than 1 second (e.g. "Refresh", "Recheck Problems",
   opening the document view of a large document), **Then** a progress
   notification naming the operation is visible no later than 1 second after
   the work started and stays visible until the work has finished.
2. **Given** the server is running, **When** the user runs a command whose
   work finishes within 1 second, **Then** no progress notification appears.
3. **Given** a command's work runs longer than 1 second and then fails,
   **When** the failure happens, **Then** the notification closes and the
   command's existing error message is shown.

---

### User Story 2 - See that the server is starting (Priority: P2)

As a user opening a workspace with Doorstop requirements, or choosing
"Restart Server", I want a progress notification while the requirements
server is starting, so that I know why the tree and other features are not
available yet and do not restart it again.

**Why this priority**: Server start is the slowest step users hit in every
session, and today the user sees nothing until it is ready or failed. It is
covered by the same 1-second rule as User Story 1, but is not a palette
command on workspace open, so it is called out explicitly.

**Independent Test**: Run "Restart Server". Confirm a progress notification
naming the server start is visible from the 1-second mark until the server is
ready, then disappears and the existing "server is ready" message appears.

**Acceptance Scenarios**:

1. **Given** a workspace with a Doorstop project is opened, **When** the
   server start takes longer than 1 second, **Then** a progress notification
   "Starting Doorstop server…" is visible until the server is ready or the
   start fails.
2. **Given** the server is running, **When** the user runs "Restart Server"
   and the restart takes longer than 1 second, **Then** a progress
   notification "Restarting Doorstop server…" is visible until it has finished.
3. **Given** the server cannot be started, **When** the start fails, **Then**
   the progress notification closes and the existing failure message is shown.

---

### Edge Cases

- The command first asks the user something (a prompt, a file picker, a
  confirmation): the 1-second clock starts only when the user has answered
  and the work begins; no notification is shown while waiting for input.
- A command asks the user something between two pieces of work (e.g. manual
  Reorder's "Apply Reorder" step): each piece of work is timed on its own; no
  notification stays open while the user is being asked.
- The same command is started a second time while the first is still running:
  the existing "already running" behavior applies; no second notification is
  stacked on top.
- The work finishes at almost exactly 1 second: either outcome is acceptable,
  but a notification that does appear MUST close as soon as the work is done.
- The operation fails or throws: the notification always closes; it never
  stays visible after the work has stopped.
- The server is not running: the command fails fast with its existing message
  and no notification is shown.
- A slow operation started automatically in the background (the debounced
  re-check after an edit, automatic tree reloads): no notification is shown,
  so typing does not cause a stream of notifications.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every user-triggered command that sends work to the requirements
  server, and the server start/restart, MUST show a progress notification if
  its work is still running 1 second after it started; the notification MUST
  then stay visible until the work finishes, fails, or is cancelled.
- **FR-002**: Work that finishes within 1 second MUST NOT show a progress
  notification.
- **FR-003**: Each notification MUST name the operation in user-facing words
  (e.g. "Doorstop: Refresh…", "Starting Doorstop server…"), not an internal
  command ID.
- **FR-004**: When the operation fails, the notification MUST close and the
  failure MUST be reported with the command's existing error message; the
  notification never replaces the error message.
- **FR-005**: Time spent waiting for user input (prompts, file pickers,
  confirmations) MUST NOT count towards the 1 second and MUST NOT be covered
  by a notification.
- **FR-006**: Background work not started by an explicit user command (the
  debounced re-check after edits, automatic tree reloads) MUST NOT show a
  notification.
- **FR-007**: Commands that already show a progress notification immediately
  today (Create Document, Add Item, Review, Clear, Link, Reorder, Import,
  Export, Publish, Generate Status Report) MUST switch to the 1-second rule of
  FR-001/FR-002; their other behavior (duplicate-run guard, error message,
  refresh afterwards) MUST stay unchanged. Install Server Package always takes
  several seconds and keeps its immediate notification.
- **FR-008**: Starting the same command again while it is still running MUST
  NOT stack a second notification.
- **FR-009**: Commands that do no server work (toggles, timing commands,
  creating an empty diagram or filter notebook, Insert Item Here / New Item
  Below, which only add a text placeholder) and editor-native features
  that show their own running indicator (hover, completion, call hierarchy,
  filter notebook cell runs) are out of scope.

### Covered Commands

All user-triggered operations that send work to the requirements server,
including at least:

| Operation | Notification text |
| --------- | ----------------- |
| Server start on workspace open | Starting Doorstop server… |
| Restart Server | Restarting Doorstop server… |
| Refresh | Doorstop: Refresh… |
| Recheck Problems | Doorstop: Checking requirements… |
| Open Document View / Open as Document | Doorstop: Opening document &lt;prefix&gt;… |
| Saving the document view | Doorstop: Saving document &lt;prefix&gt;… |
| Show Diagram / Add to Diagram / opening a diagram file | Doorstop: Loading diagram… |
| Derive Requirement; add/remove link and create linked item on the diagram canvas | Doorstop: &lt;action&gt;… |
| Review / Clear Suspect actions above a requirement | Doorstop: &lt;action&gt;… |
| Create Document, Add Item, Review, Clear, Link, Reorder, Import, Export, Publish, Generate Status Report | Doorstop: &lt;action&gt;… (unchanged text, now after 1 s per FR-007) |
| Install Server Package | Installing … (unchanged, immediate per FR-007) |

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For every covered operation whose work takes longer than 1
  second, the notification is visible no later than 1.2 seconds after the work
  started.
- **SC-002**: For every covered operation whose work finishes within 0.8
  seconds, no notification appears.
- **SC-003**: In 100 % of runs, including failed runs, the notification is
  gone within 0.5 seconds of the operation ending.
- **SC-004**: No notification appears while the user is being asked for
  input, or for background work, checked by running each such flow once.
- **SC-005**: A user starting the server or a full re-check can tell, without
  looking at logs, whether it is still running or has finished.

## Assumptions

- The rule is applied by measuring the actual run time, not by a fixed list of
  slow commands (see Clarifications); the Covered Commands table lists where
  it applies, not a judgement of which commands are slow.
- Cancellation is out of scope for the commands added here: server start,
  re-check, and view loading cannot be safely aborted half-way today.
- The Execution Timing feature (spec 023) can be used to check real durations
  while developing, but is not required at runtime.
