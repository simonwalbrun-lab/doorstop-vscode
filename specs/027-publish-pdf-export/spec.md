# Feature Specification: Publish PDF Export

**Feature Branch**: `027-publish-pdf-export`

**Created**: 2026-10-09

**Status**: Draft

**Input**: User description: "I want to extend the publish command of doorstop by a direct pdf generation. there is some good work already resent in the reasearch folder doc\pdf_template (the export script now lives in `media/pdf-export/`; `doc/a4-template` holds the research HTML template). As a user I want to be able to generate a single pdf file of each document including the traceability page. It shall be able to get the same files runing in a gitlab or github CI"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Publish one document as a PDF (Priority: P1)

As a requirements engineer, I want to choose "PDF" as the publish format for a
document, so that I get a print-ready, paginated A4 file I can hand to a
reviewer or attach to a release without running any extra tool by hand.

**Why this priority**: This is the core of the request. Today the user must
publish HTML and then run the separate research script manually.

**Independent Test**: In a project with a document SYS, run Publish, pick SYS
and the PDF format, choose a destination; confirm exactly one PDF file is
written and opens with the document's title block, all items, and page
numbers.

**Acceptance Scenarios**:

1. **Given** a project with document SYS, **When** the user publishes SYS as
   PDF, **Then** one file `SYS.pdf` is written to the chosen location and the
   extension reports the written path.
2. **Given** the PDF is opened, **When** the user pages through it, **Then**
   every page is A4, every page except the first shows a running header with
   the document title (and the logo, if one is present next to the script),
   and every page shows a footer with "Page N of M".
3. **Given** the HTML carries no A4-style title block (for example Doorstop's
   default HTML), **When** it is published as PDF, **Then** the header shows
   the HTML page title (or the document prefix if there is none) and the
   footer omits the revision.

---

### User Story 2 - Publish all documents plus the traceability matrix as PDFs (Priority: P2)

As a project lead preparing a release baseline, I want one action that
produces a PDF for every document and a PDF of the traceability matrix, so the
complete document set exists as files that can be archived together.

**Why this priority**: Builds on story 1 and covers the "including the
traceability page" part of the request; a single document PDF is already
useful without it.

**Independent Test**: In a project with several documents, publish all
documents as PDF; confirm the destination folder holds one PDF per document
plus one traceability PDF, and nothing else is left behind.

**Acceptance Scenarios**:

1. **Given** a project with documents REQ, SYS and TST, **When** the user
   publishes all documents as PDF into a folder, **Then** the folder contains
   `REQ.pdf`, `SYS.pdf`, `TST.pdf` and a separate `traceability.pdf`.
2. **Given** the traceability matrix has more columns than fit a portrait page,
   **When** it is exported, **Then** it is printed in landscape A4, scaled
   down just enough that the full width fits, and no column is cut off.
3. **Given** the run finished, **When** the user inspects the destination,
   **Then** no intermediate HTML files or temporary folders remain from the
   PDF step.

---

### User Story 3 - Produce the same PDFs in a GitLab or GitHub CI pipeline (Priority: P3)

As a team that builds release artifacts in CI, I want to run the same PDF
generation in a GitLab or GitHub pipeline without VS Code, so the PDFs
attached to a release are identical to the ones a developer produces locally.

**Why this priority**: Required for traceable, reproducible release documents,
but depends on stories 1-2 existing first.

**Independent Test**: In a fresh Linux CI runner, install the project's
publishing tooling, run the documented command against a sample Doorstop
project, and compare the produced files' page count and text with the ones
produced from the extension for the same project.

**Acceptance Scenarios**:

1. **Given** a clean CI runner with only the documented prerequisites, **When**
   the pipeline publishes HTML with Doorstop and then runs the PDF export script
   stored in the repository, **Then** the same set of PDF files is produced as
   from the extension.
2. **Given** the same project revision and a template that brings its own
   fonts, **When** PDFs are produced locally and in CI, **Then** they have the
   same page count, page breaks and header/footer text.
