---

description: "Task list for feature 019 — Document View"
---

# Tasks: Document View

**Input**: Design documents from `/specs/019-document-view/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/document-view-format.md](contracts/document-view-format.md), [contracts/server-api.md](contracts/server-api.md), [contracts/commands-and-ui.md](contracts/commands-and-ui.md), [quickstart.md](quickstart.md)

**Tests**: Test tasks ARE included. Constitution Principle VI makes at least one CI-runnable test per feature non-negotiable, and Principle V requires pytest coverage for every server change to item CRUD. Three suites are used: `server/tests` (pytest, real temporary Doorstop project), `src/test/documentViewModel.test.ts` (new, pure functions, its own `documentViewModel` vscode-test config — no workspace, no server) and `src/test/regressionFixture.test.ts` (extension host + real server on `testdata/regression`, already in CI). Dialog answers are injected through the `documentView.prompts` handle exported from `activate()` (contracts/commands-and-ui.md, "Test surface"). Decorations and CodeLens rendering are not observable through the API beyond `vscode.executeCodeLensProvider`; their visual behaviour is covered by quickstart.md.

**Organization**: Grouped by user story, matching spec.md (US1–US7). The pure text model and the server endpoints are foundational because four stories write through them. Each story phase ends with the tests that prove it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US7)
- Exact file paths are included in every task

## Path Conventions

VS Code extension at the repository root (`src/`, tests in `src/test/`, fixture in `testdata/regression/`), Python server in `server/` (`server/src/doorstop_server/`, tests in `server/tests/`), CI in `.github/workflows/ci.yml`. No new top-level directory.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: A green baseline and a CI that can exercise server changes made in the same commit.

- [X] T001 Restore the deleted test runner config with `git checkout -- .vscode-test.mjs` (it shows as `D` in `git status`; `npm test` cannot run without it), then record a green baseline: `npm run compile`, `npm test`, and `cd server && pytest -q`. Confirm no foreign Doorstop server is bound to port 7867 (see `isRegressionFixtureTree` in `src/test/regressionFixture.test.ts`).
- [X] T002 In `.github/workflows/ci.yml`, change the `extension-integration-tests` job's `pip install doorstop-vscode-server[dev]` step to `pip install -e "./server[dev]"` so the extension tests run against the server in the same commit (research §14), and add a `server-tests` job (`actions/checkout@v4`, `actions/setup-python@v5` with `python-version: "3.12"` and `cache: pip`, `pip install -e "./server[dev]"`, `pytest server/tests`). Keep the two existing jobs otherwise unchanged.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The server endpoints every write goes through, the pure text model every story renders/parses with, and the small client hooks they need.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Server (contracts/server-api.md)

- [X] T003 In `server/src/doorstop_server/schemas.py`, extend `AddItemRequest` with `after: Optional[str] = None`, `header: Optional[str] = None`, `text: Optional[str] = None` (keep `level`), and add `class UpdateItemRequest(BaseModel)` with `header: Optional[str] = None`, `text: Optional[str] = None`.
- [X] T004 In `server/src/doorstop_server/routers/items.py`, add `PATCH /items/{uid}` (`response_model=ItemResponse`): `item = tree.find_item(uid)`; if both fields are `None` raise `DoorstopApiError(422, "INVALID_REQUEST", "header or text is required")`; set `item.auto = False`, assign `item.header` / `item.text` for the fields that are not `None` (empty string clears), call `item.save()`, return `ItemResponse(uid=str(item.uid), path=item.path, level=str(item.level))`. Add `DELETE /items/{uid}` (`status_code=204`): `item = tree.find_item(uid)`; `item.document.remove_item(item.uid)` (Doorstop default `reorder=True`, research §8); return `Response(status_code=204)`. Unknown UIDs propagate as `DoorstopError` → 400 via the existing handler.
- [X] T005 In `server/src/doorstop_server/routers/documents.py` `add_item`, implement the extended request: if `body.after` and `body.level` are both set raise `DoorstopApiError(422, "INVALID_REQUEST", "after and level are mutually exclusive")`; if `body.after`: `anchor = tree.find_item(body.after)`; if `anchor.document.prefix != document.prefix` raise `DoorstopApiError(400, "DOORSTOP_ERROR", f"{body.after} is not an item of document {prefix}")`; compute `level = anchor.level >> 1` with `level.heading = False` when `anchor.level.heading`, else `level = anchor.level + 1` (research §7); call `document.add_item(level=level)` (or `level=body.level` / no level as today). After creation, if `body.header is not None or body.text is not None`: `item.auto = False`, assign, `item.save()`. Return `ItemResponse` with the level **after** reordering (`str(item.level)`).
- [X] T006 In `server/src/doorstop_server/routers/tree.py`, iterate `for item in sorted(document)` instead of `for item in document` when building `DocumentNode.items` (Doorstop's `Item.__lt__`: level, then UID; inactive items remain included). Add a docstring line explaining why (`document.items` would drop inactive items).
- [X] T007 [P] In `server/tests/test_items.py`, add pytest cases: `test_update_item_header_and_text` (YAML document from the `document` fixture: create an item, PATCH `{"header": "H", "text": "T\nU"}`, then `/tree` shows `header == "H"`, `text == "T\nU"`, and `level`/`links`/`active` unchanged); `test_update_markdown_item` (create a document with `"itemFormat": "markdown"`, create an item, PATCH text, re-read via `/tree`, and assert the `.md` file on disk contains the text after the frontmatter); `test_update_item_empty_body_returns_422`; `test_update_unknown_item_returns_400`; `test_delete_item_removes_file_and_renumbers` (three items `1.1`, `1.2`, `1.3`; DELETE the middle one → 204, file gone, remaining levels `1.1`, `1.2`); `test_delete_unknown_item_returns_400`.
- [X] T008 [P] In `server/tests/test_documents.py`, add: `test_add_item_after_sibling` (items A `1.1`, B `1.2`, C `1.3`; POST `{"after": B.uid, "header": "New", "text": "Body"}` → response `level == "1.3"`, `/tree` shows C at `1.4`, new item has header/text); `test_add_item_after_heading_item` (make item A a heading via the Doorstop API in the test — `item.level = "1.0"; item.normative = False` using the `set_item_text`-style helper pattern in `conftest.py` — then POST `after: A.uid` → `level == "1.1"`); `test_add_item_after_and_level_returns_422`; `test_add_item_after_foreign_item_returns_400` (second document `SYS`, `after` names a `REQ` item); `test_add_item_with_header_and_text_only` (no `after`, header/text land in the file).
- [X] T009 [P] In `server/tests/test_tree.py`, add `test_tree_items_are_sorted_by_level`: create three items, set their levels to `2.0`, `1.1`, `1.0` via the Doorstop API, then assert `/tree` returns them in the order `1.0`, `1.1`, `2.0`. Run `cd server && pytest -q` — all green.

### Extension foundations

- [X] T010 [P] In `src/doorstopServer.ts`, widen `request<T>(method: 'GET' | 'POST' | 'DELETE', …)` to `'GET' | 'POST' | 'PATCH' | 'DELETE'` (no other change).
- [X] T011 [P] In `src/requirementTree.ts`, add `export` to the module-private `levelDepth(level: string): number` helper (no behaviour change) so the view's renderer reuses the tree's depth rule (contract rule 4).
- [X] T012 Create `src/documentViewModel.ts` (pure, no `vscode` imports except types if needed — prefer none) with the constants and grammar from contracts/document-view-format.md: `export const DOCUMENT_VIEW_SCHEME = 'doorstop-document'`; `export const DEBOUNCE_MS = 300`; `documentMarker(prefix)` → `<!-- doorstop document ${prefix} · keep this line -->`; `itemSeparator(uid, level)` → `<!-- ${uid} · ${level} · item separator. keep this line -->`; `PLACEHOLDER_MARKER = '<!-- new item -->'`; the three anchored regexes (`DOCUMENT_MARKER_REGEX`, `ITEM_SEPARATOR_REGEX` with named groups `uid`/`level`, `PLACEHOLDER_REGEX`); `viewUriFor(prefix)` → `vscode.Uri.from({ scheme, path: '/' + prefix + ' (document)' })` (this one may import `vscode`); `prefixFromViewUri(uri)`; and `normalizeText(text)` (right-trim each line, drop leading/trailing blank lines, join with `\n`) and `normalizeHeader(line)` (`replace(/^#{1,6}\s+/, '').trim()`).
- [X] T013 In `src/documentViewModel.ts`, implement `render(document: DocumentNode): { text: string; blocks: RenderedBlock[]; issues: StructuralIssue[] }` per contract "Rendering" rules 1–7 and data-model.md `RenderedBlock` (fields `kind`, `uid`, `level`, `separator`, `headerLine`, `textLines`, `startLine`, `endLine`): active items only, in the given order; header line `'#'.repeat(min(6, max(1, levelDepth(level)))) + ' ' + (header?.trim() || uid)`; text lines from `text` split on `\n` (none when empty — covers heading items); blocks separated by exactly one blank line; trailing `\n`; a text line matching `ITEM_SEPARATOR_REGEX` yields a `separator-lookalike` issue at that line.
- [X] T014 In `src/documentViewModel.ts`, implement `parse(text: string): ParsedBlock[]` per contract "Parsing" rules 1–6 and data-model.md `ParsedBlock` (`kind: 'document' | 'item' | 'placeholder' | 'orphan'`, `uid`, `separatorLine`, `separatorText`, `headerText`, `headerLineIsHeading`, `text`, `endLine`): split on `/\r?\n/`; line 0 must match `DOCUMENT_MARKER_REGEX` else the leading non-empty lines form an `orphan` block; every `ITEM_SEPARATOR_REGEX` / `PLACEHOLDER_REGEX` line starts a block running to the line before the next managed line; the line after a separator is the header line (`headerLineIsHeading = /^#{1,6}\s+\S/.test(line)`, `headerText = normalizeHeader(line)`, `''` for a blank line); body = `normalizeText` of the remaining lines. Markdown headings inside a body never split a block.
- [X] T015 [P] Create `src/test/documentViewModel.test.ts` (Mocha `suite('Document View model (019)')`) and add a new labelled config to `.vscode-test.mjs` — `{ label: 'documentViewModel', files: 'out/test/documentViewModel.test.js' }` with no `workspaceFolder` and no server, like the `diagramLayout` config — covering `render` and `parse`: a three-item document (`1.0` no header, `1.1` header "Sensor input" + two-paragraph text, `1.1.1` no header) renders exactly the contract example shape (`#`/`##`/`###`, UID fallback, one blank line between blocks, trailing `\n`); a heading item (non-normative, header, empty text) renders separator + heading only; a non-normative item with text renders its text; inactive items are skipped; a text line that looks like a separator yields `separator-lookalike`; `parse(render(doc).text)` round-trips every block's `uid`, `headerText` and normalised `text`; a `## Heading` typed inside a body stays in that block; text before the first separator parses as `orphan`; a placeholder block parses with `kind: 'placeholder'`. Add the `documentViewModel` config to `.vscode-test.mjs` and run `npm test`.

**Checkpoint**: Server tests green with the four endpoint changes; `render`/`parse` unit tests green. Nothing is visible in VS Code yet.

---

## Phase 3: User Story 1 - Read a whole document as one file (Priority: P1) 🎯 MVP

**Goal**: "Open as document" on a document node (inline icon + context menu) and "Doorstop: Open Document View" (palette, asks for the document) open a tab `<PREFIX> (document)` in markdown mode showing the document marker and one block per active item in level order; reopening reveals the same tab; standard editor features work.

**Independent Test**: With `testdata/regression` open, click the book icon on the `REQ` node: a tab `REQ (document)` opens whose first line is `<!-- doorstop document REQ · keep this line -->`, followed by ten blocks `<!-- REQ-00x · 1.y · item separator. keep this line -->` in level order, `## Heading Display Coverage` for REQ-004 and `## REQ-00x` for the others. Automated: the `Document View (019)` open tests in `regressionFixture.test.ts` and the manifest assertions in `packageMenus.test.ts`.

### Implementation for User Story 1

- [X] T016 [US1] Create `src/documentViewProvider.ts` with the per-view state from data-model.md `DocumentViewState` (`prefix`, `uri`, `folder`, `snapshot`, `text`, `mtime`, `blocks`, `saveReason`, `saving`, `pendingDiskChange`) held in a `Map<string, DocumentViewState>` keyed by prefix, and `export class DocumentViewFileSystem implements vscode.FileSystemProvider`: `onDidChangeFile` via an `EventEmitter<vscode.FileChangeEvent[]>`; `watch()` → no-op disposable; `stat(uri)` → `{ type: File, ctime, mtime, size }` of the state (throw `FileSystemError.FileNotFound` for unknown prefixes); `readFile(uri)` → `TextEncoder().encode(state.text)`; `readDirectory`/`createDirectory`/`delete`/`rename` → throw `FileSystemError.NoPermissions`; `writeFile` → for now throw `FileSystemError.NoPermissions('Saving a document view is implemented in US2')` (replaced in T024).
- [X] T017 [US1] In `src/documentViewProvider.ts`, implement `async loadSnapshot(server, prefix): Promise<DocumentNode>` (`GET /tree`, find the document by prefix, throw `Error(\`Doorstop: no document with prefix ${prefix}\`)` when absent) and `regenerate(state)`: `const { text, blocks, issues } = render(snapshot)`; when `text !== state.text` set `state.text = text`, `state.blocks = blocks`, `state.mtime = Date.now()` (strictly greater than the previous value — bump by 1 if equal) and fire `onDidChangeFile([{ type: Changed, uri }])`; store `issues` on the state for the language layer (US3). Never fire when the text is unchanged (research §4, idempotent).
- [X] T018 [US1] In `src/documentViewProvider.ts`, implement the shared open handler `openDocumentView(prefix)`: load the snapshot (on failure `prompts.reportError(\`Doorstop: cannot open ${prefix} as document: ${message}\`)` and return — no tab); create/refresh the state (`folder = path.dirname(snapshot.markerPath)`), `render` into `state.text`; `const document = await vscode.workspace.openTextDocument(viewUriFor(prefix))`; if `document.languageId !== 'markdown'` await `vscode.languages.setTextDocumentLanguage(document, 'markdown')`; `await vscode.window.showTextDocument(document, { preview: false })`. Register `vscode.workspace.onDidOpenTextDocument` for the scheme to set the language on restored tabs, and `onDidCloseTextDocument` to drop the state when no other `TextDocument` with that URI remains (data-model.md lifecycle).
- [X] T019 [US1] In `src/documentViewProvider.ts`, add `export function registerDocumentView(context, options: { server: DoorstopServer; tree: DoorstopTreeProvider; problems: ProblemsProvider; onChanged: () => void; prompts?: Partial<Prompts> }): DocumentViewHandle` that registers the provider with `vscode.workspace.registerFileSystemProvider(DOCUMENT_VIEW_SCHEME, fs, { isCaseSensitive: true, isReadonly: false })`, the commands `doorstop.openDocumentView` (no argument → `choosePrefix(options.tree)` from `src/doorstopCommands.ts`, cancel silently when dismissed) and `doorstop.openAsDocument` (argument `RequirementTreeItem` with `itemData.isDoorstopRoot` → `itemData.prefix`; anything else → `showInformationMessage('Doorstop: select a document in the Doorstop explorer.')`), and returns the handle `{ prompts, getState(prefix) }` (contracts/commands-and-ui.md "Test surface"). Define the `Prompts` interface with the five functions and defaults from data-model.md (`confirmDeletions`, `confirmHeaderChange`, `notifyDiskChange`, `reportError`, `reportHint`) — the handle's `prompts` object is mutable so tests can replace entries.
- [X] T020 [US1] In `src/extension.ts`, inside the existing `if (workspaceFolder) { … }` block after `registerCallHierarchyProvider(...)`, call `const documentView = registerDocumentView(context, { server: doorstopServer, tree: treeProvider, problems: problemsProvider, onChanged })` and add `documentView` to the object returned by `activate()` (`return { treeProvider, problemsProvider, documentView }`).
- [X] T021 [US1] In `package.json`, add to `contributes.commands`: `doorstop.openDocumentView` (title `Doorstop: Open Document View`, category-less like the other `Doorstop: …` titles), `doorstop.openAsDocument` (title `Open as document`, `icon: "$(book)"`); add to `contributes.menus["view/item/context"]` the two entries from contracts/commands-and-ui.md (`inline@2` and `1_requirement@0`, `when: "view == doorstop.treeView && viewItem == doorstop.root"`); add `contributes.menus.commandPalette` (create the array if absent) with `{ "command": "doorstop.openAsDocument", "when": "false" }`. Run `npm run compile`.

### Tests for User Story 1

- [X] T022 [P] [US1] In `src/test/packageMenus.test.ts`, add assertions: both commands exist in `contributes.commands` with the exact titles; `view/item/context` contains `doorstop.openAsDocument` twice with `viewItem == doorstop.root` (one `inline@…` group, one `1_requirement@…` group) and never for `doorstop.item`; `commandPalette` hides `doorstop.openAsDocument`.
- [X] T023 [US1] In `src/test/regressionFixture.test.ts`, add a `suite('Document View (019)')` block (inside the existing fixture suite so it shares `server`/`treeProvider`) with a helper `openReqView()` that runs `doorstop.openAsDocument` with the `REQ` root tree item (found via `findTreeItem`) and returns the active `TextDocument`; assert `document.uri.scheme === 'doorstop-document'`, `document.languageId === 'markdown'`, `path.basename(document.uri.path) === 'REQ (document)'`; assert line 0 equals `<!-- doorstop document REQ · keep this line -->`, that separators for `REQ-001`…`REQ-010` appear in that order with levels `1.0`…`1.9`, that REQ-004's header line is `## Heading Display Coverage` and REQ-002's is `## REQ-002` followed by `The system shall have minimal text.`; run the command a second time and assert `vscode.window.visibleTextEditors` still holds exactly one editor for that URI. Also assert that `doorstop.openDocumentView` for `EMPTY` (call the handle's open path via the command with the prefix pre-chosen — expose `openDocumentView(prefix)` on the handle for tests) yields exactly the document marker line. Run `npm test`.

**Checkpoint**: A read-only-in-practice document view opens from the tree and the palette; saving still fails with a clear message.

---

## Phase 4: User Story 2 - Edit headers and text and save back to the item files (Priority: P1)

**Goal**: Editing a heading or the text below it and pressing Ctrl+S writes exactly the changed items' header/text through the server, leaves everything else untouched, regenerates the view from disk and refreshes Problems + tree; a failed save keeps the tab dirty and the edits.

**Independent Test**: Open `REQ` as document, change REQ-002's text and REQ-004's heading, save: only `REQ-002.yml` (`text:`) and `REQ-004.yml` (`header:`) differ; saving again without edits touches nothing; with the server stopped the save fails and the tab stays dirty. Automated: `Document View (019)` save tests.

### Implementation for User Story 2

- [X] T024 [US2] In `src/documentViewModel.ts`, implement `planSave(blocks: ParsedBlock[], snapshot: DocumentNode, lastRender: RenderedBlock[]): ChangeSet` per contract "Save plan" and data-model.md `ChangeSet` (`errors`, `updates`, `creations`, `deletions`, `unchanged`): for every `item` block compare `headerText` (treated as `''` when it equals the UID; a non-heading header line still contributes its trimmed text; blank → `''`) and normalised `text` against the snapshot item's `header?.trim() ?? ''` and `text ?? ''`; emit `update { uid, header, text, headerOnly: headerDiffers && !textDiffers }` only when something differs, else push to `unchanged`. Emit `errors` for `separator-duplicated` (second occurrence), `separator-unknown` (UID not an active item of the snapshot), `text-before-first-separator` (any `orphan` block) and `separator-lookalike` (from `lastRender` issues). `deletions` and `creations` are filled in US3/US4 but the fields must exist now (empty arrays).
- [X] T025 [US2] In `src/documentViewProvider.ts`, replace the `writeFile` stub with the save orchestration from research §3: decode `content`; `const snapshot = await loadSnapshot(server, prefix)` (on failure throw `vscode.FileSystemError.Unavailable(\`Doorstop server unavailable: ${message}\`)` — nothing written, tab stays dirty); `const plan = planSave(parse(text), snapshot, state.blocks)`; if `plan.errors.length` throw `FileSystemError.Unavailable(\`${first.message} (line ${first.line + 1}) - use the quick fix "Restore block structure"\`)`; then for each `update` in document order `await server.request('PATCH', \`/items/${encodeURIComponent(uid)}\`, { header, text })`, collecting failures as `SaveOutcome.failed` entries `{ uid, line, message }` and continuing (FR-021a). Set `state.saving = true` for the duration (cleared in `finally`).
- [X] T026 [US2] In `src/documentViewProvider.ts`, finish `writeFile`: on **all succeeded** store the user's content as `state.text` with `mtime = t1`, then `regenerate(state)` from a fresh snapshot (bumps to `t2` and fires `Changed` so VS Code reloads the clean model in place), call `options.onChanged()` (tree + problems refresh) and return. On **some failed**: regenerate from the fresh snapshot but splice each failed block's edited text (separator + header + body as the user typed them) back over that block, store it with a bumped `mtime`, fire `Changed`, `prompts.reportError(\`Doorstop: ${failed.length} of ${total} changes could not be saved: ${failed.map(f => \`${f.uid} (${f.message})\`).join(', ')}. The failed blocks keep your edits.\`)`, then throw `FileSystemError.Unavailable('some changes could not be saved')` so the tab stays dirty.
- [X] T027 [US2] In `src/documentViewProvider.ts`, record the save reason: `vscode.workspace.onWillSaveTextDocument(e => { if (e.document.uri.scheme === DOCUMENT_VIEW_SCHEME) state.saveReason = e.reason; })`. In `writeFile`, when `saveReason` is `AfterDelay` or `FocusOut` and the plan needs any dialog (`headerOnly` updates, `deletions`, `creations` — the latter two exist from US3/US4 on), refuse with `FileSystemError.Unavailable('Doorstop: ' + prefix + ' (document) has changes that need confirmation - save manually (Ctrl+S)')` and remember that the message was shown for the current document version (`document.version`) so it is not repeated until the text changes again (research §3 "Auto-save").

### Tests for User Story 2

- [X] T028 [P] [US2] In `src/test/documentViewModel.test.ts`, add `planSave` cases: unchanged document → `updates` empty and every UID in `unchanged`; edited body → one `update` with `headerOnly: false` and the normalised text; heading changed only → `headerOnly: true`; heading equal to the UID → `header: ''`; `####` instead of `##` with the same text → unchanged (depth ignored); trailing blank lines added → unchanged; duplicated separator → `errors[0].code === 'separator-duplicated'` with the second line; separator naming a UID outside the snapshot → `separator-unknown`; orphan text → `text-before-first-separator`.
- [X] T029 [US2] In `src/test/regressionFixture.test.ts` `Document View (019)`, add a `withRestoredFixture(fn)` helper that snapshots every file under `testdata/regression` (path → bytes) before `fn` and afterwards rewrites changed files, restores deleted ones and deletes files that did not exist before (reorder can touch many files; `isRegressionFixtureTree` needs exactly 10 REQ items). Then add tests: (a) edit REQ-002's body line to `The system shall have edited text.` and REQ-004's heading to `## Heading Changed` via `WorkspaceEdit`, set `documentView.prompts.confirmHeaderChange = async () => 'apply'`, `await document.save()` → returns `true`, `document.isDirty === false`, `/tree` shows the new text/header, `REQ-002.yml` differs from its snapshot only in the `text:` block and `REQ-004.yml` only in `header:` (compare line-by-line ignoring those keys), and every other fixture file is byte-identical; the reloaded view still contains the edited text; (b) save without edits → no fixture file changes (byte-compare all); (c) with `documentView.prompts.reportError` captured and the server stopped (`server.dispose()` then restart in `finally` — or point the state at an unreachable port via a test-only hook), `document.save()` resolves `false`, `document.isDirty` stays `true`. Run `npm test`.

**Checkpoint**: The MVP editing loop works end to end: open → edit → save → files updated → view regenerated.

---

## Phase 5: User Story 3 - Be protected from losing items by accident (Priority: P1)

**Goal**: Separator edits are reverted at once with a hint; structural problems are flagged while typing with a "Restore block structure" quick fix; a missing block asks Delete / Keep / Cancel before anything is removed; duplicated/foreign separators or orphan text refuse the save; a header-only change asks Apply / Keep.

**Independent Test**: In the `REQ` view: type into a separator → reverted + hint; delete REQ-010's whole block and save → "REQ-010 would be deleted - Delete / Keep / Cancel" (Keep restores, Cancel aborts, Delete removes the file); duplicate a separator and save → refused with the line named and a quick fix; delete REQ-004's heading line and save → header confirmation. Automated: `Document View (019)` protection tests + model tests.

### Implementation for User Story 3

- [X] T030 [US3] In `src/documentViewModel.ts`, implement `checkStructure(blocks: ParsedBlock[], lines: string[], lastRender: RenderedBlock[]): StructuralIssue[]` per contract "Structural diagnostics while typing" and data-model.md `StructuralIssue` (`code`, `severity`, `line`, `uid?`, `message`): `text-before-first-separator` (Error), `separator-duplicated` (Error, second occurrence), `separator-changed` (Warning: a line starting with `<!--` that contains a `lastRender` UID as a whole word but does not match `ITEM_SEPARATOR_REGEX` exactly), `missing-header` (Warning: item block whose header line is blank or not a heading), `placeholder-empty-heading` (Warning), plus the render's `separator-lookalike` issues (Error). Messages must name the UID where known, e.g. `Separator of REQ-004 was changed`, `REQ-004 has no heading line after its separator`, `Separator of REQ-004 appears twice`, `Text before the first item separator`.
- [X] T031 [US3] In `src/documentViewModel.ts`, extend `planSave` with `deletions`: every `active` snapshot UID that has no `item` block in `blocks` (order = snapshot order).
- [X] T032 [US3] Create `src/documentViewLanguage.ts` with `registerDocumentViewLanguage(context, options: { getState(uri): DocumentViewState | undefined; prompts: Prompts })`: a `DiagnosticCollection` named `doorstop-document`; a debounced (`DEBOUNCE_MS`) `scan(document)` on `onDidChangeTextDocument` / `onDidOpenTextDocument` for the scheme that runs `parse` + `checkStructure` and publishes structural diagnostics (`source: 'doorstop-document'`, `code`, whole-line range, severity per issue) merged with the projected `doorstop` diagnostics (added in US5 — keep a per-URI slot for them now); clear the collection entry on `onDidCloseTextDocument`.
- [X] T033 [US3] In `src/documentViewLanguage.ts`, implement the separator revert (research §5): on `onDidChangeTextDocument` for the scheme, for each `contentChange` whose `range.start.line === range.end.line` and whose line was a managed line in `state.blocks` (document marker, item separator by `startLine`, or a placeholder marker present in the pre-change text — track the last accepted line texts in the state), unless a `restoring` flag is set: apply one `WorkspaceEdit` replacing that whole line with its known text, then `prompts.reportHint('This line is managed by Doorstop - use the actions above it')`. Multi-line changes are never reverted.
- [X] T034 [US3] In `src/documentViewLanguage.ts`, register a `CodeActionProvider` for `{ scheme: DOCUMENT_VIEW_SCHEME }` (kind `QuickFix`) that, for every `doorstop-document` diagnostic intersecting the requested range, returns a preferred action titled `Restore block structure of ${uid}` (or `Restore block structure` without UID) running the command `doorstop.documentView.restoreBlock` with `{ uri, code, line, uid }`. Register that command (hidden from the palette) implementing the fixes from data-model.md's StructuralIssue table: `separator-changed` → replace the line with `itemSeparator(uid, level)` from the snapshot; `missing-header` → insert `#{depth} <header or UID>` from the snapshot as the line after the separator (replace a blank line, insert above a non-heading line); `separator-duplicated` → delete the duplicate separator line; `placeholder-empty-heading` → remove the placeholder block; `text-before-first-separator` → insert the document marker at line 0 if missing, then the separator of the first snapshot item that has no separator in the text directly above the orphan text; `separator-lookalike` → no edit, `reportHint('Edit this item in its own file')`.
- [X] T035 [US3] In `src/documentViewProvider.ts` `writeFile`, add the dialogs between planning and writing (research §3 step 3): if `plan.deletions.length` call `prompts.confirmDeletions(plan.deletions)` (default: modal `showWarningMessage(\`${uids.join(', ')} would be deleted - Delete / Keep / Cancel\`, { modal: true }, 'Delete', 'Keep', 'Cancel')`): `'cancel'` (or dismissed) → throw `FileSystemError.Unavailable('Save cancelled')`; `'keep'` → drop the deletions (the regeneration after the save restores the blocks from disk); `'delete'` → keep them. Then for each `headerOnly` update call `prompts.confirmHeaderChange(uid, oldHeader, newHeader)` (default modal `Header of ${uid} changed from '${old}' to '${new}' - Apply / Keep`, buttons `Apply`, `Keep`): `'keep'` → remove that update. Then write: confirmed deletions run `DELETE /items/{uid}` after all updates and creations, with failures collected like updates.
- [X] T036 [US3] In `src/extension.ts`, call `registerDocumentViewLanguage(context, { getState: documentView.getState, prompts: documentView.prompts })` right after `registerDocumentView(...)`. In `package.json`, add the command `doorstop.documentView.restoreBlock` (title `Restore block structure`) and hide it in `commandPalette` (`when: "false"`). Run `npm run compile`.

### Tests for User Story 3

- [X] T037 [P] [US3] In `src/test/documentViewModel.test.ts`, add `checkStructure` cases (one per code, asserting `code`, `line`, `uid` and that the message contains the UID) and `planSave` deletion cases (one missing block → `deletions == ['REQ-010']`; two merged blocks → both missing UIDs; placeholder blocks never count as deletions).
- [X] T038 [US3] In `src/test/regressionFixture.test.ts` `Document View (019)`, add: (a) edit inside REQ-003's separator line (`WorkspaceEdit` inserting `x`) → after a short wait the line equals the original separator again and the captured `prompts.reportHint` received the exact hint text; (b) delete REQ-010's block (separator through its text) and save with `confirmDeletions = async () => 'keep'` → save resolves `true`, `REQ-010.yml` unchanged, view shows the block again; with `'cancel'` → save resolves `false`, tab dirty, file unchanged; with `'delete'` (inside `withRestoredFixture`) → `REQ-010.yml` no longer exists and `/tree` has 9 REQ items; (c) duplicate REQ-005's separator line and save → `false`, tab dirty, no fixture change, and `vscode.languages.getDiagnostics(uri)` contains a `doorstop-document` diagnostic with code `separator-duplicated` on the second line, and `vscode.executeCodeActionProvider` on that line returns an action titled `Restore block structure of REQ-005`; run its command and assert the duplicate is gone; (d) replace REQ-004's heading line with an empty line, save with `confirmHeaderChange` capturing its arguments and answering `'keep'` → `REQ-004.yml` unchanged and the arguments were `('REQ-004', 'Heading Display Coverage', '')`.

**Checkpoint**: All P1 stories done — the view is safe to hand to a non-technical user.

---

## Phase 6: User Story 4 - Add new items in place (Priority: P2)

**Goal**: "+ New item below" (action line) and "Doorstop: Insert Item Here" insert a placeholder block; on save each placeholder with content becomes an item created after the block above it (sibling level, followers renumbered); empty placeholders are ignored; "Cancel" removes a placeholder; a typed heading never creates an item.

**Independent Test**: In the `REQ` view insert a placeholder after REQ-003, type a heading + paragraph, save → `REQ-011.yml` at `1.3` with that header/text, REQ-004…REQ-010 renumbered, the view shows the new block between REQ-003 and REQ-004. Automated: `Document View (019)` new-item tests.

### Implementation for User Story 4

- [X] T039 [US4] In `src/documentViewModel.ts`, add `placeholderBlockText(depth: number): string` (blank line, `PLACEHOLDER_MARKER`, `'#'.repeat(depth) + ' '`, blank line — contract "Placeholder block") and `insertionPointAfterBlock(blocks: ParsedBlock[], line: number): { insertAtLine: number; depth: number; afterUid?: string }` (the block containing `line`; after the document marker → depth 1, `afterUid` undefined). Extend `planSave` with `creations`: every `placeholder` block with non-empty `headerText` or `text` → `{ afterUid: uid of the nearest preceding item block or undefined, header: headerText ?? '', text, line: separatorLine }`; placeholders with both empty are ignored.
- [X] T040 [US4] In `src/documentViewProvider.ts`, register `doorstop.documentView.newItemBelow` (`{ uri, line }`): open the document, compute the insertion point, apply a `WorkspaceEdit` inserting `placeholderBlockText(depth)` after the block's last line, then place the cursor at the end of the new heading line and reveal it; `doorstop.insertItemHere` (no argument): if the active editor is not a document view → `showInformationMessage('Doorstop: open a document view first (Doorstop: Open Document View).')`, else the same insertion after the block containing `selection.active.line`; `doorstop.documentView.cancelPlaceholder` (`{ uri, line }`): remove the placeholder marker line, its heading line, its empty paragraph line and one adjacent blank line. All three are hidden from the palette except `doorstop.insertItemHere` (`when: "resourceScheme == doorstop-document"`).
- [X] T041 [US4] In `src/documentViewProvider.ts` `writeFile`, write creations in document order after the updates: `await server.request<AddedItem>('POST', \`/documents/${encodeURIComponent(prefix)}/items\`, { ...(afterUid ? { after: afterUid } : {}), header, text })`; a created UID is added to `SaveOutcome.written`; failures are collected like updates and the placeholder block is spliced back on partial failure (T026). Placeholders count as "needs confirmation" for the auto-save rule (T027).
- [X] T042 [US4] In `package.json`, add the commands `doorstop.insertItemHere` (`Doorstop: Insert Item Here`), `doorstop.documentView.newItemBelow` (`+ New item below`), `doorstop.documentView.cancelPlaceholder` (`Cancel`) and the `commandPalette` entries from contracts/commands-and-ui.md. Run `npm run compile`.

### Tests for User Story 4

- [X] T043 [P] [US4] In `src/test/documentViewModel.test.ts`, add: `insertionPointAfterBlock` for a line inside REQ-003's block (depth 2, `afterUid: 'REQ-003'`), for line 0 (depth 1, no `afterUid`); `planSave` with a placeholder carrying a heading → one creation with `afterUid` of the preceding block; placeholder with only body text → creation with `header: ''`; empty placeholder → no creation and no error; a `## Typed heading` inside REQ-005's body → no creation, REQ-005 `update` includes it in `text`.
- [X] T044 [US4] In `src/test/regressionFixture.test.ts` `Document View (019)`, inside `withRestoredFixture`: open `REQ`, run `doorstop.documentView.newItemBelow` with REQ-003's separator line, assert the inserted `<!-- new item -->` + `## ` lines and that the selection sits at the end of the heading line; type `## Inserted item` and a paragraph via `WorkspaceEdit`, save → `true`; assert `/tree` has 11 REQ items, the new UID is `REQ-011` at level `1.3` with header `Inserted item`, REQ-004 is now `1.4` and REQ-010 `1.10`, `REQ-011.yml` exists, and the reloaded view shows `<!-- REQ-011 · 1.3 · item separator. keep this line -->` between REQ-003 and REQ-004. Second test: insert a placeholder, run `doorstop.documentView.cancelPlaceholder` → the text equals the original render. Third: insert an empty placeholder and save → `/tree` still has 10 items. Fourth: `doorstop.insertItemHere` with `REQ-001.yml` active → the command resolves without throwing and the file's text is unchanged (the information message itself is not observable through the API).

**Checkpoint**: Items can be created in reading order without leaving the view.

---

## Phase 7: User Story 5 - Use item actions and see Doorstop problems inside the view (Priority: P2)

**Goal**: An action line above every block (`UID | Open item | Review/Do Review | Derive | Link... | N links | [Clear suspect link] | + New item below`), Doorstop's problems shown on the separator lines with the same quick fixes as in item files, and hover / go to definition / references / call hierarchy working on UIDs inside separators.

**Independent Test**: With REQ-001 unreviewed (fixture default: `reviewed: null` → `needs_initial_review`), the `REQ` view shows `Do Review` on REQ-001's action line and a `doorstop` diagnostic on its separator whose quick fix "Do Review" marks it reviewed; `vscode.executeCodeLensProvider` on the view returns the lenses; hovering/F12 on `REQ-001` in a separator resolves the item. Automated: `Document View (019)` action/problem tests.

### Implementation for User Story 5

- [X] T045 [US5] In `src/problemsProvider.ts`, add to the `ProblemsProvider` interface `readonly onDidRefresh: vscode.Event<{ validation: ValidationResponse; tree: TreeResponse }>` and `getLastRefresh(): { validation; tree } | undefined`; fire the event at the end of every successful `refreshNow` pass (after the collection is written) and clear the stored pair on failure. No other behaviour change.
- [X] T046 [US5] In `src/documentViewLanguage.ts`, implement the validation projection (research §9): on `problems.onDidRefresh` and on every debounced scan, for each issue whose `uids` contain a UID of the open view's blocks, create a `vscode.Diagnostic` on that block's separator line with `message: issue.message`, `source: 'doorstop'`, `code: issue.check`, severity via the same `error/warning/info` mapping as `problemsProvider.ts` (duplicate the three-line map or export `SEVERITY_BY_NAME` from there — export it); merge with the structural diagnostics into the single `doorstop-document` collection entry.
- [X] T047 [US5] In `src/documentViewLanguage.ts`, register a `CodeLensProvider` for `{ scheme: DOCUMENT_VIEW_SCHEME }` producing, on each separator line in the order of contracts/commands-and-ui.md "CodeLens": `<UID>` and `Open item` → `vscode.open` with the item file URI and `findHeaderLocation` selection; `Review` → `doorstop.doReview` `{ uid, documentUri }` — title `Do Review` when a projected `doorstop` diagnostic for that UID has code `needs_initial_review` or `unreviewed_changes`; `Derive` → `doorstop.deriveRequirement` `{ sourceUid, sourceUri: Uri.file(item.path) }`; `Link...` → `doorstop.link` `{ childUid: uid }`; `no links` / `1 link` / `N links` → `doorstop.showCallHierarchy` `{ resourceUri: Uri.file(item.path), itemData: { uid } }`; `Clear suspect link` → `doorstop.clearAllSuspicions` `{ uid, documentUri }` only when a projected diagnostic has code `suspect_link`; `+ New item below` → `doorstop.documentView.newItemBelow` `{ uri, line }`. Placeholder markers: `new item` (no command) and `Cancel` → `doorstop.documentView.cancelPlaceholder`. Document marker: `+ New item below`. Fire `onDidChangeCodeLenses` after each scan and each projection update.
- [X] T048 [US5] In `src/documentViewLanguage.ts`'s `CodeActionProvider`, add the Doorstop quick fixes on `doorstop` diagnostics anchored to a separator (same titles, commands and argument shapes as `src/reviewCodeActionProvider.ts`): `Do Review` (`doorstop.doReview`, preferred) for review checks; `Clear Suspect Link` (`doorstop.clearAllSuspicions`, preferred) for `suspect_link`; `Clear All Suspect Links` (`doorstop.clearAllSuspicions`, not preferred) when ≥ 2 `suspect_link` diagnostics sit on that separator. Reuse the `REVIEW_CHECKS` / `SUSPECT_LINK_CHECK` constants — export them from `reviewCodeActionProvider.ts` rather than copying.
- [X] T049 [P] [US5] In `src/doorstopCommands.ts` `doorstop.link`, accept a third argument form: when `value` is an object with a string `childUid` (and is not a `RequirementTreeItem`), ask `showInputBox({ prompt: 'Enter parent item UID' })` for the parent and post `/items/${childUid}/links` with `{ parentUid }`; existing tree-item and no-argument paths unchanged.
- [X] T050 [P] [US5] In `src/hoverProvider.ts`, change the selector from `{ scheme: 'file' }` to `[{ scheme: 'file' }, { scheme: DOCUMENT_VIEW_SCHEME }]` (import the constant from `src/documentViewModel.ts`).
- [X] T051 [P] [US5] In `src/definitionProvider.ts`, extend the reference provider: when `document.uri.scheme === DOCUMENT_VIEW_SCHEME` and the word at `position` (via `UID_REGEX`) is a UID the index knows, return the linkers' locations (`findReferenceLocation(linkerUri, uid)` for each `index.getLinkers(uid)`), otherwise keep today's `derived:`-line behaviour.
- [X] T052 [US5] Verify by reading (no code change expected) that `src/callHierarchyProvider.ts` `resolveRootItem` and `src/definitionProvider.ts` `resolveDefinitionAt` already work on a separator UID (language-based selectors, UID under cursor); note in the PR description which existing tests cover them. Run `npm run compile`.

### Tests for User Story 5

- [X] T053 [US5] In `src/test/regressionFixture.test.ts` `Document View (019)`, add: (a) `vscode.executeCodeLensProvider(uri)` returns, for REQ-001's separator line, lenses titled `REQ-001`, `Open item`, `Do Review` (REQ-001 has `reviewed: null`), `Derive`, `Link...`, `no links`, `+ New item below` in that order, and for the document marker line exactly `+ New item below`; (b) after `problems.refreshNow()`, `vscode.languages.getDiagnostics(uri)` contains a diagnostic with `source === 'doorstop'` and code `needs_initial_review` on REQ-001's separator line; `executeCodeActionProvider` there returns `Do Review`; inside `withRestoredFile(REQ-001.yml)` run it (`doorstop.doReview` with the lens argument) and assert `/tree` reports `reviewed: true` and the view's lens now reads `Review`; (c) `vscode.executeHoverProvider` on the `REQ-001` token in its separator returns a hover mentioning `REQ-001`; `vscode.executeDefinitionProvider` there returns `REQ-001.yml`; `vscode.executeReferenceProvider` returns `ARCH-001.yml` and `MD-001.md` (both link to REQ-001); `vscode.prepareCallHierarchy` there returns an item named `REQ-001`.

**Checkpoint**: Routine item actions and Doorstop's problems no longer require leaving the view.

---

## Phase 8: User Story 6 - Stay consistent with changes on disk (Priority: P3)

**Goal**: The view refreshes when an item file of its document changes on disk (other tab, Doorstop command, git checkout); when the view is dirty the user is offered Reload / Keep my edits; a later save never overwrites items the user did not touch with stale content.

**Independent Test**: With the `REQ` view clean, save a change to `REQ-001.yml` in its own tab → the view updates; with an unsaved edit in the view, change `REQ-002.yml` on disk → notification with Reload / Keep my edits; after Keep, saving the view leaves REQ-002's disk text in place. Automated: `Document View (019)` disk tests.

### Implementation for User Story 6

- [X] T054 [US6] In `src/documentViewProvider.ts`, per open view create `vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(state.folder, '**/*.{yml,md}'))` (disposed with the state); on create/change/delete, ignore while `state.saving`; otherwise collect the changed basenames (UIDs) into a 300 ms-debounced batch and: if no `TextDocument` for the view is dirty → `regenerate(state)` from a fresh snapshot (no-op when the text is unchanged); if dirty → `prompts.notifyDiskChange(label)` where `label` is `\`${uids.join(', ')} changed on disk\`` for ≤ 3 UIDs, else `\`${prefix} changed on disk\`` (default: `showWarningMessage(label, 'Reload', 'Keep my edits')`): `'reload'` → regenerate with a bumped `mtime`, then `showTextDocument(document)` and `executeCommand('workbench.action.files.revert')`; `'keep'` (or dismissed) → add the UIDs to `state.pendingDiskChange` and do **not** bump `mtime` (research §4).
- [X] T055 [US6] In `src/documentViewProvider.ts` `writeFile`, confirm the plan is always computed against the fresh snapshot loaded at the start of the save (T025) so blocks the user did not edit compare equal to the *current* disk content and are skipped even after "Keep my edits"; clear `state.pendingDiskChange` after a successful regeneration.

### Tests for User Story 6

- [X] T056 [US6] In `src/test/regressionFixture.test.ts` `Document View (019)`, inside `withRestoredFixture`: (a) open `REQ` (clean), rewrite `REQ-001.yml` on disk with a changed `text:` via `fs.writeFile`, wait up to 2 s polling the view text → it contains the new text and the document is not dirty; (b) make an unsaved edit to REQ-005's body in the view, stub `prompts.notifyDiskChange` to record its label and answer `'keep'`, rewrite `REQ-002.yml` on disk → the label equals `REQ-002 changed on disk`; then save the view → REQ-005's edit is written, `REQ-002.yml` keeps its on-disk text, and the reloaded view shows both; (c) repeat with the stub answering `'reload'` → the view's REQ-005 edit is gone, the document is clean and shows REQ-002's new text.

**Checkpoint**: Mixed workflows (item tabs, commands, git) cannot leave the view stale or clobber disk changes.

---

## Phase 9: User Story 7 - See block boundaries at a glance (Priority: P3)

**Goal**: Managed lines are dimmed; every second item block carries a subtle whole-line background from the theme colour `doorstop.documentView.altBlockBackground` (light/dark/high-contrast defaults, user-overridable); tints follow the text while editing.

**Independent Test**: Open `REQ` as document: separators appear dimmed/italic; blocks alternate tint; insert lines in a block and after typing stops the tint still covers exactly that block; override the colour in settings and see it applied. Automated: colour contribution assertion in `packageMenus.test.ts` (decorations themselves are not observable via the API — quickstart step 1).

### Implementation for User Story 7

- [X] T057 [US7] In `src/documentViewLanguage.ts`, create two decoration types once: `separatorDecoration = createTextEditorDecorationType({ opacity: '0.55', fontStyle: 'italic' })` and `altBlockDecoration = createTextEditorDecorationType({ isWholeLine: true, backgroundColor: new vscode.ThemeColor('doorstop.documentView.altBlockBackground') })`; in the debounced scan compute the ranges from the parsed blocks (every managed line; every second `item`/`placeholder` block from its separator line through `endLine`) and apply them with `editor.setDecorations` to every `vscode.window.visibleTextEditors` entry whose `document.uri` is the view; re-apply on `onDidChangeVisibleTextEditors`; dispose both types on deactivation.
- [X] T058 [US7] In `package.json`, add `contributes.colors` with the entry from contracts/commands-and-ui.md (`id: doorstop.documentView.altBlockBackground`, description, `defaults: { dark: "#ffffff0a", light: "#0000000a", highContrast: "#ffffff1f", highContrastLight: "#0000001f" }`). Run `npm run compile`.

### Tests for User Story 7

- [X] T059 [P] [US7] In `src/test/packageMenus.test.ts`, assert `contributes.colors` contains `doorstop.documentView.altBlockBackground` with all four default keys present and valid `#rrggbbaa` strings.

**Checkpoint**: All seven stories implemented.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [ ] T060 Record the three post-plan refinements in `specs/019-document-view/spec.md` under `## Clarifications` as `- Amendment (post-plan, confirmed by user): …` lines — (1) new item after a heading item `x.0` gets `x.1` (Doorstop's append-after-heading rule; FR-031a's sibling example unchanged), (2) one `Review` CodeLens entry whose label becomes `Do Review` while Doorstop reports a review problem (FR-034 "additionally" → "labelled"), (3) auto-save applies only dialog-free changes and otherwise asks for a manual save (new Assumptions bullet). If the user has not confirmed any of them, ask before editing the spec.
- [X] T061 [P] Update `README.md` (features list) and `CHANGELOG.md` with the Document View: how to open it, the read-only separators, `+ New item below`, the deletion confirmation, and the `doorstop.documentView.altBlockBackground` colour.
- [X] T062 [P] Update `server/README.md` API section with `PATCH /items/{uid}`, `DELETE /items/{uid}`, the extended `POST /documents/{prefix}/items` body and the `/tree` ordering guarantee (one line each, pointing at the routers).
- [ ] T063 Run the full quickstart.md walkthrough (12 steps + edge checks) in an F5 extension host on `testdata/regression`; fix anything that deviates from contracts/commands-and-ui.md's exact wording; finish with `git status testdata/` clean.
- [X] T064 Run `npm run compile`, `npm test` and `cd server && pytest -q` once more from a clean tree; confirm `.github/workflows/ci.yml` runs all three jobs green on the PR.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: after Setup. Blocks every story: server endpoints (T003–T009) are needed by US2/US3/US4; the model (T012–T015) and client hooks (T010–T011) by all.
- **US1 (Phase 3)**: after Foundational. Registers the provider and commands everything else hangs on.
- **US2 (Phase 4)**: after US1 (needs the provider's `writeFile` and `regenerate`).
- **US3 (Phase 5)**: after US2 (extends `planSave`/`writeFile`; creates the language layer).
- **US4 (Phase 6)**: after US3 (placeholders are parsed by the same model and confirmed by the same save path; `Cancel` lens arrives with US5 but the command exists here).
- **US5 (Phase 7)**: after US3 (CodeLens/code actions live in the language layer); T049–T051 are independent of everything after Foundational.
- **US6 (Phase 8)**: after US2 (watcher + regenerate); independent of US3–US5.
- **US7 (Phase 9)**: after US3 (uses the language layer's scan); independent of US4–US6.
- **Polish (Phase 10)**: after all desired stories.

### Within Each Story

- Model (`documentViewModel.ts`) before provider (`documentViewProvider.ts`) before language layer (`documentViewLanguage.ts`) before `package.json`/`extension.ts` wiring.
- Unit tests for the model can be written before or alongside the model tasks; extension-host tests come last in each phase because they need the wiring.

### Parallel Opportunities

- Phase 2: T007, T008, T009 (three pytest files) in parallel after T003–T006; T010, T011, T015 in parallel with the server work.
- Phase 3: T022 (manifest test) parallel to T016–T021.
- Phase 4/5/6: the model unit tests (T028, T037, T043) parallel to the provider work of the same phase.
- Phase 7: T049, T050, T051 (three different existing files) in parallel with T045–T048.
- Phase 9: T059 parallel to T057–T058.
- Phase 10: T061, T062 in parallel.

---

## Parallel Example: Phase 2 (Foundational)

```bash
# After T003–T006 land, run the three server test tasks together:
Task: "T007 pytest cases for PATCH/DELETE in server/tests/test_items.py"
Task: "T008 pytest cases for POST after/header/text in server/tests/test_documents.py"
Task: "T009 pytest case for /tree ordering in server/tests/test_tree.py"

# Meanwhile on the extension side:
Task: "T010 add 'PATCH' to request() in src/doorstopServer.ts"
Task: "T011 export levelDepth from src/requirementTree.ts"
Task: "T015 render/parse unit tests in src/test/documentViewModel.test.ts"
```

## Parallel Example: Phase 7 (User Story 5)

```bash
Task: "T049 doorstop.link accepts { childUid } in src/doorstopCommands.ts"
Task: "T050 hover selector gains the document-view scheme in src/hoverProvider.ts"
Task: "T051 reference provider answers on separator UIDs in src/definitionProvider.ts"
```

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Phase 1 (T001–T002) and Phase 2 (T003–T015).
2. Phase 3 (US1): a readable merged document with the tree/palette entry points.
3. Phase 4 (US2): edit + save through the server, regeneration after save.
4. **STOP and VALIDATE**: quickstart steps 1–3; `git diff testdata/` shows only the intended item files.

US3 (protection) should follow immediately before the view is shown to non-technical users — it is P1 in the spec for that reason; the MVP cut above is only the smallest *demonstrable* slice.

### Incremental Delivery

1. US1 → view opens (demo: reading).
2. US2 → editing works (demo: edit + save).
3. US3 → safe for everyone (demo: deletion dialog, refused save, revert).
4. US4 → new items in place.
5. US5 → actions + problems in the view.
6. US6 → disk consistency.
7. US7 → striping/colour.
8. Polish.

### Parallel Team Strategy

After Phase 2: developer A takes US1 → US2 → US3 (sequential, same files); developer B takes the server-side polish and T049–T051 + US6's watcher design; once US3 lands, developer B takes US5 while A takes US4, then US7 by whoever is free.

---

## Notes

- Every save-path test must run inside `withRestoredFixture` (T029): Doorstop's reorder can rewrite several fixture files and `isRegressionFixtureTree` requires exactly 10 REQ items.
- Never call `/tree` or the server from the language layer's scan — it must stay synchronous and network-free like `reviewCodeActionProvider.ts`; the projection consumes what `ProblemsProvider` already fetched.
- `mtime` discipline (data-model.md invariant 1) is what keeps VS Code's own "content is newer" conflict dialog out of the picture; do not bump it on "Keep my edits".
- Exact user-facing strings live in contracts/commands-and-ui.md; tests assert them verbatim.

---

## Phase 11: Convergence

- [ ] T065 Make a placeholder with no item block above it become the document's **first** item, not the last, per spec Edge Cases "Placeholder with no block above" / Assumptions "Placeholder position and level" (partial). Server: extend `AddItemRequest` in `server/src/doorstop_server/schemas.py` with `first: Optional[bool] = None` (mutually exclusive with `after`/`level` → 422 `INVALID_REQUEST`); in `server/src/doorstop_server/routers/documents.py` `add_item`, when `body.first` and the document has active items, use `level = document.items[0].level` (the first item's exact level — a copy — so `Document.add_item(level=…)` and Doorstop's `reorder(keep=item)` shift the former first item and its followers), else Doorstop's default; add pytest cases in `server/tests/test_documents.py` (`first` in a document with items `1.0`, `1.1`, `1.2` → new item `1.0`, followers renumbered; `first` on an empty document → `1.0`; `first` + `after` → 422). Extension: in `src/documentViewProvider.ts` `saveView`, send `{ first: true }` instead of no position when `creation.afterUid` is undefined and `state.snapshot` has at least one active item; update `specs/019-document-view/contracts/server-api.md`; add a fixture test in `src/test/regressionFixture.test.ts` (placeholder inserted via `doorstop.documentView.newItemBelow` on line 0 of the `REQ` view, saved → the new item is the first block and `REQ-001` is renumbered) inside `withRestoredFixture`.
- [ ] T066 Cover the partial-save-failure path with a CI-runnable test per FR-021a / US2 scenario 9 (partial). In `src/test/regressionFixture.test.ts` `Document View (019)`, inside `withRestoredFixture`: open `REQ`, edit the bodies of `REQ-002` and `REQ-005`, make `testdata/regression/REQ-005.yml` read-only (`fs.chmod(file, 0o444)`; restore the mode in `finally` before the fixture restore), capture `documentView.prompts.reportError`, `document.save()` → resolves `false`; assert `/tree` shows the new `REQ-002` text and the old `REQ-005` text, the captured message matches `Doorstop: 1 of 2 changes could not be saved: REQ-005 (…). The failed blocks keep your edits.`, `document.isDirty === true`, and the view text still contains the `REQ-005` edit. If Windows ignores the read-only bit for the server process, fall back to replacing `REQ-005.yml` with a directory of the same name for the duration of the save.
- [ ] T067 Resolve the spec-vs-implementation divergences the plan introduced per FR-034, FR-031a and the auto-save assumption (contradicts): after the user confirms, append to `specs/019-document-view/spec.md` `## Clarifications` three lines `- Amendment (post-plan, confirmed by user): …` — (1) one `Review` action-line entry whose label is `Do Review` while Doorstop reports a review problem (replaces "additionally" in FR-034 and US5 scenario 2), (2) a new item after a heading item `x.0` gets `x.1`, Doorstop's append-after-heading rule (FR-031a's `1.2 → 1.3` example unchanged), (3) auto-save (`files.autoSave`) applies only dialog-free changes and otherwise asks for a manual save once (new Assumptions bullet). If the user rejects (1), instead add a separate `Do Review` lens in `src/documentViewLanguage.ts` and keep `Review` always present; if (2) is rejected, change `_level_after` in `server/src/doorstop_server/routers/documents.py` to `anchor.level + 1` unconditionally and update `test_add_item_after_heading_item`. This supersedes T060.
