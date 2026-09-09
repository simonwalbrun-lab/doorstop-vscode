# Feature Specification: Requirements Explorer & Commands Panel

**Feature Branch**: `N/A (retroactive documentation)`

**Created**: 2026-09-09

**Status**: Implemented (reverse-engineered from existing code)

**Input**: User description: "Reverse-engineered from existing implementation — see CHANGELOG.md and README.md for release history."

## Clarifications

### Session 2026-09-09

- Q: When a new document is created, how should its parent document be chosen? → A: The user is prompted to pick a parent document via quick-select; if no parent is selected, the new document is created as a root/parent document (no `parent:` set).
- Q: How should a user indicate "no parent" — an explicit list entry, or by dismissing the picker? → A: An explicit "None (create as root document)" entry in the quick-select list; dismissing/pressing Escape without selecting anything cancels the whole create-document command instead of defaulting to root.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse requirements in a dedicated sidebar tree (Priority: P1)

As a developer, I want to see all Doorstop documents and their items in a
hierarchical tree in the sidebar, so I can navigate my requirements without
leaving VS Code.

**Why this priority**: The primary navigation surface for the entire extension.

**Independent Test**: Open a workspace with existing Doorstop documents; open the
Doorstop Explorer view; confirm documents appear as roots with items nested
beneath them by level.

**Acceptance Scenarios**:

1. **Given** a workspace with one or more Doorstop documents, **When** the Explorer
   view is opened, **Then** each document appears as a root node with its items
   nested according to their outline level.
2. **Given** the user clicks an item in the tree, **When** the click is processed,
   **Then** the item's underlying file opens in the editor.
3. **Given** the user runs "Doorstop: Refresh", **When** the command completes,
   **Then** the tree reloads current document/item data from the server.

---

### User Story 2 - Tree stays in sync with the active editor (Priority: P2)

As a developer navigating files directly, I want the Explorer tree to
automatically highlight/reveal whichever requirement I currently have open.

**Why this priority**: Orientation convenience; not required to use the
extension at all.

**Independent Test**: Open a requirement file directly (not via the tree); confirm
the tree scrolls to and highlights the matching node.

**Acceptance Scenarios**:

1. **Given** a requirement file is opened in the active editor, **When** the active
   editor changes, **Then** the Explorer tree reveals and selects the corresponding
   item node.

---

### User Story 3 - Quick-launch commands panel (Priority: P2)

As a developer, I want a second panel listing the main Doorstop actions (Add,
Reorder, Link, Clear, Review, Import, Export, Publish) as clickable rows, as an
alternative to hunting through the Command Palette or context menus.

**Why this priority**: Convenience/discoverability for less-frequent actions.

**Independent Test**: Open the Commands panel and click a listed action; confirm
it launches the same command as its Command Palette equivalent.

**Acceptance Scenarios**:

1. **Given** the Commands panel is open, **When** the user clicks an action row,
   **Then** the corresponding Doorstop command runs.

---

### User Story 4 - Create a new document (Priority: P3)

As a developer starting a new area of requirements, I want to create a new
Doorstop document (prefix + folder) from within VS Code.

**Why this priority**: Infrequent — happens per new document, not per session.

**Independent Test**: Run "Doorstop: Create Document", supply a prefix and folder,
confirm a new document exists in the tree afterward.

**Acceptance Scenarios**:

1. **Given** the user runs "Doorstop: Create Document" and supplies a prefix and
   target folder, **When** the command completes, **Then** a new document is
   created and appears in the Explorer tree after a refresh.
2. **Given** the user runs "Doorstop: Create Document", **When** prompted, **Then**
   they are offered a quick-select list of existing documents to choose as the new
   document's parent.
3. **Given** the quick-select parent prompt, **When** the user selects an existing
   document, **Then** the new document is created as a child of that parent.
4. **Given** the quick-select parent prompt, **When** the user selects the "None
   (create as root document)" entry, **Then** the new document is created as a
   root/parent document with no `parent:` set.
5. **Given** the quick-select parent prompt, **When** the user dismisses it (e.g.
   presses Escape) without selecting any entry, **Then** the whole "Create
   Document" command is canceled and no document is created.

---

### Edge Cases

- What happens when the server is unreachable while the tree tries to load?
- How does the tree behave when a document has zero items yet?
- What happens if the currently active editor file isn't a Doorstop item at all
  (e.g. a random text file)?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display all Doorstop documents as root nodes in a
  dedicated sidebar tree view.
- **FR-002**: System MUST nest each document's items beneath their document root
  according to outline/level depth, matching Doorstop's own generated ordering.
- **FR-003**: Users MUST be able to open an item's underlying file by clicking its
  tree node.
- **FR-004**: Users MUST be able to manually refresh the tree to reload current
  data from the server.
- **FR-005**: System MUST automatically reveal and select the tree node matching
  the active editor's requirement file, when the active editor changes.
- **FR-006**: System MUST provide a separate panel listing the primary Doorstop
  actions as directly clickable entries.
- **FR-007**: Users MUST be able to create a new Doorstop document by specifying a
  prefix and destination folder.
- **FR-008**: System MUST show a clear, non-repeating error indication when the
  tree cannot load data because the server is unreachable.
- **FR-009**: When creating a new document, System MUST prompt the user to choose
  its parent document from a quick-select list of existing documents, plus an
  explicit "None (create as root document)" entry.
- **FR-010**: System MUST create the new document as a root/parent document (no
  `parent:` set) when the user selects the "None (create as root document)"
  entry.
- **FR-011**: System MUST cancel the whole "Create Document" command, creating
  nothing, when the user dismisses the parent quick-select without selecting any
  entry.

### Key Entities

- **Document**: a Doorstop document identified by a prefix, with a marker path and
  optional parent document.
- **Item**: a requirement item belonging to a document, with a UID, level,
  header/title, and status flags (reviewed, suspect, derived, active, normative).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can locate any requirement item in the tree within a few
  clicks, regardless of how many documents/items exist.
- **SC-002**: The tree's contents match what Doorstop itself would report for the
  same project, with no manual reconciliation needed.
- **SC-003**: A developer can go from "viewing a file" to "seeing where it sits in
  the tree" with zero manual navigation steps.

## Assumptions

- The Commands panel intentionally duplicates commands already reachable via
  context menus/Command Palette — it exists purely for discoverability, not
  unique functionality.
- Sorting within a document is by level then UID; no user-configurable sort order
  is assumed in scope.
- FR-009/FR-010 (parent-document quick-select on creation) describe intended
  behavior clarified 2026-09-09, not what "Doorstop: Create Document" does
  today — today it only prompts for a prefix and destination folder, with no
  parent selection step. This is a real gap to close, not a documentation
  correction; run `/speckit-plan` against this spec before implementing it.
