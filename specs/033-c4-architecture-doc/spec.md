# Feature Specification: C4 Architecture Document

**Feature Branch**: `033-c4-architecture-doc`

**Created**: 2026-10-16

**Status**: Draft

**Input**: User description: "As a developer I need to keep an overview of the repository. Therefore I need a architecture document which reflects the main points. this needs to be keept up to date with each new spec (I will add this afterwards to the constituition). I want to have a architecture using the C4 architecture style."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Understand the system from one document (Priority: P1)

A developer (the maintainer, a new contributor, or an AI coding agent working on a spec) opens a single architecture document and, by reading it top-down, learns what the system is, who and what it talks to, which runtime parts it consists of, and which building blocks live inside each part. The document follows the C4 model: a System Context view, a Container view, and a Component view for each container that holds code of this repository.

**Why this priority**: This is the core value: one place that answers "where does this live and what does it talk to?" without reading 30+ specs or the whole source tree.

**Independent Test**: Open the document, follow the three C4 levels, and locate the building block responsible for a named feature (e.g. "background problem checking", "diagram canvas", "PDF export") together with the container it runs in.

**Acceptance Scenarios**:

1. **Given** the repository, **When** a developer opens the architecture document, **Then** they find a System Context view showing the developer as the user, the VS Code workbench, the Doorstop requirements repository on disk, and every other external system the extension depends on (Python environment / package installer, Doorstop library).
2. **Given** the System Context view, **When** the developer moves to the Container view, **Then** they see every separately running or separately delivered part (extension host, each webview, local requirements server, requirements files on disk) and the kind of communication between them.
3. **Given** the Container view, **When** the developer opens the Component view of the extension or the server, **Then** every component is listed with a one-line responsibility and the source location where it lives.
4. **Given** any diagram in the document, **When** it is viewed on the repository's hosting page or in an editor's Markdown preview that supports the diagram notation, **Then** it renders as a diagram and is accompanied by a text legend/table so it is still understandable as plain text.

---

### User Story 2 - Keep the document current with every spec (Priority: P2)

Whenever a new spec is implemented, the developer updates the architecture document by hand as part of that spec's work, following the document's own update guide. The document states which spec it was last brought up to date with, so anyone can see at a glance whether it has fallen behind.

**Why this priority**: The user's main concern is that the document stays correct over time. Without a clear update step it decays exactly like the existing arc42 notes, which are already marked "outdated". The rule to do this with every spec will be added to the constitution by the user; there is no automated enforcement.

**Independent Test**: Follow the update guide for a spec that added a new source module; afterwards the module appears in the right Component view and the recorded spec number equals that spec's number.

**Acceptance Scenarios**:

1. **Given** a newly implemented spec, **When** the developer follows the update guide, **Then** they know which views to review and where to record the spec number.
2. **Given** the recorded spec number, **When** a developer compares it with the highest spec directory, **Then** they can tell whether the document is current.

---

### User Story 3 - See key runtime flows and decisions (Priority: P3)

Beyond the static structure, the developer can read a short description of the few cross-cutting runtime behaviours that shape the design (server start-up and connection, one-request-at-a-time processing and cancellation, how a UI action becomes a change on disk) and a short list of key architecture decisions, each linked to the constitution principle or spec that motivates it.

**Why this priority**: Useful for understanding "why", but the structural C4 views already deliver most of the overview value.

**Independent Test**: Pick one key decision (e.g. "the server is the single source of truth") and follow its link to the constitution principle or originating spec.

**Acceptance Scenarios**:

1. **Given** the document, **When** the developer looks for how a user action reaches the requirements files, **Then** a dynamic view (sequence-style) shows the path from UI through extension and server to disk.
2. **Given** the key decisions section, **When** the developer reads a decision, **Then** it names its motivating constitution principle or spec number.

---

### Edge Cases

