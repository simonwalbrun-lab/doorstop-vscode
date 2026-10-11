# Feature Specification: Commands Panel Updates & Project Status Report

**Feature Branch**: `021-project-status-report`

**Created**: 2026-10-04

**Status**: Draft

**Input**: User description: "the doorstop commands pannel in the sidebar needs new and updated commands. the publish document shall allow tho publish all at once by providing the option 'all' in the quick select. Some commands are running longer therefore I want to have some kind of command running indication for all commands until they are done. I want to have a new command which generates a markdown file which contains the current status of the project. It shall generate statistics by generating mermaid diagrams. following diagams shall be generated. - a xydiagrams with bars with counting the number of items per document - number of problems as bar with one bar for each problem and one diagram for each document. (Requirement Volatility): how many items were changed per week by simply counting the number of changed files per commit"

## Clarifications

### Session 2026-10-04

- Q: What should Publish "All" do when one document fails to publish? → A: Stop and show an error naming the failing document (fail fast); no partial-success summary, no server change.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Publish all documents at once (Priority: P1)

(Superseded in part by spec 024: the single "All" picker entry is replaced by "All documents - one file each" and "All documents - combined run" (024 FR-001). The scenarios below describe the "one file each" mode; there files are named `<PREFIX>.<ext>`.)

As a requirements engineer preparing a release, I want to pick "All" in the
Publish document picker so every document in the project is published in one
run, instead of repeating Publish once per document.

**Why this priority**: Publishing is today a per-document chore; projects with
several documents repeat the same three prompts many times. This is the
smallest change with immediate, everyday value.

**Independent Test**: In a project with at least two documents, run Publish,
choose "All", choose a format and a destination folder; confirm one published
output exists for every document.

**Acceptance Scenarios**:

1. **Given** a project with several documents, **When** the user runs Publish,
   **Then** the document picker offers an "All" entry next to the individual
   documents.
2. **Given** the user selected "All" and a format, **When** they choose a
   destination folder, **Then** every document is published into that folder
   in the chosen format.
3. **Given** "All" was chosen, **When** publishing finishes without error, **Then** the user
   sees one summary message naming the output location and how many documents
   were published.
4. **Given** one document fails to publish during "All", **When** the failure
   occurs, **Then** the run stops and an error message names the failing
   document and the reason; no success summary is shown.
5. **Given** the user selects a single document instead of "All", **When**
   Publish runs, **Then** behaviour is unchanged from today.

---

### User Story 2 - See that a command is still running (Priority: P1)

As a user who launched a slow command (publish, export, import, validation,
status report), I want a visible "running" indication until the command
finishes, so I know the extension is working and do not launch it twice.

**Why this priority**: Without feedback, slow commands look broken; users
re-click and start duplicate runs against the same repository.

**Independent Test**: Launch Publish → "All" on a project large enough to take
a few seconds; confirm a running indicator is visible from 1 second after the
work starts (spec 026) until the result message appears, and disappears afterwards.

**Acceptance Scenarios**:

1. **Given** any Doorstop command from the Commands panel that sends work to
   the server has started its work (after the user answered its prompts),
   **When** the work has been running for 1 second, **Then** a running
   indicator naming the command is visible. (Amended by spec 026
   FR-001/FR-002/FR-007/FR-009: work finishing within 1 second shows none;
   commands without server work, e.g. New Diagram and New Filter Notebook,
   show none.)
2. **Given** a command is running, **When** it finishes successfully or with an
   error, **Then** the indicator disappears.
3. **Given** a command is running, **When** the user tries to launch the same
   command again, **Then** the second launch does not start a parallel run and
   the user is told the command is already running.
4. **Given** the user cancels a command while answering its prompts, **When**
   the command ends, **Then** no indicator is left behind.

---

### User Story 3 - Generate a project status report (Priority: P2)

As a project lead, I want a command that writes a Markdown status report with
diagrams of the current project state, so I can share where the requirements
stand without opening VS Code for the reader.

