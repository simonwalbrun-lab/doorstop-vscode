# Feature Specification: Background Problem Checking and Reporting Modes

**Feature Branch**: `032-background-validation`
**Created**: 2026-10-16
**Status**: Draft
**Input**: "We need to rework and extend the feature of 014. Currently, on huge datasets, the problem report is a long-running task that blocks the user from working. Therefore I want the problem report to become a background task that does not block user input from being processed. In the Problems section of the preferences, it shall also be possible to disable the problem report/validation fully."

This spec changes *when and how* the problem check of
[spec 014](../014-doorstop-validation-diagnostics/spec.md) runs. Checks, severities,
messages and anchors stay as they are. It also extends the Problems settings of
[spec 020](../020-extension-settings/spec.md).

## Clarifications

### Session 2026-10-16

- Q: What happens to a running check when the user interacts? → A: The check runs one document at a time and serves waiting requests between documents. It is cancelled only for a reason Constitution Principle I allows; an interactive request does not cancel it. *(Running between documents was superseded on 2026-10-17, see below.)*
- Q: Should the server reload the whole tree after every change? → A: No. It reloads only the changed documents. If it can't tell what changed, it reloads the whole tree.
- Q: On/off switch or an on-demand mode? → A: Three modes: Automatic, On demand, Off. They can be set in the preferences and with a button in the tree view that cycles through them and stays in sync with the workspace setting.
- Q: How does the user re-check on demand? → A: With the existing tree-view Refresh button. No new re-check button or command is introduced, and the existing "Doorstop: Re-check Problems" command (spec 014) is removed.

### Session 2026-10-17

Constitution v1.6.0 requires background validation to run in a separate process or thread, with no influence on response times.

- Q: How fast must a cancelled check stop? → A: Immediately. It only reads, so it is stopped at once and no longer needs to run document by document.
- Q: Does the check process stay running between checks? → A: Yes. It keeps its own copy of the tree and reloads only the changed documents before each check, like the server (FR-020–023).
- Q: How close to normal must response times stay during a check? → A: The median is at most 20% above the time without a check, on a machine with 2 or more CPU cores.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Keep working while problems are checked (Priority: P1)

On a large tree, a save currently freezes hover, the tree view and actions until
the whole-tree check is done. Instead, the check should run in the background.

**Independent Test**: In a tree where a check takes several seconds, save a file,
then hover a link and run an action while the check runs. Each one responds about as fast
as without a check (SC-001).

1. **Given** a check is running, **When** the user hovers, completes, navigates, opens the tree view, or runs an action, **Then** the request is served about as fast as without a check (SC-001).
2. **Given** a check finishes, **Then** the Problems panel and the document view update in one step.
3. **Given** a check is running, **When** a requirement changes, **Then** that check is cancelled and only a fresh check's result is shown.
4. **Given** several quick saves, **Then** at most one check works at a time and only the newest result is shown.

### User Story 2 - Faster responses after a change (Priority: P2)

The server reloads only the changed documents instead of the whole tree.

**Independent Test**: Change one item and request the tree. Only that document is
reloaded, and the result equals a full reload. Change a document config file and a
full reload happens.

1. **Given** items changed in one or more documents, **When** the next request arrives, **Then** only those documents are reloaded.
2. **Given** a change that can't be attributed to a document (config file, document added or removed, skip marker, unknown file), **Then** the whole tree is reloaded.
3. **Given** nothing changed, **Then** nothing is reloaded.

### User Story 3 - See that a check is running (Priority: P3)

**Independent Test**: Save a file in a large tree. An indicator shows during the
check and disappears afterwards, without taking focus.

1. **Given** an automatic check runs longer than 1 s, **Then** a small non-modal indicator is shown.
2. **Given** a check started by Refresh runs longer than 1 s, **Then** a cancellable progress notification is shown (Principle VII).
3. **Given** a check ends, fails or is cancelled, **Then** the indicator is removed and the previous problems stay until a new result replaces them.

### User Story 4 - Choose Automatic, On demand, or Off (Priority: P4)

**Independent Test**: Click the tree-view button three times. The mode cycles
Automatic → On demand → Off → Automatic, and the setting follows. Changing the
setting updates the button.

1. **Given** Automatic (the default), **When** saving, acting or opening the workspace, **Then** a check runs, as today.
2. **Given** On demand, **Then** checks run only when the user clicks Refresh or generates the status report, and the last problems stay visible.
3. **Given** a switch to Off, **Then** all problems are cleared, a running check is cancelled, and no check runs anymore, including on Refresh.
4. **Given** a switch to Automatic, **Then** a check runs without a window reload.
5. **Given** the button is clicked or the setting changes anywhere, **Then** the button and the setting show the same mode.

### Edge Cases