3. **Given** a required prerequisite (for example the rendering browser) is
   missing on the runner, **When** the pipeline runs, **Then** it fails with a
   non-zero exit and a message naming the missing prerequisite and how to
   install it.

---

### Edge Cases

- The rendering component needed for PDF output is not installed on the
  user's machine: the extension says so before publishing anything and offers
  to install it, as it already does for the server package.
- More than one document owns a template folder: Doorstop's single-template
  error is shown and nothing is converted (PDF always uses one combined run).
- A custom publish template is configured: the PDF is produced from that
  template's HTML; if no template is configured, from Doorstop's default HTML.
  The extension never adds, copies or changes a template.
- A destination PDF is open in another program (locked on Windows): the run
  names the file it could not write and leaves the other PDFs written.
- A document has zero items: a PDF with only the title block is produced.
- The project has a single document: "all documents" produces that document's
  PDF plus the traceability PDF (if applicable) without error.
- Documents contain images or math formulas: they appear in the PDF as in the
  HTML view; external links are rendered as plain text, not clickable.
- The traceability matrix is too wide even at the print engine's smallest
  scale: it is printed at that smallest scale and the run reports that columns
  may be clipped.
- The user cancels the destination dialog: nothing is published.
- The run takes longer than one second: a progress notification names the
  document currently being exported.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The publish format picker MUST offer "PDF" alongside the existing
  formats.
- **FR-002**: Publishing a single document as PDF MUST write exactly one PDF
  file named after the document prefix to the chosen destination.
- **FR-003**: Publishing all documents as PDF MUST write one PDF per document
  plus one separate `traceability.pdf` into the chosen folder; the matrix is
  not repeated inside the document PDFs. Both "All" picker entries (spec 024)
  behave identically for PDF: one combined Doorstop run feeds the export.
- **FR-004**: Each PDF MUST be A4, paginated, with a running header on every
  page except the first and a footer with "Page N of M" on every page.
- **FR-005**: The header text MUST be the document name and title when the
  HTML provides an A4-style title block (`.doctitle`, `.native-meta`),
  otherwise the HTML page title, otherwise the document prefix. The footer MUST
  add the revision when that title block provides one. No per-document
  configuration is needed.
- **FR-006**: The traceability matrix PDF MUST print in landscape A4 and MUST
  be scaled down just enough for its full width to fit the printable page
  width (no scaling when it already fits), regardless of the HTML template.
- **FR-007**: Page breaks, fonts and content styling MUST come from the HTML
  as published (Doorstop default or the user's template, including its print
  rules); the export script MUST NOT restyle the document content.
- **FR-007a**: No HTML publish template MUST be shipped, copied or installed
  by the extension; the feature is limited to converting already published
  HTML into PDF with a headless browser script.
- **FR-008**: The header MUST show a logo when a logo file (SVG or PNG) is
  present next to the export script, and none when it is absent; the user
  replaces or removes it without editing any program code.
- **FR-009**: The PDF export MUST be a standalone script that lives in the
  user's repository, so it is runnable non-interactively outside VS Code on
  Linux CI runners (GitLab CI and GitHub Actions); the project documentation
  MUST include a working pipeline example for each.
- **FR-009a**: The extension MUST place the export script (with its logo and
  dependency manifest) into the user's repository on first PDF publish, after
  asking for confirmation, and MUST then run that same in-repository copy, so
  there is exactly one copy and local and CI output cannot drift apart.
- **FR-009b**: If the in-repository script already exists, the extension MUST
  use it as-is and MUST NOT overwrite user changes to it.
