# Feature Specification: Toggle Document Skip

**Feature Branch**: `031-toggle-document-skip`

**Created**: 2026-10-14

**Status**: Draft

**Input**: User description: "As a user I want to be able to speed up the extension by excluding documents from validation and modification. Therefore I want to have a button for each document which enables or disables the respective document. this should be done by using the doorstop.skip feature. (adding the file to the respective document)"

## Clarifications

### Session 2026-10-14

- Q: What happens to child documents when a document with children is disabled? → A: They are disabled too (cascade to all descendants), instead of the action being refused.
- Q: When a document is re-enabled, should the child documents that were disabled along with it come back too? → A: No. Enabling restores only the clicked document; its children stay disabled until the user enables each one, top-down.
- Q: Where should the enable/disable button appear? → A: Only on document entries in the Doorstop tree view; nowhere else (no CodeLens, editor title, status bar, command-palette entry, or other views).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Disable a document with one click (Priority: P1)

A user working on a large project has several documents they are not currently
interested in. In the Doorstop tree view, each document entry shows a button. Clicking it on an
enabled document marks the document as skipped, so Doorstop (and therefore the
extension) no longer validates or modifies it.

**Why this priority**: This is the core value: faster validation and less noise
without leaving the editor or hand-creating files.

**Independent Test**: Click the disable button on an enabled document in the tree view and verify
the document is marked as skipped on disk and shown as disabled in the tree view.

**Acceptance Scenarios**:

1. **Given** an enabled document, **When** the user clicks its disable button, **Then** a skip marker is added to that document's folder and the document appears visibly disabled.
2. **Given** a disabled document, **When** validation runs, **Then** that document is not validated and produces no diagnostics.
3. **Given** a disabled document, **When** the user tries to create, edit, or delete items in it, **Then** the extension does not modify it.
4. **Given** an enabled document that has child documents (at any depth), **When** the user clicks its disable button, **Then** the document and all its descendant documents become disabled and appear disabled in the tree view.

---

### User Story 2 - Re-enable a document with one click (Priority: P1)

A user who previously disabled a document needs it again. Clicking the same
button on the disabled document removes the skip marker and the document is
validated and editable again.

**Why this priority**: A disable action without a way back would be a trap.

**Independent Test**: Click the button on a disabled document and verify the skip marker is gone and the document shows as enabled and is validated.

**Acceptance Scenarios**:

1. **Given** a disabled document, **When** the user clicks its enable button, **Then** the skip marker is removed and the document appears enabled.
2. **Given** a just re-enabled document, **When** validation runs, **Then** the document is validated again.
3. **Given** a disabled document whose child documents are also disabled, **When** the user enables the document, **Then** only that document becomes enabled and its children stay disabled.
4. **Given** a disabled child document whose parent is disabled, **When** the user tries to enable the child, **Then** the action is refused with a message naming the parent.

---

### User Story 3 - Reflect externally changed skip state (Priority: P2)

A user (or teammate via version control) adds or removes the skip marker
outside the extension. The tree view shows the correct state without a manual
refresh or restart.

**Why this priority**: Keeps the UI trustworthy, but the toggle works without it.

**Independent Test**: Create/delete the skip marker in a document folder by hand and verify the tree view state updates.

**Acceptance Scenarios**:

1. **Given** an enabled document, **When** a skip marker is created in its folder outside the extension, **Then** the tree view shows it as disabled.
2. **Given** a disabled document, **When** its skip marker is deleted outside the extension, **Then** the tree view shows it as enabled.

---

### Edge Cases

- The skip marker cannot be created or removed (read-only folder, permissions): the user sees an error message and the displayed state stays unchanged.
- The server is not running when the button is clicked: the toggle still works on disk and the state is reflected once the server is available.
- A disabled document is referenced by links from enabled documents: the extension shows the document as disabled and does not report errors originating from inside it.
- Child documents of a disabled parent: Doorstop cannot work with a document whose parent is missing, so disabling a document also disables all of its descendant documents (children, grandchildren, ...) in the same action; children that are already disabled stay as they are. Enabling a document whose parent is disabled is refused with a message naming the parent.
- Rapid repeated clicks: the final state matches the last click and no duplicate or half-written marker results.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Doorstop tree view MUST show a button on every document entry that enables or disables that document. This button MUST NOT be offered in any other location (other views, editor, status bar, command palette).
- **FR-002**: Disabling a document MUST create the document's skip marker file in the document's folder, so the Doorstop skip feature takes effect.
- **FR-003**: Enabling a document MUST remove the document's skip marker file.
- **FR-004**: The tree view MUST visibly distinguish disabled documents from enabled ones, and the button label/icon MUST reflect the action it will perform.
- **FR-005**: Disabled documents MUST be excluded from validation and from validation diagnostics.
- **FR-006**: The extension MUST NOT perform modifying actions (create, edit, delete, link, reorder items) on a disabled document and MUST tell the user why when such an action is attempted.
- **FR-007**: The tree view MUST update the document's state when the skip marker is added or removed outside the extension.
- **FR-008**: If the toggle fails, the extension MUST show an error message and leave the displayed state consistent with what is on disk.
- **FR-009**: Disabling a document MUST also disable every descendant document of it (all of them become disabled in one action, each with its own skip marker); it MUST NOT change its parent or sibling documents. Enabling a document MUST NOT change any other document, and MUST be refused, with a message naming the parent, while the document's parent is disabled.
- **FR-010**: The extension MUST NOT store the skip state anywhere other than the skip marker file, so the state is shared via version control.

### Key Entities

- **Document**: A Doorstop document folder; has an enabled/disabled state.
- **Skip marker**: The file inside a document's folder whose presence means the document is skipped.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can disable or enable a document in a single click, with the new state visible within 1 second.
- **SC-002**: Validation of a project with some documents disabled takes noticeably less time than with all enabled, and disabled documents report zero diagnostics.
- **SC-003**: 100% of toggles are reflected on disk: the marker exists exactly when the document is shown as disabled.
- **SC-004**: Externally added or removed skip markers are reflected in the tree view within 2 seconds without user action.

## Assumptions

- The skip marker is the file Doorstop itself recognises for skipping a document (a `.doorstop.skip` file in the document folder, per Doorstop's skip feature); the exact name is confirmed during planning.
- The toggle is available for all documents regardless of hierarchy level.
- Existing item data of a disabled document is left untouched; the document is merely excluded from validation and modification.
- Disabled documents stay listed (greyed out) in the tree view so they can be re-enabled.