- A source file that is a test, a generated file, or a build artifact: it is not an architectural component and is not listed.
- A spec whose implementation does not change the architecture: the document still records that it was reviewed for that spec (the recorded spec number moves forward) without content changes.
- Specs developed in parallel on different branches: the recorded number is the highest spec reviewed; merge conflicts on that line are resolved by keeping the higher number after checking both specs are covered.
- The existing, outdated arc42 notes in `doc/arc42/`: they must not compete with the new document as a second source of truth.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The repository MUST contain exactly one architecture document at a fixed, documented location, written as plain-text Markdown so it can be reviewed in pull requests.
- **FR-002**: The document MUST contain a C4 System Context view (level 1) naming the user, the system, and every external system it interacts with.
- **FR-003**: The document MUST contain a C4 Container view (level 2) naming every container (extension host, each webview, local requirements server, requirements files on disk, Python environment) and the communication between them.
- **FR-004**: The document MUST contain a C4 Component view (level 3) for the extension host container and for the requirements server container.
- **FR-005**: Every component in a Component view MUST state its responsibility in one sentence and the source path(s) it lives in.
- **FR-006**: Every diagram MUST be written in a text-based diagram notation that renders on the repository hosting page, and MUST be accompanied by a table or list carrying the same elements, so the content is complete without rendering.
- **FR-007**: Every non-test, non-generated source module of the extension and of the server MUST be mentioned by path in the document when this feature ships.
- **FR-008**: Every source path mentioned in the document MUST exist in the repository when this feature ships.
- **FR-009**: The document MUST record, at a fixed place near its top, the number of the most recent spec it was brought up to date with.
- **FR-010**: The document MUST contain a dynamic view showing how a user action that changes requirements travels from the UI through the extension and the server to the files on disk.
- **FR-011**: The document MUST contain a key decisions section in which each decision references the constitution principle or spec that motivates it.
- **FR-012**: The document MUST contain a short "how to update this document" section stating what to review when a new spec is implemented and where to record the spec number.

### Key Entities

- **Architecture document**: the single Markdown file holding all C4 views, the dynamic view, key decisions, the update guide, and the "last updated for spec" marker.
- **C4 element**: a person, software system, container, or component shown in a view; has a name, a type, a one-line responsibility, and (for containers/components) a technology label and source path.
- **Relationship**: a directed connection between two C4 elements with a short description of what flows across it (e.g. "HTTP/JSON requests", "postMessage").
- **Spec marker**: the recorded number of the latest spec the document was reviewed against.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer new to the repository can name the container and the source location responsible for any of five randomly chosen features within 5 minutes, using only the architecture document.
- **SC-002**: 100% of non-test, non-generated source modules of the extension and the server are mentioned in the document at the time this feature ships.
- **SC-003**: Every subsequent spec merged to the main branch leaves the document's recorded spec number equal to that spec's number.
- **SC-004**: All diagrams in the document render on the repository hosting page without errors.
- **SC-005**: The document can be read end to end in under 20 minutes.

## Assumptions

- The document lives under `doc/` next to the existing material (e.g. `doc/architecture.md`); the exact path is fixed during planning and documented in the update section.
- Diagrams use Mermaid, which the existing `doc/arc42` notes already use and which the repository hosting page renders; its C4 diagram types or plain flowcharts styled as C4 are both acceptable as long as FR-006 holds.
- C4 level 4 (code diagrams) is out of scope; the source path per component is the link to the code.
- The outdated arc42 files are kept, not deleted; only a pointer to the new document is added (FR-013). Content worth keeping (quality goals, stakeholders) may be summarized or linked from the new document.
- "Source module" means a top-level source file of the extension (`src/*.ts`, plus each webview folder) and each Python module/router of the server package; tests, build output, and generated files are excluded.
- Adding the "update the architecture document with each spec" rule to the constitution is done by the user afterwards and is not part of this feature.
- This feature adds documentation only, no code. Constitution Principles VI and VIII (automated test per feature and per FR) are deliberately not applied: the user decided against an automated check (FR-014). FRs are verified by review. Per the constitution's Governance section, this deviation must be stated in the PR.
