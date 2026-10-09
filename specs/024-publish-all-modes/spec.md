# Feature Specification: Publish All Modes

**Feature Branch**: `024-publish-all-modes`

**Created**: 2026-10-09

**Status**: Draft

**Input**: User description: "I need to have two options in the extension for publishing in the quickselect. first "all individial" and "all together". think of better names. individual means that each document is published currently done by the extension but as a workaround the template need to be copied to the respective folder and removed afterwards by the extension. all together means a publishing of all files by one command. giving the option "all" to doorstop."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Publish all documents with a shared custom template (Priority: P1)

As a requirements engineer who keeps one custom publishing template next to a
single document (for example REQ), I want to publish every document of the
project with that template in one action, so that I no longer get a "template
folder not found" failure for every document that does not hold a copy.

**Why this priority**: This is the reported bug. Today "Publish All" succeeds
for the document that owns the template and fails for all others.

**Independent Test**: In a project where only REQ has a `template` folder and a
template name is configured, choose "All documents - one file each". Confirm
every document (REQ, SYS, ...) is published with the template and that
afterwards no `template` folder exists in any document that did not have one
before.

**Acceptance Scenarios**:

1. **Given** only REQ owns a template and the template setting names it,
   **When** the user publishes all documents one file each (HTML or LaTeX),
   **Then** every document is published using that template and none fails for
   a missing template folder.
2. **Given** the run above finished successfully, **When** the user inspects the
   documents, **Then** each document that had no template folder before has
   none now, and REQ's own template is unchanged.
3. **Given** a publish of one document fails midway, **When** the run stops,
   **Then** every temporarily provided template folder is still removed and the
   error names the failing document.

---

### User Story 2 - Publish everything in one combined run (Priority: P2)

As a user who wants the complete, linked document set (including the index
page) as one result, I want a publish choice that publishes all documents
together in a single run, so that the output is generated the way Doorstop
itself publishes a whole project.

**Why this priority**: It is the second, simpler route around the same problem
and yields a combined output, but it does not replace the per-document files
that some users rely on.

**Independent Test**: Choose "All documents - combined run" for a project with
several documents; confirm one run produces output for all documents in the
chosen folder and reports where it was written.

**Acceptance Scenarios**:

1. **Given** a project with several documents, **When** the user chooses the
   combined run and picks a destination folder, **Then** all documents are
   published in one run into that folder and the extension reports the real
   written location.
2. **Given** more than one document owns its own template folder, **When** the
   user runs the combined publish, **Then** the user sees Doorstop's
   explanation that only one template may exist for a combined run, and the
   extension leaves nothing half-written behind.

---

### User Story 3 - Clear choices in the publish picker (Priority: P3)

As a user, I want the document picker to offer the two "all" modes with names
that explain the difference, so I can choose without reading documentation.

**Why this priority**: Naming only; the behaviour is delivered by stories 1-2.

**Independent Test**: Open the publish command and read the picker entries.

**Acceptance Scenarios**:

1. **Given** the user starts Publish, **When** the document picker opens,
   **Then** it lists each document plus two entries, "All documents - one file
   each" and "All documents - combined run", each with a short description of
   the result, replacing the single former "all" entry.

---

### Edge Cases

- No document owns a template folder but a template name is configured: the
  one-file-each run reports Doorstop's missing-template error once, before
  writing anything, naming the setting.
- Several documents each own a template folder: each owner uses its own
  template; the first owner in tree order supplies the copies for documents
  lacking one.
- Markdown output or no configured template: no template is copied or removed.
- A document already has a template folder: it is never overwritten or deleted.
- The destination folder or the template source is unreadable or read-only: the
  run stops with a clear message and leaves no temporary folder behind.
- The user cancels the destination dialog: nothing is copied or published.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The publish document picker MUST offer, in addition to the
  individual documents, two distinct entries replacing the former single "all"
  entry: "All documents - one file each" and "All documents - combined run".
- **FR-002**: "One file each" MUST publish every document separately, as the
  extension does today.
- **FR-003**: When a template name is configured, the output format is not
  Markdown, and a document in a "one file each" run has no template folder of
  its own, the extension MUST temporarily provide a copy of the shared template
  in that document before publishing it.
- **FR-004**: The extension MUST remove every temporarily provided template
  folder after the run, whether it succeeded, failed, or was stopped, and MUST
  NOT touch a template folder that existed before the run.
- **FR-005**: The shared template source MUST be the template folder of the
  document that owns one; when several documents own one, each owner keeps its
  own and the first owner in tree order supplies the copies.
- **FR-006**: "Combined run" MUST publish all documents with a single request
  to Doorstop using its own "all documents" mode, into the chosen folder.
- **FR-007**: After either mode, the extension MUST report the location Doorstop
  actually wrote and, for "one file each", the number of documents published.
- **FR-008**: A failure MUST name the failing document ("one file each") or
  pass on Doorstop's own message ("combined run"), and, when a template was
  sent, name the template and the setting that supplied it.
- **FR-009**: Publishing a single chosen document MUST behave exactly as
  before.
- **FR-010**: Doorstop itself, including its template lookup, MUST NOT be
  modified; the workaround lives entirely in this project.

### Key Entities

- **Document**: A requirement set identified by a prefix; may or may not own a
  `template` folder.
- **Shared template**: The template folder of the document that owns one,
  reused for documents that do not.
- **Publish mode**: Single document, all documents one file each, or all
  documents in a combined run.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With a template owned by one document, 100% of documents publish
  successfully in "one file each" mode (previously only the owner did).
- **SC-002**: After any run, successful or not, the number of template folders
  in the project equals the number before the run.
- **SC-003**: A user can pick the right "all" mode on the first attempt from
  the entry names and descriptions alone.
- **SC-004**: The combined run produces output for every document with one
  user action and one destination choice.

## Assumptions

- The template name continues to come from the existing publish-template
  setting; no new setting is introduced.
- The temporary copy lives in the document's own folder because that is the
  only place Doorstop looks; it is removed afterwards, so it only remains if
  the editor itself crashes mid-run.
- The combined run keeps Doorstop's limit of at most one template folder across
  the project; the extension surfaces that error rather than working around it.
- Markdown publishing never uses a template, as today; the workaround applies
  to HTML and LaTeX output only.
