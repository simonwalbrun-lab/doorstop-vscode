# Feature Specification: Go to Definition & Usage Navigation

**Feature Branch**: `009-goto-definition-navigation`

**Created**: 2026-09-09

**Status**: Draft

**Input**: User description: "I want to have some more possiblilties to jump between the files. As a user I want to be able to jump to files and back. see dependencies. If I press F12 in the line derives I want to have a editor i editor view which shows mee a places where the respecitve requirment is used."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Jump straight to a dependency's file (Priority: P1)

As a developer reading a requirement, I want to press "Go to Definition" (F12)
on any requirement UID reference (for example, an entry under `links:`) and
land directly in that requirement's file, instead of having to hover first
and click a link inside the popup.

**Why this priority**: This is the core "jump between files" ability the
feature is about — it replaces a two-step hover-then-click with a single
keypress, which is the primary friction the user is describing.

**Independent Test**: Open a requirement file that lists another requirement
under `links:`, place the cursor on that UID, press F12 (or use "Go to
Definition"), and confirm the matching requirement's file opens directly.

**Acceptance Scenarios**:

1. **Given** the cursor is on a requirement UID token that has exactly one
   matching file in the workspace, **When** the user triggers "Go to
   Definition", **Then** that file opens with the cursor on the target
   requirement's header line.
2. **Given** the cursor is on a UID-shaped token that does not correspond to
   any file in the workspace, **When** the user triggers "Go to Definition",
   **Then** the editor reports no definition found rather than erroring or
   navigating anywhere.
3. **Given** the cursor is on plain text that is not a recognized requirement
   UID, **When** the user triggers "Go to Definition", **Then** nothing
   requirement-specific happens (standard editor behavior applies).

---

### User Story 2 - See every place a requirement is used (Priority: P1)

As a developer, I want to place the cursor on the `derived:` field key and
trigger "Go to Definition" / "Find All References" to get an in-editor list
of every location where the current requirement is used as a link target, so
I can see its downstream dependents without leaving the editor or reading
hover text.

**Why this priority**: This is the specific workflow called out by the user
("if I press F12 in the line derives, ... shows me all places where the
respective requirement is used") and is the main new capability requested
beyond what hover already offers.

**Independent Test**: Open a requirement that other items link to, place the
cursor on its `derived:` line, trigger the usages command, and confirm an
in-editor locations view lists each referencing file with the specific line
where the link occurs.

**Acceptance Scenarios**:

1. **Given** a requirement has one or more items linking to it as their
   parent, **When** the user triggers "Go to Definition" (or "Find All
   References") on the `derived:` line, **Then** an in-editor locations view
   opens listing each referencing item's file and the line containing the
   link.
2. **Given** a requirement has no items linking to it, **When** the user
   triggers the usages command on its `derived:` line, **Then** the editor
   reports no results rather than erroring.
3. **Given** the locations view is open, **When** the user selects one of the
   listed locations, **Then** that file opens at the referencing line.

---

### User Story 3 - Return to where you came from (Priority: P2)

As a developer who just jumped to a dependency's file via "Go to Definition"
— most commonly by placing the cursor over a requirement's UID inside the
`links:` section and pressing F12 — I want to navigate back to the file and
position I jumped from, so I can continue reading where I left off without
manually re-opening it.

**Why this priority**: Completes the "jump to files and back" journey; it
depends on User Story 1 existing but adds the return trip. The `links:`
section is the primary place this round trip happens, since that is where a
requirement's dependencies are listed.

**Independent Test**: From a requirement file, place the cursor over a UID
listed under `links:` and trigger "Go to Definition" to open the target
file, then trigger the editor's back navigation and confirm the original
file and cursor position are restored.

**Acceptance Scenarios**:

1. **Given** the user's cursor is over a requirement UID inside the `links:`
   section, **When** the user triggers "Go to Definition", **Then** the
   corresponding requirement's file opens directly.
2. **Given** the user navigated to a requirement's file via "Go to
   Definition" triggered from within the `links:` section, **When** the user
   triggers "Go Back", **Then** the originating file re-opens with the
   cursor back over the same `links:` entry.
3. **Given** the user navigated to a requirement's file via "Go to
   Definition" triggered from anywhere else (e.g. an inline UID reference),
   **When** the user triggers "Go Back", **Then** the originating file
   re-opens with the cursor at the position it was triggered from.

---

### Edge Cases

- What happens when a requirement UID matches more than one file in the
  workspace (duplicate/misplaced files)? The system should behave
  deterministically (same match every time) rather than picking randomly.
- What happens when the `derived:` line is on a document whose file name
  cannot be resolved to a valid requirement UID (e.g. an unsaved or
  unrecognized file)? The usages command should report no results.
- How does "Go to Definition" behave when triggered on a UID that appears
  inside plain prose rather than a structured `links:`/`derived:` context?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a "Go to Definition" navigation action for
  any recognized requirement UID token in a requirement file, opening that
  requirement's file directly when a single matching file exists, with the
  cursor landing on that requirement's header (its `header` field for a
  `.yml`-format item, or its first heading for a `.md`-format item).
- **FR-002**: System MUST provide an in-editor locations view (triggered via
  "Go to Definition" and/or "Find All References") on the `derived:` field
  key that lists every file and line where the current requirement is used
  as a link target.
- **FR-003**: Each entry in the usages locations view MUST be selectable and,
  when selected, MUST open the corresponding file at the referencing line.
- **FR-004**: System MUST report "no results" (not an error) when a
  navigation or usages request has nothing to show, whether because the UID
  has no matching file or the requirement has no usages.
- **FR-005**: System MUST NOT interfere with the editor's standard back
  navigation — jumping via "Go to Definition" MUST leave a navigable entry so
  the user can return to the originating file and position.
- **FR-006**: Navigation and usages lookups MUST resolve matches the same way
  existing hover previews do, so results stay consistent across features.

### Key Entities

- **Requirement UID Token**: a recognized reference (e.g. `REQ-001`) to
  another requirement, appearing under `links:`, inline in text, or as a
  file's own name.
- **Usage Location**: a specific file and line where a requirement UID is
  referenced as a link target, used to build the downstream usages list.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can open any linked requirement's file in a single
  keypress instead of hovering and clicking.
- **SC-002**: A developer can see every location where a requirement is used
  as a dependency, with file and line detail, without running a manual
  search.
- **SC-003**: A developer can always return to their previous file and cursor
  position after jumping to a dependency.

## Assumptions

- "Jump to files" and "see dependencies" refer to editor-native navigation
  (VS Code's "Go to Definition" / "Find All References" / "Go Back"), reusing
  the same UID-to-file resolution already used by the existing hover
  previews ([006-hover-navigation](../006-hover-navigation/spec.md)), rather
  than introducing a new custom navigation UI.
- "The line derives" refers to the `derived:` field key already recognized by
  the hover provider, and "places where the requirement is used" means the
  same downstream/reverse links the hover popup currently lists, surfaced
  instead as a standard in-editor locations view.
- Back-navigation is provided by the editor's built-in "Go Back" behavior,
  which requires no additional persistence as long as definition/reference
  jumps are registered as standard navigation events.
