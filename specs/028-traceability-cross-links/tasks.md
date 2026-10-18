---

description: "Task list for 028 Publish Without Child Links"
---

# Tasks: Publish Without Child Links

**Input**: [plan.md](plan.md), [spec.md](spec.md)

Tests carry a trace comment (`# Spec 028 FR-NNN` / `// Spec 028 FR-NNN`).

## Phase 1: User Story 1 - Publish without child links (P1)

- [x] T001 [US1] Add `_child_links(enabled)` to `server/src/doorstop_server/routers/documents.py` and wrap both publish calls in it
- [x] T002 [US1] Keep `childLinks: bool = True` in `PublishRequest` in `server/src/doorstop_server/schemas.py`
- [x] T003 [US1] Send `{ childLinks }` with every publish request in `src/doorstopCommands.ts`; keep the `doorstop.publish.noChildLinks` setting in `package.json`
- [x] T004 [US1] Test the setting and its restore in `server/tests/test_publish.py` and `src/test/regressionFixture.test.ts` (FR-004)

## Phase 2: User Story 2 - Publishing matches Doorstop (P2)

- [x] T005 [US2] Remove the run-time overrides and the CI wrapper module from `server/src/doorstop_server/` and their tests (FR-001, FR-005)
- [x] T006 [US2] Ignore a leftover `traceability` request field; test in `server/tests/test_publish.py` (FR-003)
- [x] T007 [US2] Publish with plain `doorstop publish` in `src/test/pdf/exportPdf.test.mjs` and `.github/workflows/ci.yml` (FR-002, FR-005)

## Phase 3: User Story 3 - Documentation (P3)

- [x] T008 [US3] Update `README.md`, `CHANGELOG.md`, `doc/publish-pdf.md` and `doc/architecture.md` (FR-006)