- **FR-010**: CI MUST verify, for the repository's regression project, that
  the expected set of PDF files is produced with correct header/footer text
  and the same page count on the same OS image. Given a template that brings
  its own fonts, PDFs from the extension and from CI SHOULD also have identical
  page breaks; that identity is a manual check, not a CI check. With templates that use system fonts (including
  Doorstop's default HTML), page breaks may differ between operating systems.
- **FR-011**: When the PDF rendering prerequisite is missing, the extension
  MUST detect it before publishing and offer installation; the CI entry point
  MUST exit non-zero with an actionable message.
- **FR-012**: A failure MUST name the document whose export failed; intermediate
  files MUST be removed whether the run succeeds or fails.
- **FR-013**: Existing HTML, LaTeX and Markdown publishing MUST behave
  exactly as before.
- **FR-014**: The new rendering dependency MUST be justified in the plan per
  the project constitution (Principle IV) and MUST NOT be required for users
  who never publish PDF.

### Key Entities

- **Document PDF**: One file per document prefix; carries the document's title
  block, items, running header/footer.
- **Traceability PDF**: The project-wide traceability matrix as a printable
  page.
- **PDF page frame**: What the export script adds around the published HTML
  (page size, margins, header/footer); the content styling itself belongs to
  the user's HTML template, not to this feature.
- **Export script**: The standalone PDF export tooling stored in the user's
  repository; the single entry point used by both the extension and CI.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user produces a PDF of one document with a single Publish
  action and one destination choice, with no manual steps outside VS Code.
- **SC-002**: For a project of N documents, "all documents as PDF" produces
  exactly N document PDFs plus the traceability PDF, and zero other files.
- **SC-003**: A CI pipeline following the documented example produces PDFs on
  its first run on a clean GitHub-hosted and a clean GitLab shared Linux
  runner.
- **SC-004**: For the repository's regression test project (Doorstop default
  HTML), the CI job produces exactly the expected PDF set with correct
  header/footer text and page count on the same OS image for 100% of
  documents; local-vs-CI page-break identity is verified manually with a
  template that brings its own fonts.
- **SC-005**: Exporting a 100-item document to PDF completes in under 30
  seconds on a typical developer machine.

## Assumptions

- The rendering approach proven in the research script `doc/pdf_template` (now `media/pdf-export/`) (render the published
  HTML in a headless browser, inject header/footer, suppress the header on
  page 1) is the starting point and is reused rather than redesigned.
- PDF output is produced from Doorstop's own HTML publishing; Doorstop itself
  is not modified (Constitution II).
- The HTML template is the user's responsibility: Doorstop's default HTML, or
  their own template selected via the existing publish-template setting.
  `doc/a4-template` stays research material and is not shipped.
- Clickable links are dropped in the PDF, as in the research script; the PDF is
  for reading and archiving, not navigation.
- The rendering browser is a one-time download per machine/runner; CI caching
  of it is the pipeline author's choice and only shown as an example.
- Linux is the CI target; Windows and macOS CI runners are not required.
- The CI runner needs both the Doorstop toolchain (to publish HTML) and the
  runtime of the export script (to render PDF); the pipeline examples install
  both.
- The extension does not generate or commit CI pipeline files; the user copies
  the documented example.

## Clarifications

### Session 2026-10-09

- Q: Where does the traceability page go? → A: Separate `traceability.pdf`
  next to the document PDFs.
- Q: How does CI run the PDF export? → A: A standalone export script copied
  into the repository (as in the research folder); the extension runs the same
  copy.

### Session 2026-10-10

- Q: Should the extension ship or install an HTML template (A4)? → A: No.
  Only the headless-browser script that converts published HTML to PDF is
  provided; the template is not part of the extension.
- Q: Which running header and footer does the script add for HTML from any
  template? → A: Generic header (document title, from page 2) and "Page N of
  M" footer, plus logo and revision whenever available (logo file next to the
  script; revision from A4-style markup in the HTML).
- Q: How is the traceability matrix printed without a template guaranteeing
  fit? → A: Landscape A4, shrinking the whole page just enough for the full
  width to fit.
- Q: Must local and CI PDFs be identical with any template? → A: Only with a
  template that brings its own fonts; with system fonts (e.g. Doorstop's
  default HTML) page breaks may differ between operating systems.
