# Feature Specification: Traceability Cross-Document Links

**Feature Branch**: `028-traceability-cross-links`

**Created**: 2026-10-10

**Status**: Draft

**Input**: User description: "The publication templates to include cross-document traceability links. The default publisher only renders links following the rigid document tree hierarchy. Update the item HTML/markdown template to iterate directly over the raw `item.links` attribute instead of relying solely on `item.parent_links` or `item.child_links`. Ensure all multi-parent UIDs declared in the raw item YAML metadata are visible in the generated output. this is requiremd for the generated tracebility.html file."

## Background (observed behaviour)

Reproduced on 2026-10-10 with a tree REQ → SYS → TST, where TST001 links to
SYS001, SYS002 (multi-parent) and REQ002 (skips the SYS level), then publishing
all documents as HTML:

- TST001's own page lists all three parents (REQ002, SYS001, SYS002). Links on
  the linking item's page are already complete.
- Multi-parent links within adjacent levels appear in the traceability matrix
  as one row per path (REQ001-SYS001-TST001 and REQ001-SYS002-TST001).
- The link TST001 → REQ002 is **lost**: the matrix row for REQ002 shows empty
  SYS and TST cells, and REQ002's page shows no child link to TST001. Doorstop
  only searches for children in the documents directly below an item's
  document, so any link that skips a level or points to a document outside the
  parent chain is dropped from the matrix and from the target's child links.

This feature closes that gap. The traceability matrix and the item pages are
assembled by Doorstop's publisher itself, not by the publish template, so a
template change alone cannot fix the matrix (see Assumptions).

## Clarifications

### Session 2026-10-10

- Q: Which mode should a fresh install use when the user has never touched the new traceability setting? → A: Complete links (the new behaviour) by default; users can switch back to Doorstop's default.
- Q: Should the traceability setting switch only the matrix, or also the child links on item pages? → A: Only the matrix. Item child links are always complete (cross-document included). A second setting, a checkbox, applies Doorstop's own `--no-child-links` publish option to hide child links entirely. Doorstop itself stays unmodified.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Every declared link appears in the traceability matrix (Priority: P1)

As a requirements engineer preparing a release baseline, I want the published
traceability matrix to show every link declared in my items, including links
that skip a document level or point across branches of the document tree, so
that an auditor reading `traceability.html` sees the same coverage the items
actually declare.

**Why this priority**: This is the reported defect. A matrix that silently
omits declared links shows requirements as uncovered when they are covered,
which undermines the matrix as audit evidence.

**Independent Test**: Publish all documents of a REQ → SYS → TST project in
which TST001 links to REQ002 directly. Open `traceability.html` and confirm a
row contains both REQ002 and TST001.

**Acceptance Scenarios**:

1. **Given** TST001 links directly to REQ002 (skipping SYS), **When** the user
   publishes all documents as HTML, **Then** the traceability matrix has a row
   containing REQ002 and TST001, with the SYS cell of that row empty.
2. **Given** TST001 links to SYS001 and SYS002, **When** the matrix is
   published, **Then** both paths appear as separate rows, exactly as today.
3. **Given** the traceability setting is "doorstop", **When** the same project
   is published, **Then** the matrix is exactly Doorstop's own (REQ002 row
   with empty SYS and TST cells).
4. **Given** a project in which every link follows the document hierarchy,
   **When** the matrix is published, **Then** its rows are identical to the
   ones produced before this feature.
5. **Given** the same project, **When** the matrix is also written as the
   comma-separated file next to it, **Then** that file contains the same rows
   as the HTML matrix.

---

### User Story 2 - Target items show incoming cross-document links (Priority: P2)

As a reviewer reading a published document, I want each item to list every
item that links to it, including items from documents that are not directly
below it, so I can follow traceability downwards from any requirement.

**Why this priority**: Completes the picture for readers of single documents,
but the matrix (story 1) is what the request names as required.

**Independent Test**: In the same project, publish all documents and open
REQ's page; confirm REQ002 lists TST001 as a child link that navigates to
TST001.

**Acceptance Scenarios**:

1. **Given** TST001 links to REQ002, **When** all documents are published as
   HTML, **Then** REQ002's entry lists TST001 among its child links, and
   following that link opens TST001.
2. **Given** the same project, **When** it is published as Markdown, **Then**
   REQ002's entry lists TST001 among its child links.
3. **Given** an item with incoming links only from its direct child document,
   **When** it is published, **Then** its child links are identical to the
   ones produced before this feature.
4. **Given** the "no child links" checkbox is checked, **When** all documents
   are published, **Then** no item page shows child links, TST001's page lists
   its links under "Links:", and the traceability matrix is unchanged.
5. **Given** the traceability setting is "doorstop", **When** all documents are
   published, **Then** REQ002's page still lists TST001 as a child link, while
   the matrix shows Doorstop's own rows.

---

### User Story 3 - Same result in the PDF and in CI (Priority: P3)

As a team that produces release PDFs (spec 027) locally and in CI, I want the
traceability PDF and the CI-generated files to contain the same complete links
as the extension's HTML output.

**Why this priority**: Depends on stories 1-2; it keeps spec 027's promise
that local and CI outputs are identical.

**Independent Test**: Publish the sample project as PDF from the extension and
through the documented CI command; confirm both traceability PDFs contain the
REQ002-TST001 row.

