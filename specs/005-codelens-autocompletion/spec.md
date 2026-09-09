# Feature Specification: Editor Integration — Derive CodeLens & Link Autocompletion

**Feature Branch**: `N/A (retroactive documentation)`

**Created**: 2026-09-09

**Status**: Implemented (reverse-engineered from existing code)

**Input**: User description: "Reverse-engineered from existing implementation — see CHANGELOG.md and README.md for release history."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Derive a new requirement from an inline CodeLens (Priority: P1)

As a developer editing a requirement that has a `derived:` field, I want a
one-click way to create the child requirement it's pointing at and have it
automatically linked back, so I don't have to switch to the tree/commands and
manually link afterward.

**Why this priority**: The fastest, most direct path for the extension's
signature "derive downstream requirements" workflow, called out explicitly in
the README.

**Independent Test**: Open a requirement file containing a `derived:` field,
click the "+ Derive Requirement" CodeLens above it, choose a target document,
confirm a new linked item is created and opened.

**Acceptance Scenarios**:

1. **Given** a requirement file with a `derived:` field, **When** the file is
   opened, **Then** a "+ Derive Requirement" CodeLens appears inline above that
   field.
2. **Given** the user invokes the CodeLens, **When** they choose a target
   document, **Then** a new item is created in that document, linked back to the
   source item, and opened in the editor.
3. **Given** the CodeLens is invoked from a tree item's context menu instead of
   the editor, **When** the action completes, **Then** the same create-and-link
   behavior occurs.

---

### User Story 2 - Autocomplete requirement links while editing (Priority: P2)

As a developer typing inside a `links:` block, I want autocomplete suggestions
of valid requirement UIDs (with titles), so I don't have to look up exact UIDs
elsewhere.

**Why this priority**: A productivity aid for an existing manual-entry path —
typing a UID is already possible without this.

**Independent Test**: Open a requirement file, start typing inside its `links:`
list, confirm a completion list of UIDs with titles appears and inserting one
produces a valid link entry.

**Acceptance Scenarios**:

1. **Given** the cursor is inside a `links:` list in a `.yml` file or YAML
   frontmatter of a `.md` file, **When** the user types a list-item trigger
   character, **Then** a completion list of workspace requirement UIDs (labeled
   with titles) appears.
2. **Given** the user has recently viewed certain requirements, **When** the
   completion list is shown, **Then** those recently-viewed requirements are
   ranked first.
3. **Given** the cursor is outside a `links:` block, **When** the user types,
   **Then** no requirement-UID completions are offered.

---

### Edge Cases

- What happens when the `derived:` field references a document hierarchy with no
  valid target documents (e.g. no child documents defined)?
- How does autocompletion behave in a very large workspace with thousands of
  requirement UIDs?
- What happens when a requirement referenced by autocompletion has been deleted
  since the workspace was last scanned?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST show an inline CodeLens offering to derive a
  requirement wherever a `derived:` field appears in a requirement file.
- **FR-002**: Users MUST be able to trigger the derive action from the CodeLens
  itself or from a tree item's context menu, with identical resulting behavior.
- **FR-003**: System MUST let the user choose which target document the derived
  item is created in, restricted to documents that are valid children of the
  source document's hierarchy.
- **FR-004**: System MUST automatically link a newly derived item back to its
  source item, without a separate manual linking step.
- **FR-005**: System MUST open the newly derived item's file after creation.
- **FR-006**: System MUST offer requirement-UID autocompletion only while the
  cursor is positioned inside a `links:` block (YAML file or Markdown
  frontmatter).
- **FR-007**: System MUST label each autocompletion suggestion with the
  requirement's title, not just its UID.
- **FR-008**: System MUST rank recently-viewed requirements ahead of others in
  the autocompletion list.

### Key Entities

- **Derived Field**: a `derived:` marker in a requirement file indicating a
  downstream item is expected but not yet created.
- **Recently-Viewed Requirement**: a UID the user has navigated to recently,
  tracked to bias autocompletion ranking.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can go from "reading a derived-field marker" to
  "editing the derived child requirement, already linked" in a single action.
- **SC-002**: A developer never has to memorize or look up a requirement UID by
  hand when writing a link — the correct UID is always one keystroke-triggered
  list away.

## Assumptions

- Candidate target documents for a derive action are limited to
  same-level-or-deeper documents in the source document's declared parent/child
  hierarchy; cross-hierarchy derivation is out of scope.
- Autocompletion scans the workspace for requirement files; workspaces with no
  requirement files simply produce an empty completion list.
