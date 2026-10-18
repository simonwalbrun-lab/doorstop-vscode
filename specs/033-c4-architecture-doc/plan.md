# Implementation Plan: C4 Architecture Document

**Branch**: `033-c4-architecture-doc` | **Date**: 2026-10-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/033-c4-architecture-doc/spec.md`

## Summary

Write one Markdown file, `doc/architecture.md`, that describes the repository in C4 style:
System Context, Container, and Component views (extension host and server), one dynamic
view (UI action → extension → server → disk), key decisions linked to constitution
principles, and an update guide. Diagrams are Mermaid, each followed by a table with the
same elements. A spec marker near the top records the last spec the document was updated
for. The overview states that it supersedes the outdated `doc/arc42/` notes, which stay
untouched. No code and no CI check (user decision during specify).

## Technical Context

**Language/Version**: Markdown (GitHub-flavored) with Mermaid diagram blocks

**Primary Dependencies**: none added. Mermaid rendering is provided by GitHub and is already used in `doc/arc42/`

**Storage**: one file, `doc/architecture.md`

**Testing**: none automated (user decision); verified by review using [quickstart.md](quickstart.md)

**Target Platform**: GitHub repository page; VS Code Markdown preview (Mermaid needs the preview extension the user already uses for `doc/arc42`)

**Project Type**: documentation for an existing VS Code extension (TypeScript) + local Python server (FastAPI + Doorstop)

**Performance Goals**: readable end to end in under 20 minutes (SC-005)

**Constraints**: every non-test source module of `src/` and `server/src/doorstop_server/` mentioned by path (FR-007); no stale paths (FR-008)

**Scale/Scope**: 25 extension modules in `src/*.ts`, 2 webview bundles (`src/webview/diagram`, `src/webview/filterResults`), 11 server modules + 7 routers

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Note |
|-----------|--------|------|
| I. Server is single source of truth | N/A | No code. The document describes this principle (key decision). |
| II. No reinvention of Doorstop | N/A | No code. |
| III. Error handling | N/A | No code. |
| IV. No new dependencies | PASS | Mermaid is rendered by GitHub; nothing installed. |
| V. Typed, linted, tested | N/A | No TypeScript or Python changes. |
| VI. CI-runnable test per feature | **DEVIATION** | User decision: no CI check. See Complexity Tracking. |
| VII. Long-running ops visible | N/A | No operations. |
| VIII. Test per FR with trace comment | **DEVIATION** | Same as VI. FRs verified by review via quickstart.md. |
| Workflow: `npm run compile` / pytest | PASS | Unaffected; no source changes. |

Gate result: PASS with two explicitly justified deviations, which the PR must name (Governance).

Post-design re-check: unchanged. The design adds one Markdown file, no code.

## Project Structure

### Documentation (this feature)

```text
specs/033-c4-architecture-doc/
├── plan.md              # This file
├── research.md          # Phase 0: notation, location, marker decisions
├── data-model.md        # Phase 1: document outline + C4 element inventory
├── quickstart.md        # Phase 1: review checklist mapping each FR to a check
└── tasks.md             # Phase 2 (/speckit-tasks)
```

No `contracts/`: the feature exposes no interface. The document's fixed outline in
[data-model.md](data-model.md) is what future spec updates rely on.

### Source Code (repository root)

```text
doc/
└── architecture.md                          # NEW: the C4 architecture document
```

Read-only inputs used to write the document:

```text
src/*.ts                         # extension host components
src/webview/diagram/             # diagram webview
src/webview/filterResults/       # notebook output renderer
server/src/doorstop_server/      # server modules + routers/
package.json                     # contributed views, commands, custom editor, notebook renderer
.specify/memory/constitution.md  # source for key decisions
```

**Structure Decision**: a single file under `doc/`, next to the existing architecture notes.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| No CI test (Principle VI) | User decided against a CI check for the document; the feature contains no code. | A path/marker check in CI would turn every in-progress spec branch red until the document is updated; the user prefers a manual step governed by the constitution. |
| No per-FR test (Principle VIII) | Same; FRs describe document content, verified by the review list in quickstart.md. | Structure tests (headings present) would be a CI check, which the user declined. |