**Acceptance Scenarios**:

1. **Given** the sample project, **When** all documents are published as PDF
   from the extension, **Then** the traceability PDF contains the REQ002-TST001
   row.
2. **Given** the same project revision, **When** the documented CI command is
   run without VS Code, **Then** the produced traceability matrix has the same
   rows as the one produced from the extension.

---

### Edge Cases

- A link points to a UID that does not exist: it is shown as plain, unlinked
  text in the linking item's parent links, as today, and creates no matrix row.
- A link points to an inactive item: it is treated the way Doorstop already
  treats inactive items (not shown as a linked matrix entry).
- A link points to an item in the same document: it appears in that item's
  parent and child links; the matrix shows it only as far as one cell per
  document allows (no extra column is invented).
- Two different paths lead to the same row content: the row appears once.
- Non-normative items (headings): excluded from the matrix, as today.
- Links in both directions between the same two items: the matrix still
  finishes and contains each distinct row once.
- Publishing a single document (not "all"): no matrix is produced, as today;
  child links on that document's items still include cross-document links.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The published traceability matrix MUST contain, for every active
  normative item and every UID in that item's declared links that resolves to
  an active normative item, at least one row containing both items, regardless
  of whether the two documents are adjacent in the document tree.
- **FR-002**: A matrix row produced for a link that skips one or more document
  levels MUST leave the cells of the skipped documents empty.
- **FR-003**: For a project whose links all follow the document hierarchy, the
  published matrix MUST be identical (same rows, same order) to the matrix
  Doorstop produces without this feature.
- **FR-004**: The comma-separated matrix file MUST contain the same rows as the
  HTML matrix.
- **FR-005**: Unless child links are switched off (FR-012), each published
  item's child links (HTML and Markdown) MUST list
  every active item whose declared links contain this item's UID, from any
  document of the tree, and each such link MUST navigate to the linking item
  in the HTML output.
- **FR-006**: Each published item's parent links MUST continue to list every
  UID declared in its links, including all of several parents, as today.
- **FR-007**: The matrix MUST NOT contain duplicate rows, and building it MUST
  terminate for projects that contain link cycles.
- **FR-008**: The complete links (matrix in "complete" mode, item child links
  unless switched off) MUST appear whether or not a custom publish template is
  configured, and in the PDF output of spec 027.
- **FR-009**: The documented CI publishing command (spec 027) MUST produce the
  same traceability matrix and item pages as the extension for the same
  project revision and the same choices of FR-011 and FR-012.
- **FR-010**: Doorstop itself MUST NOT be modified; the change lives entirely in
  this project, and the item files on disk MUST NOT be changed by publishing.
- **FR-011**: The extension MUST offer a setting `doorstop.publish.traceability`
  with two values: "complete" (the matrix follows FR-001..FR-004 and FR-007)
  and "doorstop" (the matrix and its comma-separated file are exactly what
  Doorstop's own publish produces). The default MUST be "complete". The
  setting MUST NOT affect item pages: their child links follow FR-005 in both
  modes.
- **FR-012**: The extension MUST offer a checkbox setting
  `doorstop.publish.noChildLinks`, unchecked by default. When it is checked,
  every publish MUST apply Doorstop's own `--no-child-links` behaviour: item
  pages show no child links, and the parent links label reads "Links:" as
  Doorstop renders it. The setting MUST NOT change the traceability matrix.

### Key Entities

- **Declared link**: A UID listed in an item's own link list; the source of
  truth for what the item traces to.
- **Cross-document link**: A declared link whose target lies in a document that
  is not the linking item's parent document (skips a level or crosses
  branches).
- **Publish settings**: `doorstop.publish.traceability` ("complete" |
  "doorstop", default "complete"; matrix only) and
  `doorstop.publish.noChildLinks` (checkbox, default unchecked; item pages
  only), alongside the existing `doorstop.publish.template`.
- **Traceability row**: One path through the documents, with at most one item
  per document column and empty cells where a document is skipped.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of declared links between active normative items appear in
  at least one row of the published traceability matrix (previously,
  cross-document links appeared in 0% of cases).
- **SC-002**: For projects with hierarchy-only links, the published matrix is
  byte-for-byte unchanged in content rows compared with the previous output.
- **SC-003**: An auditor can confirm coverage of any requirement from the
  matrix alone, without opening the item files.
- **SC-004**: The traceability matrix produced locally and in CI for the same
  revision has identical rows.

## Assumptions

- The user's suggested approach (iterating the raw link list in the item
  template) cannot fix `traceability.html`: Doorstop builds the matrix rows and
  the item bodies in its publisher code and passes them to the template as
  finished text. The fix therefore belongs in this project's publishing path
  (server and CI tooling), not in the `.tpl` files; the templates stay
  unchanged unless planning finds otherwise.
- Parent links on item pages already show all declared UIDs, including
  multiple parents; this feature keeps that behaviour and adds the missing
  reverse direction and matrix rows.
- LaTeX output is out of scope; Markdown has no traceability matrix, so only
  its child links change.
- Inactive and unresolvable links keep Doorstop's current handling; this
  feature does not change validation or warnings.
- Matrix column order and row sort order stay as Doorstop defines them.
