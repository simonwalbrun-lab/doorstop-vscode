# Implementation Plan: Document View

**Branch**: `019-document-view` | **Date**: 2026-09-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/019-document-view/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Serve one Doorstop document as a single editable markdown text through a
`FileSystemProvider` on the custom scheme `doorstop-document`
(`doorstop-document:/SYS (document)`, language mode `markdown`). The text is
generated from `GET /tree` — one block per active item, in Doorstop level
order — with static, read-only separator comments
(`<!-- SYS-0006 · 1.1 · item separator. keep this line -->`) as the only
block delimiters. Saving goes through the provider's `writeFile`: the text is
split at the separators, every block is compared against the server's
current view of the item, and only changed items are written — through
**new server endpoints** (`PATCH /items/{uid}` for header/text,
`DELETE /items/{uid}`, and `after`/`header`/`text` on the existing
`POST /documents/{prefix}/items`) so no Doorstop logic is duplicated on the
client. Deletions, header-only changes and refused saves are handled with
dialogs / `FileSystemError` before anything is written. A language layer for
the scheme provides the per-block action CodeLens, dimmed separators,
alternating block tint (theme colour `doorstop.documentView.altBlockBackground`),
structural diagnostics with "Restore block structure" quick fixes, a
projection of Doorstop's validation problems onto the separator lines with
the existing review/clear quick fixes, and immediate revert of any edit
inside a separator line. After a successful save, and whenever an item file
of the document changes on disk, the view is regenerated (or, if dirty, the
user is offered Reload / Keep my edits). The existing hover, definition,
reference and call-hierarchy providers accept the new scheme.

## Technical Context

**Language/Version**: TypeScript (`typescript` ^6.0.3) on the VS Code
Extension API `^1.75.0` (`registerFileSystemProvider`, `registerCodeLensProvider`,
`createTextEditorDecorationType`, `DiagnosticCollection`, `ThemeColor` are all
long stable — no engine bump); Python ≥ 3.9 (FastAPI + `doorstop` 3.2) for
the server additions.

**Primary Dependencies**: None new. Extension: VS Code API, the existing
`DoorstopServer.request`, `DoorstopIndex`/`loadDoorstopIndex`,
`findHeaderLocation`, `levelDepth` (requirementTree.ts — to be exported),
`choosePrefix` (doorstopCommands.ts), the review/derive/link/call-hierarchy
commands, `ProblemsProvider`. Server: `doorstop.core` (`Item.header`,
`Item.text`, `Document.add_item(level=…, reorder=True)`,
`Document.remove_item`, `Level` arithmetic) behind FastAPI as today.

**Storage**: N/A for the view itself (in-memory per open document, regenerated
from the server on demand). Item files are written only by Doorstop, through
the server. No new persisted state; the theme colour is a user setting.

**Testing**: `src/test/documentViewModel.test.ts` (new, pure render/parse/plan
functions, in the existing `unit` vscode-test config — no workspace, no
server); `src/test/regressionFixture.test.ts` (extension host + real server
on `testdata/regression`, already in CI) for open → edit → save → verify,
placeholder creation, deletion confirmation, refused save, external change;
`src/test/packageMenus.test.ts` for the menu entries and colour contribution;
`server/tests/test_items.py`, `test_documents.py`, `test_tree.py` (pytest
against a real temporary Doorstop project) for the new/changed endpoints.
CI: `.github/workflows/ci.yml` must install the server from `./server`
(not PyPI) for the integration job and gain a `server-tests` job — see
Constitution Check.

**Target Platform**: VS Code desktop extension host (Windows/macOS/Linux);
local Python server as today.

**Project Type**: VS Code extension + local Python server (existing two-part layout).

**Performance Goals**: SC-001 — open within 2 s for 500 items (one `GET /tree`
plus string rendering; no per-item file reads). SC-005 — structural diagnostics
within 1 s of typing pause (300 ms debounce, single-pass line scan).
SC-009 — disk change reflected within 2 s (file watcher → regenerate).

