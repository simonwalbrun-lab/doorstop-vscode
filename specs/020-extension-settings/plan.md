# Implementation Plan: Extension Settings

**Branch**: `019-document-view` (no feature branch created yet) | **Date**: 2026-10-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/020-extension-settings/spec.md`

## Summary

Add a "Doorstop" settings section with three groups: one checkbox per problem
kind (filters the validation result before it reaches the Problems panel and
the document view), new-document defaults (item format, separator from a
fixed list, digits) sent on the existing `POST /documents`, and a publish
template name forwarded to Doorstop's own `publish(template=...)`. The only
server change is one optional field on the publish request.

## Technical Context

**Language/Version**: TypeScript (VS Code Extension API, engine ^1.75); Python 3 (FastAPI server)

**Primary Dependencies**: VS Code Extension API, FastAPI, doorstop 3.2 — no new dependencies

**Storage**: VS Code configuration (user/workspace `settings.json`)

**Testing**: `server/tests` (pytest, real temp Doorstop project); `src/test` (vscode-test, `regressionFixture.test.ts`)

**Target Platform**: VS Code desktop (Windows/macOS/Linux)

**Project Type**: VS Code extension + local Python server

**Performance Goals**: Problems panel reflects a problem-kind toggle within 2 s (SC-002) — one existing refresh pass

**Constraints**: All defaults reproduce today's behaviour (FR-013)

**Scale/Scope**: 4 settings (1 problem kinds (18 sub issues), 3 new-document, 1 publish)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Server is single source of truth | ✅ | Document creation and publish still go through the server; the extension only filters an already-validated result for display. |
| II. No reinvention | ✅ | Separator/digits/format and template are passed to Doorstop's own `create_document` / `publish`. Filtering reported issues re-implements no check. |
| III. Error handling | ✅ | Missing template → existing structured `DOORSTOP_ERROR`; extension message names template + setting (FR-011). |
| IV. No new dependencies | ✅ | None added. |
| V. Typed, linted, tested | ✅ | Publish change covered by `server/tests`; `npm run compile` gates TS. |
| VI. CI-runnable test | ✅ | New pytest for publish template; new cases in `regressionFixture.test.ts` for createDoc settings and problem filter. |

Post-design re-check: unchanged, all pass.

## Project Structure

### Documentation (this feature)

```text
specs/020-extension-settings/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/settings-and-api.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
package.json                              # contributes.configuration (3 sections, 22 keys)
src/
├── problemsProvider.ts                   # filter issues by doorstop.problems.* in refreshNow()
├── extension.ts                          # onDidChangeConfiguration('doorstop.problems') → refreshNow()
├── doorstopCommands.ts                   # createDoc sends newDocument.*; publish sends template + error hint
└── test/regressionFixture.test.ts        # createDoc-with-settings + problem-filter cases
server/
├── src/doorstop_server/schemas.py        # PublishRequest.template: Optional[str]
├── src/doorstop_server/routers/documents.py  # publish(..., template=body.template)
└── tests/test_documents.py               # publish with missing template → 400 DOORSTOP_ERROR
```

**Structure Decision**: Existing extension + server layout; no new files
outside `specs/`.

## Complexity Tracking

None — no constitution violations.
