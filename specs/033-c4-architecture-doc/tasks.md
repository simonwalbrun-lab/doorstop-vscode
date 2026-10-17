---

description: "Task list for the C4 architecture document"
---

# Tasks: C4 Architecture Document

**Input**: Design documents from `/specs/033-c4-architecture-doc/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [quickstart.md](quickstart.md)

**Tests**: None. The user decided against an automated check; every FR is verified by the review table in [quickstart.md](quickstart.md).

**Organization**: All tasks edit the same file, `doc/architecture.md`, so no task is marked [P]. Tasks are grouped by user story so each story can be delivered and reviewed on its own.

## Format: `[ID] [P?] [Story] Description`

- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Conventions for every task

- Diagrams: Mermaid `flowchart` styled as C4: node labels carry the element type in brackets, e.g. `["Requirements server<br/>[Container: Python, FastAPI]"]`; `subgraph` marks a system or container boundary (research R1). Dynamic view: Mermaid `sequenceDiagram`.
- Every diagram is directly followed by a table with exactly the same elements (FR-006).
- Source paths are written as repo-relative paths in backticks, e.g. `src/doorstopServer.ts` (FR-005, FR-007).
- Before writing a responsibility, read the file's exports and top-level code; write one sentence per component, not per file.

---

## Phase 1: Setup

**Purpose**: Create the file with its fixed outline.

- [X] T001 Create `doc/architecture.md` with the title `# Architecture`, the two marker lines `**Up to date with spec:** 033` and `**Pending specs:** 032` directly below it, and empty headings for sections 1–9 in the order of the outline table in [data-model.md](data-model.md): `## 1. Overview`, `## 2. Level 1 – System Context`, `## 3. Level 2 – Containers`, `## 4. Level 3 – Components: Extension host`, `## 5. Level 3 – Components: Requirements server`, `## 6. Dynamic view – change a requirement`, `## 7. Cross-cutting concepts`, `## 8. Key decisions`, `## 9. How to update this document`

---

## Phase 2: Foundational

**Purpose**: The overview and legend every view relies on.

- [X] T002 Write `## 1. Overview` in `doc/architecture.md`: 3–5 sentences on what the system is (VS Code extension + local Python server wrapping Doorstop), how to read the document (top-down through C4 levels 1–3, then dynamic view and decisions), a legend table of the C4 element types used (Person, Software system, External system, Container, Component), and one sentence stating that this document supersedes the notes in `doc/arc42/` with a link to `doc/arc42/2000_introduction_and_goals.md` for quality goals and stakeholders (research R6)

**Checkpoint**: skeleton and overview in place.

---

## Phase 3: User Story 1 - Understand the system from one document (Priority: P1) 🎯 MVP

**Goal**: A reader can go from system context to the source file responsible for any feature.

**Independent Test**: Using only `doc/architecture.md`, find the container and source path for "background problem checking", "diagram canvas", and "PDF export".

