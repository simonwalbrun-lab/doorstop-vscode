# Implementation Plan: Requirement Item Lifecycle Commands (Add, Review, Clear, Link)

**Branch**: N/A (retroactive; documents existing code) | **Date**: 2026-10-10 | **Spec**: [spec.md](spec.md)

## Summary

Four sidebar/palette commands (`doorstop.add`, `doorstop.link`, `doorstop.review`,
`doorstop.clear`) in `src/doorstopCommands.ts` resolve their target from tree
selection, active editor, or a prompt, then call the Python server
(`POST /documents/{prefix}/items`, `POST /items/{uid}/links`, `POST /review`,
`POST /clear`), which delegate to Doorstop's own API. This plan describes the
code as it exists; remaining work is test coverage and trace comments only
(Constitution v1.4.0, Principle VIII).

## Technical Context

**Language/Version**: TypeScript (VS Code API); Python 3 (FastAPI)
**Primary Dependencies**: VS Code API, FastAPI, doorstop 3.x - nothing new
**Storage**: Doorstop item files on disk (via server)
**Testing**: `server/tests` (pytest, real temp project; CI job `pytest server/tests`); `src/test/regressionFixture.test.ts` (vscode-test, CI `xvfb-run npm test`)
**Project Type**: VS Code extension + local Python server
**Constraints**: All mutation goes through the server (serialized by lock); `run()` wrapper shows progress, guards duplicate runs, refreshes tree, surfaces errors as `Doorstop command failed: ...`

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Server single source of truth | PASS | Extension only resolves targets/prompts; level for explicit add is the only client computation (`nextLevel`), server validates. |
| II. No reinvention | PASS | Server calls Doorstop `add_item`, `link`, `review`, `clear`. |
| III. Error handling | PASS | Unknown targets/parents/self-link -> structured `DOORSTOP_ERROR` (400) / 422; extension shows error toast. |
| IV. No new dependencies | PASS | |
| V. Typed, linted, tested | PASS | |
| VI. CI-runnable test | PASS | pytest + regressionFixture cover the feature. |
| VIII. Test per FR with trace comment | GAP | Existing tests lack `Spec 003 FR-NNN` comments; FR-001 (scoped level), FR-002, FR-003 resolution order, FR-006 document/all scope, FR-007 prompts have no test. See tasks.md. |

Post-design re-check: unchanged; the only gap is VIII, closed by open tasks.

## Project Structure

```text
specs/003-item-lifecycle-commands/
  spec.md plan.md research.md data-model.md quickstart.md tasks.md
  contracts/commands-and-api.md
src/doorstopCommands.ts          # add/review/clear/link handlers, nextLevel, reviewClearTarget
server/src/doorstop_server/routers/{documents,items,review}.py
server/tests/{test_documents,test_items,test_review}.py
src/test/regressionFixture.test.ts
```

## FR -> implementation -> existing test

| FR | Implementation | Existing test |
|----|----------------|---------------|
| FR-001 | `add` handler, `nextLevel()`, `POST /documents/{p}/items` | server: add (no level / explicit level); none for scoped next-level in extension |
| FR-002 | `showTextDocument(created.path)` | none |
| FR-003 | `link` handler (tree item -> parent, `childUid` arg / `editorUid()` / input box -> child) | server: link creates; none for resolution order |
| FR-004 | server rejects self-link (400) | `test_self_link_is_rejected` |
| FR-005 | `review` handler, `POST /review` | server: item/document/all; ext: review REQ-001 (item) |
| FR-006 | `clear` handler, `POST /clear`, `parents` filter | server: item scope + parents filter; ext: clear REQ-007 (item); none for document/all |
| FR-007 | `chooseDocumentOrAll`, `reviewClearTarget` | server: missing target 422; none for the extension prompt |
| FR-008 | server 400 on unknown target/parent | review unknown target, clear unknown parent, link unknown parent |
