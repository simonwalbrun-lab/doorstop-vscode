# Feature Specification: Requirement Item Lifecycle Commands (Add, Review, Clear, Link)

**Feature Branch**: `N/A (retroactive documentation)`

**Created**: 2026-09-09

**Status**: Implemented (reverse-engineered from existing code)

**Input**: User description: "Reverse-engineered from existing implementation — see CHANGELOG.md and README.md for release history."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add a new requirement item (Priority: P1)

As a developer, I want to add a new item to a document — either at the root or as
a sibling/child of a selected item — so I can grow my requirement set without
hand-editing files.

**Why this priority**: Core authoring action, used constantly while writing
requirements.

**Independent Test**: Right-click a document or item and choose "Add Item";
confirm a new item file is created at the expected level and opens in the editor.

**Acceptance Scenarios**:

1. **Given** no selected item, **When** the user runs "Add Item" and picks a
   document, **Then** a new item is created at that document's next available
   position and opened in the editor.
2. **Given** a selected item in the tree, **When** the user runs "Add Item" from
   its context menu, **Then** a new sibling/child item is created at the correct
   next level relative to the selection.

---

### User Story 2 - Link two items (Priority: P1)

As a developer, I want to create a parent→child traceability link between two
items, so downstream requirements stay traceable to their source.

**Why this priority**: Core to the product's value proposition (traceability).

**Independent Test**: With a requirement file open, run "Link Items", supply a
parent UID; confirm the link appears when inspecting the child afterward.

**Acceptance Scenarios**:

1. **Given** a tree item is selected as the parent and a requirement file is
   active in the editor, **When** the user runs "Link Items", **Then** a link is
   created from the active file's item to the selected parent.
2. **Given** no tree selection and no active requirement editor, **When** the user
   runs "Link Items", **Then** the user is prompted to manually enter both UIDs.
3. **Given** the user attempts to link an item to itself, **When** the request is
   submitted, **Then** it is rejected with a clear error.

---

### User Story 3 - Mark items reviewed (Priority: P2)

As a developer, I want to mark an item, a whole document, or every document as
reviewed, so the review status reflects work actually done.

**Why this priority**: A periodic quality-gate action, not part of every edit.

**Independent Test**: Right-click an item and choose "Review"; confirm its
reviewed status changes.

**Acceptance Scenarios**:

1. **Given** a selected item, document, or "all" scope, **When** the user runs
   "Review", **Then** every item in that scope is marked reviewed.
2. **Given** "document" or "item" scope with no resolvable target, **When** the
   command runs, **Then** the user is prompted to choose one before proceeding.

---

### User Story 4 - Clear suspect link status (Priority: P2)

As a developer, after confirming a changed upstream requirement doesn't actually
invalidate a link, I want to clear its "suspect" flag.

**Why this priority**: A periodic quality-gate action, mirroring Review.

**Independent Test**: Right-click an item with a suspect link and choose "Clear
Suspect"; confirm the flag is cleared.

**Acceptance Scenarios**:

1. **Given** an item, document, or "all" scope, **When** the user runs "Clear
   Suspect", **Then** suspect status is cleared for the matching links in that
   scope.
2. **Given** the user restricts clearing to specific parent UIDs, **When** one of
   those UIDs doesn't exist, **Then** the command fails with a clear error and
   nothing is cleared.

---

### Edge Cases

- What happens when "Add Item" is invoked with an explicit level that collides
  with an existing item's level?
- How does the system respond when a target document prefix no longer exists
  (e.g. deleted after the tree was last refreshed)?
- What happens when a user tries to link two items that already share a link?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to add a new item to a document from the sidebar,
  either unscoped (choose any document) or scoped to a selected tree item
  (computed next level).
- **FR-002**: System MUST open a newly created item's file in the editor
  immediately after creation.
- **FR-003**: Users MUST be able to create a parent→child link between two items,
  resolving the parent/child UIDs from tree selection, the active editor, or
  manual input, in that order of convenience.
- **FR-004**: System MUST reject a link where the parent and child UID are the
  same, with a clear error.
- **FR-005**: Users MUST be able to mark an item, an entire document, or every
  document as reviewed.
- **FR-006**: Users MUST be able to clear suspect-link status for an item, an
  entire document, or every document, optionally restricted to specific parent
  UIDs.
- **FR-007**: System MUST prompt the user to choose a target when a Review/Clear
  command is run without one resolvable from context, except when scope is "all".
- **FR-008**: System MUST return a clear error (not a silent no-op) when a
  Review/Clear/Link target, or a parent UID used to restrict clearing, does not
  exist.

### Key Entities

- **Link**: a directed parent→child relationship between two items, with a
  suspect/cleared status determined by whether the parent has changed since the
  link was last reviewed.
- **Review Status**: a per-item flag indicating the item has been marked
  reviewed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can go from "need a new requirement" to "editing its
  text" in a single command invocation.
- **SC-002**: A developer can establish a traceability link between two
  requirements without manually editing YAML.
- **SC-003**: Review and suspect-clearing can be applied at any granularity
  (single item, whole document, or entire project) without extra steps beyond
  choosing scope.

## Assumptions

- "Add Item" level computation assumes the standard Doorstop leveling convention
  (dotted depth); no custom leveling scheme is in scope.
- Review/Clear scope resolution logic intentionally mirrors Doorstop's own CLI
  disambiguation rules.
