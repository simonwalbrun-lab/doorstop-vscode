# Research: C4 Architecture Document

## R1. Diagram notation

- **Decision**: Mermaid `flowchart` diagrams styled as C4 (labels carry `[Person]`, `[Container: tech]`, `[Component: tech]`; `subgraph` as system/container boundary). Mermaid `sequenceDiagram` for the dynamic view.
- **Rationale**: renders on GitHub and in the Mermaid-enabled VS Code preview already used for `doc/arc42`. C4 is notation-independent; element types in labels plus a legend satisfy it. Flowchart layout is stable, whereas Mermaid's native `C4Context`/`C4Container` diagrams are still marked experimental and often overlap labels.
- **Alternatives considered**: Mermaid native C4 diagrams (experimental, poor auto-layout); PlantUML + C4-PlantUML (needs a renderer or server, not shown on GitHub); Structurizr DSL (extra tool, violates Principle IV spirit); images (not diffable).

## R2. Location and form

- **Decision**: `doc/architecture.md`, one file.
- **Rationale**: `doc/` already holds the architecture notes; one file is easy to find and to update with each spec (FR-001).
- **Alternatives considered**: one file per C4 level (more places to keep in sync); extending `doc/arc42/` (that material is aspirational and marked outdated).

## R3. Spec marker

- **Decision**: a line directly under the title: `**Up to date with spec:** 033`, followed by a line `**Pending specs:**` listing specs that are specified but not yet implemented (currently `032`).
- **Rationale**: one fixed place, readable by people and by plain text search (FR-009). Spec 032 is specified but not implemented; recording it as pending keeps the marker honest when 032 is implemented after 033.
- **Alternatives considered**: a change-log table per spec (useful, but longer and harder to scan); front matter (not shown on GitHub).

## R4. Level of detail per component

- **Decision**: Component views group the 25 extension modules and 18 server modules into a small number of components (e.g. "Server client & lifecycle", "Tree view", "Editor language features", "Diagram editor", "Document view", "Problems", "Publish & export"). Each component row lists all its source paths.
- **Rationale**: keeps diagrams readable (SC-005) while still mentioning every module by path (FR-007).
- **Alternatives considered**: one box per file (≈45 boxes, unreadable); folder-level only (fails FR-007).

## R5. Treatment of webviews and external processes

- **Decision**: containers are: Extension host (TypeScript, Node), Diagram webview (`src/webview/diagram`, vis-network), Filter-results notebook renderer (`src/webview/filterResults`), Requirements server (Python, FastAPI + Doorstop, spawned child process, HTTP/JSON on localhost), Requirements repository (files on disk). External systems: VS Code workbench, Python environment / pip, Git (used by the status report), PDF export tooling (Node script spawned by `pdfExport.ts`).
- **Rationale**: each is separately run or delivered, which is the C4 definition of a container.
- **Alternatives considered**: treating webviews as components of the extension host (hides the message boundary, which is where several past bugs lived).

## R6. Existing arc42 notes

- **Decision**: leave all `doc/arc42` files untouched. The new document's overview states that it is the current architecture description and supersedes `doc/arc42/`, and links the quality goals in `2000_introduction_and_goals.md`.
- **Rationale**: covers the spec's edge case (no competing source of truth) from inside the new document, without editing the user's material.
- **Alternatives considered**: a pointer line in `01_arc42-in-a-nutshell-help.md` (dropped from the spec); deleting the arc42 notes.
