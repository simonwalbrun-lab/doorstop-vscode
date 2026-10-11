# Implementation Plan: Document Utilities (Reorder, Import, Export, Publish)

**Branch**: `N/A (retroactive documentation)` | **Date**: 2026-10-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-document-utilities/spec.md`

## Summary

Spec 004 is already implemented. This plan describes the existing design and
scopes the remaining work to Constitution v1.4.0 Principle VIII: every FR
(FR-001..FR-008) needs a CI-run test carrying a `Spec 004 FR-NNN` trace comment.
Behaviour exists for all eight FRs; only one test (the HTML publish test in
`server/tests/test_documents.py`) carries a `Spec 004 FR-008` tag. Remaining
work is tests and trace comments only. No behaviour change.

## Technical Context

**Language/Version**: TypeScript (extension, `src/`), Python 3 / FastAPI (`server/src/doorstop_server/`)

**Primary Dependencies**: `doorstop` library (`doorstop.core.exporter`, `importer`, `publisher`, `Document.reorder`); VS Code API. No new dependencies.

**Storage**: Doorstop files on disk; the manual-reorder scratch `index.yml` sits next to the document's `.doorstop.yml` (created/removed by Doorstop).

**Testing**: `pytest server/tests` (CI job, `.github/workflows/ci.yml`) and `npm test` under xvfb (`src/test/*.test.ts`, incl. `regressionFixture.test.ts`, which boots a real server).

**Target Platform**: VS Code desktop + local Doorstop server.

**Project Type**: VS Code extension + Python server.

**Performance Goals**: N/A.

**Constraints**: Server is the single source of truth; the extension never touches Doorstop files directly (Principle I).

**Scale/Scope**: 4 commands (`doorstop.reorder/import/export/publish`), 6 server routes.

## Existing Implementation

| Concern | Location |
| --- | --- |
| Reorder auto/manual, apply/discard index (FR-001..004) | `POST /documents/{prefix}/reorder`, `POST\|DELETE /documents/{prefix}/reorder/index` in `server/src/doorstop_server/routers/documents.py`; `NO_REORDER_INDEX` 409 error. Command `doorstop.reorder` in `src/doorstopCommands.ts` (mode pick, existing-index Apply/Keep/Discard pick, saves a dirty index before apply). |
| Import (FR-005) | `POST /documents/{prefix}/import` (`importer.import_file`, format from file suffix); command `doorstop.import` (open dialog filtered to yaml/yml/csv/tsv/xlsx). |
| Export (FR-006, FR-008) | `POST /documents/{prefix}/export`; command `doorstop.export` (format pick, save dialog, `reportWrittenPath`). |
| Publish (FR-007, FR-008) | `POST /documents/{prefix}/publish` (markdown/html/latex); command `doorstop.publish`; `_resolve_written_path` resolves the real HTML location (`documents/` nesting). Specs 020/024 extend publish (template, all modes) and are out of scope here. |

## Constitution Check

| Principle | Assessment |
| --- | --- |
| I. Server single source of truth | PASS - all four operations go through server routes. |
| II. No reinvention of Doorstop | PASS - delegates to Doorstop `reorder`, `importer`, `exporter`, `publisher`. |
| III. Error handling | PASS - missing index returns structured 409 `NO_REORDER_INDEX`; Doorstop errors map to `DOORSTOP_ERROR`; commands wrap calls in `run()`. |
| IV. No new dependencies | PASS. |
| V. Typed, linted, tested | PASS for existing code. |
| VIII. Every FR has a traceable automated test | **GAP** - see matrix. Resolved by the open tasks in `tasks.md`; not a design violation. |

Post-design re-check: unchanged.

## Test Coverage Matrix

| FR | Existing CI test | Trace tag today | Gap |
| --- | --- | --- | --- |
| FR-001 | `test_reorder_auto` (server) | none | tag; add command-level auto test |
| FR-002 | `test_reorder_index_lifecycle` (server); "Manual reorder: an edited index is applied..." (regressionFixture) | none | tag both |
| FR-003 | `test_reorder_index_lifecycle` (ensure twice keeps index), `test_reorder_index_discard`; regressionFixture covers only the Apply choice | none | tag; add command test for Discard and Keep-editing choices |
| FR-004 | `test_reorder_manual_without_index_returns_409` | none | tag |
| FR-005 | `test_export_then_import_round_trip` (YAML only) | none | tag; add csv/tsv/xlsx import test |
| FR-006 | same round trip (YAML only); "Export reports the path..." (YAML) | none | tag; add csv/tsv/xlsx export test |
| FR-007 | `test_publish_markdown_writes_to_requested_path`, `test_publish_html_nests_under_documents_subfolder` | none | tag; add LaTeX publish test |
| FR-008 | `test_publish_html_nests_under_documents_subfolder` (tagged); regressionFixture "Export reports..." and "Publish reports the real HTML location..." | partial (`004 FR-008` prose only) | normalise tag on the extension tests |

## Project Structure

```text
specs/004-document-utilities/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/api.md
└── tasks.md
```

Source (existing; touched only by tests/comments):

```text
server/tests/test_documents.py       # server route tests
src/test/regressionFixture.test.ts   # command-level tests against the fixture server
```

**Structure Decision**: Existing layout; no new source files.

## Complexity Tracking

None - no violations.
