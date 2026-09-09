# Feature Specification: Traceability Diagram — Core Editor & Persistence

**Feature Branch**: `N/A (retroactive documentation)`

**Created**: 2026-09-09

**Status**: Implemented (reverse-engineered from existing code)

**Input**: User description: "Reverse-engineered from existing implementation — see CHANGELOG.md and README.md for release history."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a new traceability diagram (Priority: P1)

As a developer, I want to create a new, empty visual diagram file I can populate
with requirements, so I can build a spatial view of a subset of my project's
traceability.

**Why this priority**: The entry point for the whole Canvas feature; without it
nothing else in this area is reachable.

**Independent Test**: Run "New Traceability Graph", save to a new
`*.doorstop.json` file, confirm it opens as an empty diagram canvas.

**Acceptance Scenarios**:

1. **Given** the user runs "New Traceability Graph" and picks a save location,
   **When** the file is created, **Then** it is written as a valid empty diagram
   and opened in the diagram editor.

---

### User Story 2 - Open an existing diagram and have it persist correctly (Priority: P1)

As a developer, I want to reopen a previously saved diagram and have it show
exactly what I last saved, and be able to save further changes through normal
VS Code Save/Save As/Revert.

**Why this priority**: Without reliable persistence, the diagram feature has no
lasting value.

**Independent Test**: Open an existing `*.doorstop.json` diagram, make a change,
save it, close and reopen it, confirm the change persisted.

**Acceptance Scenarios**:

1. **Given** an existing diagram file, **When** the user opens it, **Then** all
   previously saved nodes and edges are rendered.
2. **Given** the user makes changes and saves (Ctrl+S), **When** the file is
   reloaded, **Then** those changes are present.
3. **Given** the user has unsaved changes and chooses Revert, **When** revert
   completes, **Then** the diagram returns to its last-saved state.
4. **Given** a diagram is moved to a different folder or machine, **When** it is
   reopened there, **Then** its node references still resolve correctly, because
   paths are stored workspace-relative rather than absolute.

---

### User Story 3 - See live requirement status on diagram nodes (Priority: P2)

As a developer, I want diagram nodes to reflect each requirement's current
status (reviewed, suspect link, derived, inactive, non-normative) and be
colored by owning document, so the diagram stays meaningful as requirements
change after the diagram was drawn.

**Why this priority**: Keeps a saved diagram from going stale, but the diagram
is still useful without it.

**Independent Test**: Mark an item reviewed via another command, then open a
diagram containing that item; confirm its status badge reflects the review.

**Acceptance Scenarios**:

1. **Given** a diagram containing a node for an existing requirement, **When**
   the diagram loads, **Then** it fetches current status/link data from the
   server and shows an up-to-date status badge and document-colored styling for
   that node.
2. **Given** the server is unreachable when the diagram loads, **When** the
   fetch fails, **Then** the diagram still renders exactly what was saved on
   disk, with a one-time warning rather than an empty/broken canvas.

---

### Edge Cases

- What happens when a diagram references a node whose underlying requirement
  file no longer exists?
- What happens when two different diagrams reference the same requirement — do
  status updates in one affect the other?
- How does the diagram behave when opened in a workspace that doesn't match the
  one it was authored in (unresolvable relative paths)?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to create a new, empty diagram file and have it
  open immediately in the diagram editor.
- **FR-002**: System MUST persist diagram nodes and edges to a `*.doorstop.json`
  file using workspace-relative paths for node references.
- **FR-003**: System MUST participate in standard VS Code Save, Save As, Revert,
  and backup flows like any other editable document.
- **FR-004**: System MUST render exactly what is saved on disk when a diagram is
  opened.
- **FR-005**: System MUST fetch current requirement status and link data from
  the server when a diagram loads, and reflect it via node coloring (by owning
  document) and status badges (reviewed, suspect, derived, inactive,
  non-normative).
- **FR-006**: System MUST fall back to rendering the diagram exactly as saved,
  with a one-time warning, when the server-status fetch fails at load time.
- **FR-007**: System MUST recompute displayed edges from server-known links when
  available, while preserving any persisted edge that touches a node the server
  doesn't recognize (e.g. an orphaned/renamed file) rather than silently
  dropping it.

### Key Entities

- **Diagram**: a `*.doorstop.json` file containing a set of nodes (each
  referencing a requirement item by workspace-relative path) and edges (links
  between them).
- **Node Status Badge**: a visual indicator on a diagram node reflecting a
  requirement's reviewed/suspect/derived/active/normative state at the time the
  diagram was last loaded.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can build and reliably reopen a spatial view of any
  subset of their requirements, with zero data loss across save/reload cycles.
- **SC-002**: A saved diagram remains usable after being moved or shared across
  machines/checkouts.
- **SC-003**: A diagram never appears empty or broken solely because the server
  happened to be unavailable at load time.

## Assumptions

- Only one diagram file format (`*.doorstop.json`) is in scope; no alternative
  diagram formats are supported.
- A diagram is considered a snapshot of layout, not of requirement content —
  content/status is always re-fetched live rather than cached in the file.