- [X] T003 [US1] Write `## 2. Level 1 – System Context` in `doc/architecture.md`: Mermaid flowchart + table with the Person "Developer (requirements author)", the Software system "Doorstop Requirements for VS Code", and External systems "VS Code workbench", "Python environment / pip", "Doorstop library", "Git", "PDF export tooling (Node script)"; each relationship labeled with what flows (FR-002). Confirm Git usage in `src/statusReport.ts` and `src/doorstopCommands.ts`, and the PDF tooling in `src/pdfExport.ts`
- [X] T004 [US1] Write `## 3. Level 2 – Containers` in `doc/architecture.md`: Mermaid flowchart inside a system boundary + a containers table (name, technology, responsibility, source path) with exactly the five containers from [data-model.md](data-model.md) (Extension host `src/*.ts`; Diagram webview `src/webview/diagram/`; Filter-results renderer `src/webview/filterResults/`; Requirements server `server/src/doorstop_server/`; Requirements repository on disk) and a relationships table with the five relationships listed there (HTTP/JSON on `127.0.0.1:7867` and child-process spawn per `src/doorstopServer.ts`; `postMessage` JSON per `src/diagrammPanel.ts` and `src/webview/diagram/messaging.js`; notebook output MIME `application/vnd.doorstop.filter-results+json` per `package.json`; Doorstop API reads/writes; `*.doorstop.json` custom editor + file watching per `src/extension.ts`) (FR-003)
- [X] T005 [US1] Write `## 4. Level 3 – Components: Extension host` in `doc/architecture.md`: Mermaid flowchart inside the Extension host boundary + table (component, one-sentence responsibility, source paths) with these components, each listing all its files (FR-004, FR-005, FR-007):
  - Activation & wiring: `src/extension.ts`
  - Server client & lifecycle: `src/doorstopServer.ts`, `src/pythonEnvironment.ts`, `src/doorstopTypes.ts`
  - Requirement index: `src/doorstopIndex.ts`
  - Tree views & commands: `src/requirementTree.ts`, `src/commandsProvider.ts`, `src/doorstopCommands.ts`, `src/deriveProvider.ts`
  - Editor language features: `src/hoverProvider.ts`, `src/completionProvider.ts`, `src/definitionProvider.ts`, `src/callHierarchyProvider.ts`
  - Review & problems: `src/reviewLensProvider.ts`, `src/reviewCodeActionProvider.ts`, `src/problemsProvider.ts`
  - Diagram editor host: `src/diagrammPanel.ts` (talks to the Diagram webview container)
  - Document view: `src/documentViewProvider.ts`, `src/documentViewModel.ts`, `src/documentViewLanguage.ts`
  - Filter notebook: `src/filterNotebook.ts` (feeds the Filter-results renderer container)
  - Reports & export: `src/statusReport.ts`, `src/pdfExport.ts`
  - Progress & timing: `src/progress.ts`, `src/timing.ts`

  Diagram arrows: components → Server client (all server calls go through it), Server client → Requirements server container. Merge or rename a group only if reading the code shows the grouping is wrong; every file must still appear exactly once
- [X] T006 [US1] Write `## 5. Level 3 – Components: Requirements server` in `doc/architecture.md`: Mermaid flowchart inside the Requirements server boundary + table with these components, each listing all its files (FR-004, FR-005, FR-007):
  - Entry point & app setup: `server/src/doorstop_server/__main__.py`, `server/src/doorstop_server/cli.py`, `server/src/doorstop_server/app.py`, `server/src/doorstop_server/config.py`, `server/src/doorstop_server/deps.py`
  - Request lock & cancellation: `server/src/doorstop_server/lock.py`
  - HTTP routers: `server/src/doorstop_server/routers/health.py`, `server/src/doorstop_server/routers/tree.py`, `server/src/doorstop_server/routers/items.py`, `server/src/doorstop_server/routers/documents.py`, `server/src/doorstop_server/routers/review.py`, `server/src/doorstop_server/routers/validation.py`, `server/src/doorstop_server/routers/filters.py`
  - Doorstop adapter: `server/src/doorstop_server/doorstop_tree.py`, `server/src/doorstop_server/validation_rules.py`, `server/src/doorstop_server/publish.py`
  - API schemas & errors: `server/src/doorstop_server/schemas.py`, `server/src/doorstop_server/errors.py`
  - Timing: `server/src/doorstop_server/timing.py`

  Diagram arrows: Extension host → routers; routers → lock, adapter, schemas/errors; adapter → Doorstop library → Requirements repository
- [X] T007 [US1] Run the coverage script from [quickstart.md](quickstart.md) against `doc/architecture.md` in Git Bash and fix every `missing:` or `stale:` line (FR-007, FR-008)

**Checkpoint**: US1 deliverable: C4 levels 1–3 complete and every source module mapped.

---

## Phase 4: User Story 2 - Keep the document current with every spec (Priority: P2)

**Goal**: Anyone can see whether the document is current and knows how to update it.

**Independent Test**: Follow section 9 for a hypothetical spec 034 that adds `src/foo.ts`; the steps say where the file goes and that the marker becomes `034`.

- [X] T008 [US2] Verify the marker lines from T001 at the top of `doc/architecture.md`: `**Up to date with spec:** 033` and `**Pending specs:** 032`. If spec 032 (`specs/032-background-validation/`) has been implemented by the time this task runs, fold its changes into the views and remove it from `Pending specs` (FR-009)
- [X] T009 [US2] Write `## 9. How to update this document` in `doc/architecture.md` with the five numbered steps from "Update steps" in [data-model.md](data-model.md), plus: the coverage script from [quickstart.md](quickstart.md) inlined as an optional self-check, and the rule from the spec's edge cases for parallel specs (keep the higher number on a merge conflict after checking both specs are covered) (FR-012)