- Switching to On demand while a check runs: the check finishes and is shown.
- Switching from Off to On demand: no problems are shown until the next Refresh.
- On demand after edits: the problems shown may be out of date. This is accepted.
- The mode is set only in user settings: a button click writes to the workspace setting, which then takes precedence.
- A check fails: spec 014 FR-014 applies, and other features keep working.
- The check process ends unexpectedly: the next check starts a new one, which loads the whole tree once.
- A check cancelled while its copy is still loading the whole tree (first check, or after a crash): the answer still comes within 1 s. The load finishes in the background and the next check reuses it.
- Checks shorter than 1 s show no indicator.
- Off mode also hides the Quick Fixes of spec 017; their commands remain available.

## Requirements *(mandatory)*

**Background checking**

- **FR-001**: The check MUST run apart from request handling (Principle I v1.6.0): no request, including an edit, waits for it, and response times are the same with or without a running check. It MUST only read, and MUST work on its own copy of the project files. That copy MUST stay loaded between checks.
- **FR-002**: At most one check MUST run at a time. A newer check MUST cancel an unfinished older one.
- **FR-003**: A running check MUST be cancelled only for a reason allowed by Principle I: user cancel, superseded (including by a change), mode switched to Off, or server shutdown. Cancellation MUST take effect immediately (the check stops working within 1 s), and the cancelled result MUST NOT be shown.
- **FR-004**: A finished result MUST replace the shown problems in one step. Until then, the previous problems stay visible.
- **FR-005**: An action that changes files during a check MUST NOT be lost, applied twice, or applied to an inconsistent state.
- **FR-006**: The results MUST be identical to spec 014 for the same files.

**Visibility**

- **FR-007**: An automatic check running longer than 1 s MUST show a non-modal indicator until it ends.
- **FR-008**: A check started by Refresh that runs longer than 1 s MUST show a cancellable progress notification.
- **FR-009**: Cancelling MUST keep the previous problems and MUST NOT show an error.

**Problem-reporting mode**

- **FR-010**: The Problems settings MUST offer one mode setting: Automatic (default), On demand, or Off.
- **FR-011**: Automatic checks on the spec 014 triggers and on Refresh. On demand checks only on Refresh or the status report. Off never checks.
- **FR-012**: Switching to Off MUST clear all problems from the Problems panel and the document view, and cancel any running check.
- **FR-013**: Switching to Automatic MUST start a check. Switching to On demand MUST neither start nor cancel one.
- **FR-014**: The existing tree-view Refresh button MUST be the only way to re-check on demand. This feature MUST NOT add a new re-check button or command, and MUST remove the existing "Doorstop: Re-check Problems" command (`doorstop.recheckProblems`, spec 014 FR-013).
- **FR-015**: The per-kind settings of spec 020 MUST keep their values and apply only when the mode is not Off. Their descriptions say so.
- **FR-016**: In Off mode, the status report (spec 021) MUST state that reporting is off instead of listing problems.
- **FR-017**: The tree view title bar MUST have one button that cycles Automatic → On demand → Off and writes the value to the workspace setting.
- **FR-018**: The button MUST show a different icon per mode, with a tooltip naming the current and the next mode.
- **FR-019**: The button MUST update without a reload whenever the setting changes, from any source.

**Partial reload**

- **FR-020**: The server and the check's own copy MUST each reload only the documents whose item files changed.
- **FR-021**: If a change can't be attributed to a document, the server MUST reload the whole tree.
- **FR-022**: Responses after a partial reload MUST equal those after a full reload.
- **FR-023**: If nothing changed, the server MUST NOT reload.

### Key Entities

- **Problem check**: one run over the whole tree, apart from request handling and on its own copy of the files.
- **Check copy**: the check's own loaded tree. It lives as long as the server and follows file changes by partial reload. It has a trigger and a state (running, finished, failed, cancelled), and its result is the spec 014 problem set.
- **Problem-reporting mode**: Automatic, On demand, or Off. It sits above the per-kind settings of spec 020.

## Success Criteria *(mandatory)*

- **SC-001**: During a check of 10 s or more, the median response time of read requests (hover, tree, filter) is at most 20% above their median without a check, on a machine with 2 or more CPU cores.
- **SC-002**: Five quick saves during a long check cause at most two checks, and the last save's result is shown.
- **SC-003**: After switching to Off, all problems are gone within 2 s, and the next 10 saves run no check. In On demand, 10 saves run no check either.
- **SC-004**: A check started by Refresh can be cancelled without an error, and the previous problems stay.
- **SC-005**: The problems shown are identical to before this change on the spec 014 fixtures.
- **SC-006**: With 1,500 items in 5 or more documents, a one-item change costs at most half the time of a full reload.
- **SC-007**: The button and the setting agree within 1 s after any change.

## Assumptions

- The cause of the blocking is that the server answers one request at a time, so a long check holds everything else up. Principle I (v1.6.0) exempts background validation from that rule if it runs in a separate process or thread. The plan states how response times are kept unchanged and how that is measured, and names each cancellation point.
- A cancelled check starts over next time.
- The user's machine has at least 2 CPU cores. On a single core, the check competes with the server for CPU time, so SC-001 does not apply.
- Automatic checks are background work (exempt under Principle VII), so they get an indicator, not a notification.
- Off covers the Problems panel, the document view, the Quick Fixes, and the status report. It does not affect publishing.