**Why this priority**: High value for reporting but entirely new; stories 1–2
improve existing workflows first.

**Independent Test**: In a project with two documents, some validation
problems, and git history, run "Generate Status Report"; open the produced
Markdown file in a Mermaid-capable preview and confirm each section listed
below is present and its numbers match the project.

**Acceptance Scenarios**:

1. **Given** an open Doorstop project, **When** the user runs "Generate Status
   Report" from the Commands panel or Command Palette, **Then** a Markdown file
   is written and opened in the editor.
2. **Given** the report is generated, **Then** it contains a bar chart with one
   bar per document whose height is that document's item count.
3. **Given** the report is generated, **Then** it contains, for every document,
   one bar chart of that document's validation problems with one bar per
   problem type and its count.
4. **Given** a document has no problems, **When** the report is generated,
   **Then** that document's section states "No problems" instead of an empty
   chart.
5. **Given** the project is under git version control, **When** the report is
   generated, **Then** it contains a Requirement Volatility bar chart with one
   bar per calendar week showing how many item files changed in that week.
6. **Given** the project is not under git version control, **When** the report
   is generated, **Then** the volatility section states that history is
   unavailable and the rest of the report is still produced.
7. **Given** the report is generated, **Then** it states the date/time of
   generation and the project it describes.

---

### User Story 4 - Commands panel lists the new command (Priority: P3)

As a user of the sidebar Commands panel, I want the new status-report command
listed there alongside the existing ones.

**Why this priority**: Discoverability only; the command is usable from the
Command Palette without it.

**Independent Test**: Open the Commands panel; confirm a "Generate Status
Report" row exists and clicking it runs the command.

**Acceptance Scenarios**:

1. **Given** the Commands panel is open, **Then** it lists "Generate Status
   Report" in addition to all existing commands.
2. **Given** the user clicks the row, **Then** the status-report command runs.

---

### Edge Cases

- Project with zero documents: Publish "All" reports that there is nothing to
  publish; the status report is generated with empty/"no documents" sections.
- Project with exactly one document: "All" is still offered and behaves like
  publishing that one document.
- A document with zero items: it appears in the items-per-document chart with a
  bar of 0.
- Destination folder for "All" already contains earlier published output: it
  is overwritten, same as single-document publish today.
- The server is not running or not reachable when the status report is
  requested: the command fails with a clear message and writes no partial
  report.
- Git history contains weeks with no item changes: those weeks appear with a
  bar of 0 so the timeline has no gaps.
- Commits that change non-item files only (code, docs): they do not count
  toward volatility.
- Very long history: only the most recent 26 weeks are charted.
- Command fails with an error while the running indicator is shown: the
  indicator is removed and the error is shown.

## Requirements *(mandatory)*

### Functional Requirements

#### Publish all

- **FR-001**: The Publish command's document picker MUST offer an "All" entry,
  in addition to every individual document, in the same picker Review and
  Clear Suspect already use. (Superseded by spec 024 FR-001: two entries,
  "All documents - one file each" and "All documents - combined run".)
- **FR-002**: When "All" is chosen, the system MUST ask for the publish format
  once and a destination folder once, then publish every document of the
  project into that folder in that format.
- **FR-003**: When "All" is chosen and a document fails to publish, the run
  MUST stop at that document and show an error naming the document and the
  reason. Documents already published stay on disk.
- **FR-004**: After an "All" run that succeeds, the system MUST report the output
  folder and the number of documents published.
- **FR-005**: Publishing a single document MUST keep its current behaviour.

#### Running indication

- **FR-006**: Every command offered in the Commands panel that sends work to
  the server MUST show a visible running indicator, labelled with the
  command's name, from 1 second after the start of its work until it
  completes, fails, or is cancelled. (Amended by spec 026
  FR-001/FR-002/FR-007/FR-009: faster work shows none; commands without
  server work, e.g. New Diagram and New Filter Notebook, show none.)
- **FR-007**: While a command is running, launching the same command again MUST
  NOT start a second parallel run; the user MUST be informed it is already
  running.
