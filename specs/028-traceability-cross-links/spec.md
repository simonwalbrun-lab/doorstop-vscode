# Feature Specification: Publish Without Child Links

**Feature Branch**: `028-traceability-cross-links`

**Created**: 2026-10-10

**Reworked**: 2026-10-18

**Status**: Implemented

**Input**: Users can publish documents without the child links that Doorstop adds to each item. Publishing otherwise gives exactly what Doorstop's own publish gives.

## Background

Feature 028 first tried to add links that skip a document level or cross
branches to the published traceability matrix and to child links. That
approach was withdrawn. Publishing is again plain Doorstop output. Links that
skip a document level or point outside the parent chain are therefore missing
from the traceability matrix and from the target item's child links; the
linking item's own page still lists all its parent links. This is a known
limitation, not something this feature addresses.

What remains is one user-facing option: hiding child links.

## Clarifications

### Session 2026-10-18

- Q: After the withdrawal, should publishing use Doorstop's standard behaviour, keeping only the option to hide child links? → A: Yes. No special handling of the traceability matrix or cross-document links.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Publish without child links (Priority: P1)

As a user publishing documents, I want a setting that leaves child links out
of the published items, so that published pages show only the links each item
declares itself.

**Why this priority**: It is the only configurable publish behaviour of this
feature.

**Independent Test**: Check the setting, publish all documents as Markdown,
and confirm no item shows child links and the parent links are labelled
"Links:".

**Acceptance Scenarios**:

1. **Given** the setting is unchecked (default), **When** documents are
   published, **Then** child links appear as Doorstop renders them.
2. **Given** the setting is checked, **When** documents are published as HTML,
   Markdown or PDF, **Then** no item shows child links and the parent links
   are labelled "Links:".
3. **Given** the setting is checked, **When** all documents are published,
   **Then** the traceability matrix is the same as with the setting unchecked.
4. **Given** a publish finishes or fails, **When** the next publish runs with
   the setting unchecked, **Then** child links appear again (the setting does
   not leak between publishes).

---

### User Story 2 - Publishing matches Doorstop (Priority: P2)

As a maintainer or CI user, I want published output to equal what
`doorstop publish` produces, so that local and CI results are identical and
Doorstop upgrades cannot silently break publishing.

**Why this priority**: It is the guarantee that nothing else alters the output.

**Independent Test**: Publish the same project from the extension and with
`doorstop publish`, with the same template and options, and compare the files.

**Acceptance Scenarios**:

1. **Given** any project, **When** it is published from the extension and with
   `doorstop publish`, **Then** the item pages, the traceability matrix and its
   comma-separated file have the same content.
2. **Given** a link that skips a document level, **When** all documents are
   published, **Then** the matrix and the target's child links are Doorstop's
   own (the link is not added).
3. **Given** a publish, **When** it completes, **Then** the item files on disk
   are unchanged.

---

### User Story 3 - Documentation matches the behaviour (Priority: P3)

As a user, I want the documentation to describe only what exists, so that I
am not told to use settings or commands that are gone.

**Acceptance Scenarios**:

1. **Given** the Settings UI and README, **When** searched for "traceability",
   **Then** no publish setting of that name exists.
2. **Given** the CI documentation, **When** read, **Then** it uses plain
   `doorstop publish` and states the known limitation about links that skip a
   document level.
3. **Given** a settings file or a client from an earlier version that still
   contains the removed traceability option, **When** publishing, **Then** the
   value is ignored without an error.

---

### Edge Cases

- Publishing a single document with the setting checked: that document's items
  show no child links.
- A project whose links all follow the document hierarchy: output is the same
  as before this rework.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Publishing MUST NOT alter Doorstop's publishing behaviour
  beyond the options in FR-004.
- **FR-002**: Published item pages, traceability matrix and its
  comma-separated file MUST equal what Doorstop's own publish produces for the
  same project, template and options.
- **FR-003**: No setting or request option for changing the traceability
  matrix or for adding cross-document links MUST exist; a leftover value from
  an earlier version MUST be ignored.
- **FR-004**: The extension MUST offer the checkbox setting
  `doorstop.publish.noChildLinks`, unchecked by default. When checked, every
  publish (HTML, Markdown, PDF) MUST omit child links and label the parent
  links "Links:", as Doorstop's own no-child-links option does. It MUST NOT
  change the traceability matrix, and it MUST NOT affect later publishes.
- **FR-005**: The documented CI publishing command MUST be plain
  `doorstop publish`.
- **FR-006**: README, CHANGELOG and the PDF publishing documentation MUST NOT
  mention a traceability setting and MUST state the known limitation.
- **FR-007**: Publishing MUST NOT change item files on disk.

### Key Entities

- **Publish settings**: `doorstop.publish.template` and
  `doorstop.publish.noChildLinks` (default unchecked).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For the sample project, 100% of matrix rows and item pages from
  the extension equal those of `doorstop publish`.
- **SC-002**: With the setting checked, 0 item pages show child links, and the
  matrix is unchanged.
- **SC-003**: The Settings UI offers 0 settings named "traceability".

## Assumptions

- Missing cross-document links in the matrix and child links are accepted and
  only documented.
- The older design documents in this folder (`plan.md`, `research.md`,
  `tasks.md`, `data-model.md`, `quickstart.md`, `contracts/`) were written for
  the removal and may need aligning with this wording.
- Entries of earlier releases in the changelog stay as written.