**Checkpoint**: US2 deliverable: the document is self-maintaining by its own instructions.

---

## Phase 5: User Story 3 - See key runtime flows and decisions (Priority: P3)

**Goal**: A reader understands how a change reaches disk and why the design looks the way it does.

**Independent Test**: Follow the "Server is the single source of truth" decision to Principle I in `.specify/memory/constitution.md`.

- [X] T010 [US3] Write `## 6. Dynamic view – change a requirement` in `doc/architecture.md`: Mermaid `sequenceDiagram` + numbered step table for "Add item from the tree view": Developer → tree command (`src/doorstopCommands.ts`) → Server client (`src/doorstopServer.ts`, HTTP request) → items router (`server/src/doorstop_server/routers/items.py`) → request lock (`server/src/doorstop_server/lock.py`) → Doorstop adapter / Doorstop library → file written to the requirements repository → response → extension refreshes tree and index (`src/requirementTree.ts`, `src/doorstopIndex.ts`). Read those files first and use the real command, endpoint, and method names; adjust the steps if the code differs (FR-010)
- [X] T011 [US3] Write `## 7. Cross-cutting concepts` in `doc/architecture.md`: one short paragraph each on (a) server start-up, interpreter selection, and health check (`src/doorstopServer.ts`, `src/pythonEnvironment.ts`, `server/src/doorstop_server/routers/health.py`); (b) one request at a time and cancellation (`server/src/doorstop_server/lock.py`, constitution Principle I); (c) progress toasts after one second (`src/progress.ts`, Principle VII); (d) structured error responses (`server/src/doorstop_server/errors.py`, Principle III); (e) diagram file persistence with workspace-relative paths (`src/diagrammPanel.ts`, Additional Constraints)
- [X] T012 [US3] Write `## 8. Key decisions` in `doc/architecture.md` as a table (decision, reason, source) with at least: server is the single source of truth (Principle I); use Doorstop's API, never reimplement it (Principle II); local HTTP server instead of a Doorstop CLI per call (spec 001); one request at a time with limited cancellation (Principle I, spec 032); graph rendering via vis-network (Additional Constraints, specs 007/008); no dependency without justification (Principle IV). Check each spec number against the directory names in `specs/` before citing it (FR-011)

**Checkpoint**: all sections filled.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T013 Walk through every row of the review table in [quickstart.md](quickstart.md) for `doc/architecture.md` and fix anything that fails (FR-001 – FR-012)
- [ ] T014 Check that every Mermaid block in `doc/architecture.md` renders (Mermaid-enabled VS Code preview, or the GitHub file view after pushing): no syntax errors, no overlapping labels in levels 1–3 (SC-004)
- [X] T015 Count words in `doc/architecture.md` (`wc -w doc/architecture.md`); if above ~4,000 words (≈20 min reading, SC-005), shorten sections 7 and 8 first
- [X] T016 Note for the PR description: "Documentation-only feature; deliberately no automated test, deviating from constitution Principles VI and VIII (user decision during specify)" (Governance)

---

## Dependencies & Execution Order

- T001 → T002 → all user-story tasks (they fill headings created by T001).
- US1 (T003–T007) is the MVP and has no dependency on US2/US3.
- US2 (T008–T009) depends only on T001; T009 references the quickstart script used in T007 but does not need T007 done.
- US3 (T010–T012) depends only on T001; component names used in T010 should match T005/T006, so run US1 first when possible.
- Polish (T013–T016) after all stories.

## Parallel Opportunities

None inside this feature: every task writes `doc/architecture.md`. The stories are independent in content, so they can be done in separate sittings in any order after Phase 2.

## Implementation Strategy

1. **MVP**: T001–T007. Gives the full C4 structure (levels 1–3) and complete module coverage; stop and review here.
2. **Increment 2**: T008–T009 makes the document maintainable with each spec.
3. **Increment 3**: T010–T012 adds the runtime flow and decisions.
4. **Finish**: T013–T016.