**Constraints**: Server is the single source of truth — the extension never
parses item files; content, levels, headers, text, links and validation come
from `/tree` and `/validate`; every write goes through the server
(constitution I/II). The view's *own* text grammar (separators, block split,
diff, structural checks) is extension logic because Doorstop has no
equivalent. Marker lines are never editable by hand; nothing is deleted
without confirmation; a refused save writes nothing (spec FR-013, FR-024,
FR-025). Error paths (server down, partial write failure, dirty conflicts)
are designed in from the start (constitution III). No new npm/pip dependency.

**Scale/Scope**: Extension: three new source files (`documentViewModel.ts`,
`documentViewProvider.ts`, `documentViewLanguage.ts`), small edits to
`extension.ts`, `hoverProvider.ts`, `definitionProvider.ts`,
`doorstopCommands.ts`, `doorstopServer.ts`, `problemsProvider.ts`,
`requirementTree.ts`, `package.json`; one new and two extended test files.
Server: `routers/items.py`, `routers/documents.py`, `routers/tree.py`,
`schemas.py`; three extended test files. CI workflow: one job changed, one
added.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Assessment |
| --- | --- | --- |
| I. Server Is the Single Source of Truth | **Yes** | Rendering reads only `GET /tree` (headers, text, levels, order, normative flag) and `GET /validate` via the existing `ProblemsProvider`. Header/text updates, item creation with level placement, and deletion are **new server endpoints** wrapping Doorstop's own API; the extension never opens an item file to read or write it. The only client-side logic is the view's own text grammar (research §6), which has no Doorstop equivalent. `/tree` is changed to emit items in Doorstop's own sort order so "level order" is the server's, not a client re-sort. |
| II. No Reinvention of Doorstop Functionality | **Yes** | Level placement of a new item uses `Document.add_item(level=…)` → Doorstop's `reorder(keep=item)`; deletion uses `Document.remove_item` (Doorstop's own renumbering); header/text writes use the `Item` setters so YAML *and* markdown item formats are handled by Doorstop. Heading depth uses the same `levelDepth` rule the tree already mirrors from `Item.depth`. |
| III. All Features Must Include Error Handling | **Yes** | Designed in (research §3, §4, §9): server unreachable on open → error message, no tab; refused save → `FileSystemError` with the offending line, tab stays dirty; partial write failures → continue, one summary message, failed blocks keep edits (spec FR-021a); dirty view vs. disk change → Reload / Keep dialog, never a silent overwrite; validation projection failure → view keeps working without problems, logged. Server endpoints return the structured `{"error": …}` shape via the existing handlers. |
| IV. No External Dependencies Without Justification | No new dependency | VS Code API + existing modules; Doorstop + FastAPI on the server. |
| V. Typed, Linted, and Tested Before It Ships | **Yes** | `npm run compile` gates the extension; the new endpoints touch item CRUD / reorder / error shape and are covered by `server/tests` against a real temporary project (no mocking). |
| VI. Every Feature Ships With a CI-Runnable Test | **Yes, with a CI change** | Primary path test in `regressionFixture.test.ts` (open view → edit text + header → placeholder → save → item files verified → fixture restored). **CI today installs the server from PyPI for that job**, so the new endpoints would 404 in CI; the workflow must install `./server` in editable mode instead, and a `server-tests` job (pytest) must be added to the root workflow — the constitution names it, but `.github/workflows/ci.yml` at HEAD only has `extension-build` and `extension-integration-tests`. Both changes are part of this feature. |

**Result**: PASS. No violations; Complexity Tracking is empty.

**Post-design re-check** (after Phase 0/1): still PASS. The design adds four
small server routes/fields (all thin wrappers over Doorstop calls), no
client-side parsing of item files, no new dependency, and no custom editor —
a plain text document on a `FileSystemProvider` keeps VS Code's own
save/revert/close flows, which is the same principle the diagram editor
follows in "Additional Constraints". The two CI edits are required to make
Principle VI true for a feature with server changes.

## Project Structure

### Documentation (this feature)