- **FR-008**: The indicator MUST NOT appear while the user is still answering a
  command's prompts, and MUST never remain visible after the command ended.

#### Status report

- **FR-009**: The system MUST provide a "Generate Status Report" command,
  available from the Commands panel and the Command Palette.
- **FR-010**: The command MUST write a single Markdown file and open it in the
  editor. The default location is `doorstop-status.md` in the workspace root;
  an existing file at that location is overwritten.
- **FR-011**: The report MUST include a header with the generation date/time
  and the project (workspace) name.
- **FR-012**: The report MUST include an items-per-document bar chart, one bar
  per document, value = number of items in that document.
- **FR-013**: The report MUST include one problems bar chart per document, one
  bar per problem type, value = number of problems of that type in that
  document. Documents with no problems MUST show a "No problems" note instead.
- **FR-014**: Problem counts MUST come from the same validation the extension
  already uses for the Problems view, so the report and the Problems view agree.
- **FR-015**: The report MUST include a Requirement Volatility bar chart with
  one bar per calendar week (ISO week) over the most recent 26 weeks, value =
  sum over that week's commits of the number of changed item files per commit.
- **FR-016**: Only files that are Doorstop items count toward volatility.
- **FR-017**: If version history is unavailable, the volatility section MUST
  say so and the rest of the report MUST still be generated.
- **FR-018**: All charts MUST be embedded as Mermaid diagram blocks so they
  render in any Mermaid-capable Markdown viewer without extra files.
- **FR-019**: If project data cannot be retrieved, the command MUST show a
  clear error and MUST NOT write a partial report.

#### Commands panel

- **FR-020**: The Commands panel MUST list the new "Generate Status Report"
  command alongside all existing commands.

### Key Entities

- **Status Report**: a generated Markdown file; holds the generation timestamp,
  project name, and the three chart sections.
- **Document statistic**: per document — prefix, item count, and problem count
  per problem type.
- **Problem type**: a category of validation problem as reported by Doorstop
  validation (e.g. unreviewed item, suspect link, missing link).
- **Volatility point**: one calendar week and the number of item files changed
  in commits made during that week.
- **Running command**: a command whose work is in progress; at most one run per
  command at a time.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Publishing every document of a project takes one command run and
  at most three user choices (document "All" - since spec 024 one of the two
  "All documents" entries -, format, folder), regardless of the number of
  documents.
- **SC-002**: For 100% of Commands panel commands, a running indicator is
  visible within 1 second of the work starting and gone within 1 second of it
  ending.
- **SC-003**: Zero duplicate parallel runs of the same command can be started
  from the UI.
- **SC-004**: The status report for a project of up to 10 documents and 2,000
  items is produced in under 10 seconds.
- **SC-005**: Item counts and problem counts in the report match the Explorer
  tree and the Problems view exactly for the same project state.
- **SC-006**: The produced report renders all its charts without errors in VS
  Code's Markdown preview with Mermaid support and on GitHub.

## Assumptions

- "Problem type" means the category of a validation problem, not each
  individual problem; listing every single problem as its own bar would give
  bars that are all 1.
- Volatility counts changed item files per commit and sums them per week; an
  item changed in two commits in one week counts twice (as the user asked:
  "simply counting the number of changed files per commit").
- The most recent 26 weeks are charted to keep the chart readable.
- "Running indication" is a standard progress notification/indicator of the
  editor; no custom UI is needed.
- For Publish "All", outputs land in one chosen folder, using each document's
  default published file name (one file or sub-folder per document, as the
  publisher produces). (Since spec 024, "one file each" names files
  `<PREFIX>.<ext>`; the combined run keeps Doorstop's own layout.)
- The existing `doorstop.publish.template` setting applies to "All" the same
  way it applies to a single-document publish.
- Users view the report with a Mermaid-capable Markdown viewer; the extension
  does not render the charts itself.
- Version history is read from the git repository containing the workspace;
  other version-control systems are out of scope.
