# Implementation Plan: Document View for Sections and Filter Results

**Branch**: `030-document-view-scopes` | **Date**: 2026-10-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/030-document-view-scopes/spec.md`

## Summary

Spec 019's document view is keyed by document prefix: one state, one URI
(`doorstop-document:/SYS (document)`), one `DocumentNode` snapshot per view.
This feature generalises the key to a **view scope** — `document` (today),
`section` (a tree node plus its descendants) or `filter` (a snapshot list of
UIDs from a notebook cell) — and keeps everything downstream (render, parse,
`planSave`, CodeLens, diagnostics, watcher, disk-change prompts) unchanged by
feeding it a **scoped snapshot**: a `DocumentNode`-shaped object whose `items`
are only the scope's items. Items may be open in any number of views (spec
clarification), so no registry of "claimed" items is needed; the existing
disk-change handling reconciles views that share an item.

Entry points: a new inline/context action on tree nodes that have children
(`doorstop.openSectionAsDocument`), and an "Open as document" button drawn by
the filter-results notebook renderer (message to the extension, which opens a
`filter` scope from the row UIDs). Both call the same `openDocumentView(scope)`.

The field setting `doorstop.documentView.fields` (array of header field names,
default `[]`) adds editable extended-attribute fields. The server returns the
requested fields on `GET /tree?fields=…` and accepts them on `PATCH
/items/{uid}`; the view renders them as a managed fenced block under each
heading. Protected fields are rejected server-side.

## Technical Context

**Language/Version**: TypeScript (existing toolchain, VS Code API ^1.75.0);
Python ≥ 3.9 (FastAPI + `doorstop` 3.2, `Item.set` verified present).

**Primary Dependencies**: none new (constitution IV).

**Storage**: Doorstop item files via the server; no extension-side persistence.
View state is in memory, keyed by scope key.

**Testing**: `src/test` (vscode-test: pure model tests in
`documentViewModel.test.ts`, new `documentViewScopes.test.ts` for scope/provider
behaviour, `packageMenus.test.ts` for menu contributions, `filterNotebook.test.ts`
for the renderer message); `server/tests` (pytest, real Doorstop project) for
`fields` on `/tree` and `PATCH /items`.

**Target Platform**: VS Code desktop + remote, as the existing extension.

**Project Type**: VS Code extension + Python server (existing two-part layout).

**Performance Goals**: Opening a section/filter view of ≤ 500 items feels
immediate; no extra full-tree requests beyond the one `/tree` per
load/regenerate that 019 already makes.

**Constraints**: Opening (≥ 1 s) goes through `withDelayedProgress` (VII).
Item hierarchy/section membership comes from the same outline-depth logic the
explorer already uses (`attachHierarchy`), not a second implementation.

**Scale/Scope**: Documents of hundreds to low thousands of items; filter
results up to the document total.

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 — still passed.*

| Principle | Status |
|---|---|
| I. Server is source of truth | PASS — field values read/written only through `/tree` and `PATCH /items`; section membership reuses the explorer's hierarchy built from `/tree`; filter matching stays in `POST /filter`. |
| II. No reinvention | PASS — fields written with Doorstop's `Item.set`/`save`; protected-field list mirrors Doorstop's own attributes. |
| III. Error handling | PASS — empty filter result, vanished UIDs, unknown/protected field entries, failed field writes (reported with the other failed writes) all have defined user-visible outcomes (contracts). |
| IV. No new dependencies | PASS. |
| V. Typed/linted/tested | PASS — `check-types`, `lint`, pytest for the server change. |
| VI. CI-runnable test | PASS — new suites run in existing `server-tests` / `extension-integration-tests` jobs. |
| VII. Long-running visible | PASS — scope load uses `withDelayedProgress` like 019. |
| VIII. Test per FR, trace comments | PASS (planned) — every FR-001…FR-017 in spec.md gets a test with a `// spec 030 FR-0xx` trace comment (FR-006…008 were removed by clarification; those IDs are intentionally unused). |

No violations; Complexity Tracking not needed.

## Project Structure

### Documentation (this feature)

```text
specs/030-document-view-scopes/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── view-scopes.md       # scope keys, URIs, titles, commands, menus, renderer message
│   ├── fields-block.md      # rendering/parsing of the editable-fields block + setting
│   └── server-api.md        # /tree?fields, PATCH /items fields, error codes
├── checklists/requirements.md
└── tasks.md                 # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── documentViewModel.ts        # ViewScope helpers (key/URI/title), fields block render+parse, planSave field diff
├── documentViewProvider.ts     # states keyed by scope key; loadSnapshot(scope); openDocumentView(scope); commands; multi-folder watcher; creation uses neighbour's document
├── requirementTree.ts          # descendantUids(item) from the existing hierarchy maps
├── filterNotebook.ts           # handle 'openDocument' renderer message
├── doorstopTypes.ts            # ItemNode.fields?, ViewScope-related types
├── webview/filterResults/renderer.js   # "Open as document" button
└── test/                       # documentViewModel, documentViewScopes (new), packageMenus, filterNotebook
server/src/doorstop_server/
├── schemas.py                  # ItemNode.fields, UpdateItemRequest.fields
├── doorstop_tree.py / routers/tree.py   # ?fields= query
└── routers/items.py            # apply fields via Item.set; PROTECTED_FIELD 422
server/tests/                   # test_tree_fields, test_items_fields
package.json                    # command, menus (when: tree node with children), setting
```

**Structure Decision**: Extend the existing single extension + server layout;
no new modules besides one test file. Scope logic lives in `documentViewModel.ts`
(pure) and `documentViewProvider.ts` (wiring), keeping the model free of VS Code
state as 019 does.

## Complexity Tracking

None.
