# Feature Specification: Document Utilities (Reorder, Import, Export, Publish)

**Feature Branch**: `N/A (retroactive documentation)`

**Created**: 2026-09-09

**Status**: Implemented (reverse-engineered from existing code)

**Input**: User description: "Reverse-engineered from existing implementation — see CHANGELOG.md and README.md for release history."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reorder a document's items (Priority: P1)

As a developer, I want to renumber a document's item levels — automatically, or
by hand-editing a generated index — so the outline stays clean as items are
added, removed, or reordered.

**Why this priority**: Without reordering, level numbers drift and become
inconsistent as documents evolve — this is core document upkeep.

**Independent Test**: Run "Reorder Document" on a document with out-of-order
levels, choose Automatic, confirm levels are renumbered.

**Acceptance Scenarios**:

1. **Given** a document, **When** the user runs "Reorder Document" and chooses
   Automatic, **Then** Doorstop renumbers the document's item levels without
   further input.
2. **Given** the user chooses Manual, **When** no scratch index exists yet,
   **Then** one is generated and opened for editing.
3. **Given** a scratch index already exists from a previous manual reorder
   attempt, **When** the user starts a new Manual reorder, **Then** they are
   offered to reuse or discard it before continuing.
4. **Given** an edited scratch index, **When** the user confirms "Apply Reorder",
   **Then** the document is renumbered according to the edited index and the
   scratch index is removed.
5. **Given** the user attempts to apply a manual reorder with no scratch index
   present, **When** the apply request is sent, **Then** it fails with a clear
   "no index" error rather than silently doing nothing.

---

### User Story 2 - Import items from an external file (Priority: P2)

As a developer migrating requirements from another tool, I want to import items
into a document from a YAML/CSV/TSV/XLSX file.

**Why this priority**: A one-time or occasional migration action, not daily use.

**Independent Test**: Run "Import" against a prepared file, choose a target
document, confirm the items appear in that document afterward.

**Acceptance Scenarios**:

1. **Given** a target document and a source file in a supported format, **When**
   the user runs "Import", **Then** the file's items are added into the chosen
   document.

---

### User Story 3 - Export a document (Priority: P2)

As a developer, I want to export a document's items to YAML/CSV/TSV/XLSX, e.g.
for review outside VS Code or to feed another tool.

**Why this priority**: A periodic reporting/interop need.

**Independent Test**: Run "Export" on a document, choose a format and
destination, confirm the file is created with the document's items.

**Acceptance Scenarios**:

1. **Given** a document and a chosen format/destination, **When** the user runs
   "Export", **Then** a file in that format is written to the destination
   containing the document's items.

---

### User Story 4 - Publish a document (Priority: P3)

As a developer, I want to publish a document to a rendered Markdown/HTML/LaTeX
output for sharing with stakeholders who don't use VS Code.

**Why this priority**: An end-of-cycle/reporting action, the least frequent of
the four.

**Independent Test**: Run "Publish" on a document, choose a format and
destination, confirm a rendered document is produced.

**Acceptance Scenarios**:

1. **Given** a document and a chosen format/destination, **When** the user runs
   "Publish", **Then** a rendered output file is produced in that format.

---

### Edge Cases

- What happens when Import is pointed at a file whose format doesn't match the
  target document's expected structure?
- What happens when Export/Publish is pointed at a destination path that doesn't
  exist yet?
- How does Publish behave when the underlying renderer writes to a different
  actual path than requested (e.g. HTML nesting under a subfolder)?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to reorder a document's item levels
  automatically, without manual editing.
- **FR-002**: Users MUST be able to reorder a document manually via a generated,
  human-editable index file that is applied only on explicit confirmation.
- **FR-003**: System MUST let the user reuse or discard an existing in-progress
  manual-reorder index rather than silently overwriting or silently reusing it.
- **FR-004**: System MUST reject an attempt to apply a manual reorder when no
  index has been generated, with a clear error rather than a silent no-op.
- **FR-005**: Users MUST be able to import items into a chosen document from an
  external YAML, CSV, TSV, or XLSX file.
- **FR-006**: Users MUST be able to export a chosen document's items to YAML,
  CSV, TSV, or XLSX at a destination they choose.
- **FR-007**: Users MUST be able to publish a chosen document as rendered
  Markdown, HTML, or LaTeX output at a destination they choose.
- **FR-008**: System MUST report the resulting output location for
  Export/Publish, even when the underlying renderer's actual write location
  differs from the requested destination.

### Key Entities

- **Reorder Index**: a temporary, human-editable file listing a document's items
  and desired levels, generated on demand and consumed (and removed) when a
  manual reorder is applied.
- **Export/Publish Format**: one of the supported output formats (YAML/CSV/TSV/
  XLSX for export; Markdown/HTML/LaTeX for publish).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A document with drifted or duplicate level numbers can be fully
  renumbered in one command, with no hand-editing of YAML required for the
  automatic path.
- **SC-002**: A developer can move requirements into or out of VS Code
  (import/export) without hand-writing Doorstop's native file format.
- **SC-003**: A stakeholder without VS Code or Doorstop installed can review a
  published document's content.

## Assumptions

- Only one manual-reorder scratch index is assumed in flight per document at a
  time.
- Format support (YAML/CSV/TSV/XLSX for import/export; Markdown/HTML/LaTeX for
  publish) is bounded by what the underlying Doorstop library supports today;
  adding new formats is out of scope for this spec.
