# Implementation Plan: Toggle Document Skip

**Branch**: `031-toggle-document-skip` | **Date**: 2026-10-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/031-toggle-document-skip/spec.md`

## Summary

Doorstop skips every document whose folder holds a `.doorstop.skip` file (`Document.SKIP`, honoured by `doorstop.build`). Because `build` drops such documents, a disabled document disappears from `GET /tree`, validation and every mutation endpoint, which is exactly the wanted speed-up, but it also means the tree view can no longer show it or offer "enable". Plan:

1. **Server: list skipped documents.** `GET /tree` gains `skippedDocuments: [{prefix, markerPath}]`, found by a pruned walk for folders containing `.doorstop.skip`, each loaded with Doorstop's own `Document` class (prefix and validity come from Doorstop).
2. **Server: toggle endpoint.** `POST /documents/skip` with `{markerPath, skip}` creates or removes `<document folder>/.doorstop.skip` (name from `Document.SKIP`). Idempotent; an unknown document folder is a typed 404 (Principle III). Runs on the serialized write tree (Principle I). **Cascade (FR-009):** `skip: true` also writes the marker into every descendant document, found by walking `tree` children by `parent` prefix (Doorstop's own `Document.parent`), all in the one request; `skip: false` touches only the clicked document and returns a typed 409 `PARENT_DISABLED` while its parent is disabled. The response lists every affected `markerPath` (`affected`) so the client needs no second call.
3. **Extension: render disabled documents.** `DoorstopTreeProvider` appends greyed, non-expandable nodes (`contextValue = doorstop.root.skipped`) for `skippedDocuments`. They are NOT `isDoorstopRoot`, so document pickers (`choosePrefix`, `chooseParentPrefix`, Add Item) never offer them (FR-006).
4. **Extension: the button.** Commands `doorstop.skipDocument` (on `doorstop.root`) and `doorstop.enableDocument` (on `doorstop.root.skipped`) as `view/item/context` inline entries with `view == doorstop.treeView` only, hidden from the command palette (`commandPalette` `when: false`), so the tree view is the only place (FR-001).
5. **Refresh.** The commands run through the existing `run()` helper (tree, commands and problems views refresh, so diagnostics of a disabled document disappear: FR-005). External marker changes: a file-system watcher on `**/.doorstop.skip` triggers the same refresh (FR-007).

## Technical Context

**Language/Version**: TypeScript (VS Code extension) and Python 3 (FastAPI server)

**Primary Dependencies**: VS Code API, FastAPI, Doorstop; no new dependencies

**Storage**: the `.doorstop.skip` file per document folder (no other state, FR-010)

**Testing**: `server/tests` (pytest, real temp Doorstop project) and `src/test` (vscode-test)

**Target Platform**: VS Code desktop, Windows/Linux CI

**Project Type**: VS Code extension + local Python server

**Performance Goals**: toggle visible < 1 s (SC-001); external change reflected < 2 s (SC-004)

**Constraints**: the skipped-document scan reuses the excluded-folder pruning of `fingerprint`, one walk per `GET /tree`

**Scale/Scope**: about 8 source files touched

## Constitution Check

| Principle | Status |
|-----------|--------|
| I. Server single source of truth | Pass: marker creation/removal and skipped-document discovery are server endpoints |
| II. No reinvention of Doorstop | Pass: uses `Document.SKIP`, `Document(...)`; build-time skipping is Doorstop's own |
| III. Error handling | Pass: typed 404, structured OS errors, extension shows an error and refreshes to on-disk truth (FR-008) |
| IV. No new dependencies | Pass |
| V. Typed, linted, tested | Planned |
| VI/VIII. CI test per FR with trace comments | Planned: pytest for FR-002/003/005/009; vscode-test for FR-001/004/006/007 |
| VII. Long-running visible | Pass: toggle runs through `run()` / `withDelayedProgress` |

Re-check after design: no violations.

## Project Structure

### Documentation (this feature)

```text
specs/031-toggle-document-skip/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/skip-api.md
└── tasks.md
```

### Source Code (repository root)

```text
server/src/doorstop_server/
├── doorstop_tree.py     # find_skipped_documents(root)
├── schemas.py           # SkippedDocument, SkipDocumentRequest/Response, TreeResponse.skippedDocuments
└── routers/
    ├── tree.py          # fill skippedDocuments
    └── documents.py     # POST /documents/skip
server/tests/test_document_skip.py

src/
├── doorstopTypes.ts     # SkippedDocument
├── requirementTree.ts   # disabled nodes
├── doorstopCommands.ts  # skip / enable commands
└── extension.ts         # .doorstop.skip watcher
package.json             # commands, inline menus, commandPalette hide
src/test/documentSkip.test.ts
```

**Structure Decision**: extend the existing server/extension layout; only the two test files are new.

## Complexity Tracking

No violations.