```text
specs/019-document-view/
├── spec.md                      # Feature spec (clarified 2026-09-12)
├── plan.md                      # This file
├── research.md                  # Phase 0 output
├── data-model.md                # Phase 1 output
├── quickstart.md                # Phase 1 output
├── contracts/
│   ├── document-view-format.md  # The view's text grammar: markers, blocks, parse + save-plan rules
│   ├── server-api.md            # New/changed endpoints (PATCH/DELETE /items, POST items after/header/text, /tree order)
│   └── commands-and-ui.md       # Command ids, menus, CodeLens shape, diagnostics codes, code actions, colour
└── tasks.md                     # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── documentViewModel.ts        # NEW (pure): render(tree document) → text; parse(text) → blocks; planSave(blocks, index) → ChangeSet; structural checks; marker constants/regexes
├── documentViewProvider.ts     # NEW: FileSystemProvider for scheme `doorstop-document`, per-view state, open/insert/cancel commands, save orchestration (dialogs + server calls), item-file watcher → regenerate / Reload-Keep
├── documentViewLanguage.ts     # NEW: CodeLens provider, separator + alternating-tint decorations, structural diagnostics (+ debounce), projection of Doorstop problems onto separator lines, CodeActionProvider (Restore block structure / Do Review / Clear Suspect Link / Clear All), separator-edit revert
├── extension.ts                # MODIFIED: register the three modules inside the `if (workspaceFolder)` block; export the view handle for tests
├── hoverProvider.ts            # MODIFIED: selector `[{ scheme: 'file' }, { scheme: 'doorstop-document' }]`
├── definitionProvider.ts       # MODIFIED: reference provider also answers on a known UID inside a document-view separator (FR-037)
├── doorstopCommands.ts         # MODIFIED: `doorstop.link` accepts `{ childUid }` (Link... from the CodeLens); export `nextLevel` no longer needed (server computes) — leave as is
├── doorstopServer.ts           # MODIFIED: `request()` method union gains 'PATCH'
├── problemsProvider.ts         # MODIFIED: exposes `onDidRefresh` event carrying the last (validation, tree) pair for the view's projection
├── requirementTree.ts          # MODIFIED: export `levelDepth`
└── test/
    ├── documentViewModel.test.ts   # NEW: render/parse/plan unit tests (unit config, no server)
    ├── regressionFixture.test.ts   # MODIFIED: suite block "Document View (019)"
    └── packageMenus.test.ts        # MODIFIED: "Open as document" inline icon + context entry on doorstop.root; colour contribution; new commands present

package.json                    # MODIFIED: commands (openDocumentView, insertItemHere, documentView.newItemBelow, documentView.cancelPlaceholder, documentView.restoreBlock), menus (view/item/context inline@2 + 1_requirement), contributes.colors

server/src/doorstop_server/
├── routers/items.py            # MODIFIED: PATCH /items/{uid} (header/text), DELETE /items/{uid}
├── routers/documents.py        # MODIFIED: POST /documents/{prefix}/items accepts after / header / text
├── routers/tree.py             # MODIFIED: items emitted in Doorstop sort order (`sorted(document)`)
└── schemas.py                  # MODIFIED: AddItemRequest fields, UpdateItemRequest
server/tests/
├── test_items.py               # MODIFIED: update + delete + error cases
├── test_documents.py           # MODIFIED: add-after (level placement + renumbering), header/text on create
└── test_tree.py                # MODIFIED: level-order assertion

.github/workflows/ci.yml        # MODIFIED: integration job installs `-e ./server[dev]`; new `server-tests` job
```

**Structure Decision**: Flat `src/` layout like every existing feature, with
the view split by responsibility so the pure text model (`documentViewModel.ts`)
can be unit-tested without a workspace or server, the provider owns state and
I/O, and the language layer owns only editor presentation. The closest
siblings are `problemsProvider.ts` (diagnostics + debounce + collection
ownership) and `reviewCodeActionProvider.ts` (quick fixes over published
diagnostics), whose patterns are reused rather than re-invented. Server
changes stay inside the existing routers; no new router.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

None.
