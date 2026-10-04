---

description: "Task list for Filter Notebooks (MVP)"
---

# Tasks: Filter Notebooks (MVP)

**Input**: Design documents from `specs/022-filter-notebooks/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included. Constitution Principle VI requires a CI-run test per feature, and spec Assumptions name one.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)

---

## Phase 1: Setup

- [X] T001 Add the notebook type and command to `package.json`: under `contributes.notebooks` add `{ "type": "doorstop-filter", "displayName": "Doorstop Filter", "selector": [{ "filenamePattern": "*.doorstop-filter" }] }`; under `contributes.commands` add `{ "command": "doorstop.newFilterNotebook", "title": "New Filter Notebook", "category": "Doorstop" }` (match the title/category style of the existing commands in that file)
- [X] T002 [P] Add a `filterNotebook` label to `.vscode-test.mjs` with `files: 'out/test/filterNotebook.test.js'`, no `workspaceFolder`, and a comment in the style of the `statusReport` entry ("pure serializer / rendering, no workspace, no server — spec 022")

---

## Phase 2: Foundational (blocks all stories)

- [X] T003 [P] Add Pydantic models to `server/src/doorstop_server/schemas.py` per [contracts/filter-api.md](contracts/filter-api.md): `FilterRequest(query: str)`, `FilterItem(uid: str, documentPrefix: str, level: str, header: Optional[str] = None, text: Optional[str] = None, path: str)`, `FilterResponse(items: List[FilterItem])`
- [X] T004 [P] Add the matching `FilterItem` and `FilterResponse` interfaces to `src/doorstopTypes.ts`
- [X] T005 Create `server/src/doorstop_server/routers/filters.py` with `router = APIRouter()` and `@router.post("/filter", response_model=FilterResponse)`. The handler calls `tree.load()` (via `Depends(get_tree)`, like `routers/tree.py`), then `compile_filter(request.query)`, which returns a predicate `item -> bool`, then iterates `for document in tree: for item in sorted(document)` (same order as `routers/tree.py`, inactive items included) and returns a `FilterItem` for each match (`header`/`text` as `str(...)` or `None`, `path=item.path`, `level=str(item.level)`). Implement `compile_filter` so far as: a blank/whitespace query raises `DoorstopApiError(400, "INVALID_FILTER", "Filter is empty")`, and `yaml.safe_load` errors raise `DoorstopApiError(400, "INVALID_FILTER", ...)` with the message including `line {problem_mark.line + 1}` when the mark is present. Register it in `server/src/doorstop_server/app.py` with `app.include_router(filters.router)`
- [X] T006 Create `src/filterNotebook.ts` with an exported `FilterNotebookSerializer` (`vscode.NotebookSerializer`) per [contracts/notebook-file.md](contracts/notebook-file.md). `deserializeContent`: 0 bytes → no cells; otherwise `JSON.parse`. Missing or non-array `cells` throws `Error('Not a Doorstop filter notebook: …')` so VS Code shows an error and never overwrites the file. `kind: "markdown"` → `NotebookCellKind.Markup` with language `markdown`; `kind: "filter"` → `NotebookCellKind.Code` with language `yaml`. `serializeNotebook`: write `{ cells: [{ kind, value }] }` with `JSON.stringify(…, null, 2) + '\n'`, never outputs. Export `registerFilterNotebook(context, server: DoorstopServer)`, which registers the serializer for `'doorstop-filter'` (more registrations are added in US1). Call it from `activate` in `src/extension.ts` next to the other registrations, passing `doorstopServer`

**Checkpoint**: `POST /filter` exists and rejects blank or broken YAML; `.doorstop-filter` files open as notebooks.

---

## Phase 3: User Story 1 — Run a filter cell and get a table (P1) 🎯 MVP

**Goal**: Write a filter on standard attributes, run it, and see a table of matching items with a count. New notebooks start with help text and a runnable example.

**Independent Test**: Run *Doorstop: New Filter Notebook*, run the example cell, then add `document == "REQ"` and run it → only REQ items with "N items matched" (quickstart steps 1–2).

### Tests for User Story 1

- [X] T007 [P] [US1] Create `server/tests/test_filter.py` using the `client`/`document` fixtures from `server/tests/conftest.py`. Add a child document `TST` (`POST /documents` with `parentPrefix: "REQ"`, `separator: "-"`) and items via `POST /documents/{prefix}/items`; review one item with `POST /review`. Tests:
  - `document == "REQ"` returns exactly the REQ UIDs in tree order.
  - `reviewed == false` excludes the reviewed item.
  - `header.startsWith(...)`, `text.contains(...)` and `ref.isEmpty()` work.
  - `level >= "1.2"` uses Doorstop level order.
  - A filter matching nothing → 200 with `items == []`.
  - A blank query → 400 `INVALID_FILTER`.
  - `"and: ["` → 400 `INVALID_FILTER` with `"line"` in the message.
  - `__import__("os")` and `uid.__class__ == 1` → 400 `INVALID_FILTER`.
  - The new-notebook example `"and:\n  - active == true\n  - reviewed == false\n"` → 200. Add a comment: keep in sync with `NEW_NOTEBOOK_CELLS` in `src/filterNotebook.ts`.
- [X] T008 [P] [US1] Create `src/test/filterNotebook.test.ts` (pure, in the style of `src/test/statusReport.test.ts`). Test `renderResults`:
  - 2 items → starts with `**2 items matched**` plus a 4-column table `UID | Document | Level | Header`.
  - An item without a header shows the first 80 characters of its text.
  - `|` and newlines in values are escaped.
  - `[]` → `No items matched.`

  Test `NEW_NOTEBOOK_CELLS`: exactly one `markdown` cell then one `filter` cell; the markdown mentions `and`, `or`, `not`, `hasChild`, `hasParent`, `contains`, `startsWith`, `isEmpty`.

### Implementation for User Story 1

- [X] T009 [US1] In `server/src/doorstop_server/routers/filters.py`, implement the leaf expression compiler per [contracts/filter-syntax.md](contracts/filter-syntax.md) and research R3/R4:
  - Parse with `ast.parse(expr, mode="eval")`; a `SyntaxError` → `INVALID_FILTER` quoting the expression.
  - Allow only: a `Compare` with exactly one op in `== != < <= > >=`, whose left side is a `Name` and right side a literal; a `Call` whose `func` is `Attribute(value=Name, attr in {"contains","startsWith","isEmpty"})`, with exactly one literal arg (zero for `isEmpty`) and no keywords. Literals are `Constant` (str/int/float/bool/None) or the names `true`/`false`/`null`. Anything else → `INVALID_FILTER` naming the expression and suggesting `and:`/`or:`/`not:` for `!`, `&&`, `||`.
  - Standard attributes per [data-model.md](data-model.md) "Item view": `uid`, `document` (`str(item.document.prefix)`), `level` (`item.level`), `header`/`text`/`ref` (`str(...)` or `""`), `active`/`normative`/`derived`/`reviewed` (bool), `links` (`[str(u) for u in item.links]`).
  - Semantics: `None` never matches a compare/`contains`/`startsWith`; `isEmpty()` is true for `None`, `""`, `[]`. When either side is `level`, wrap the literal in `doorstop.core.types.Level(str(literal))`. A `TypeError` during comparison → `False`. `contains` is a case-sensitive substring on `str` and membership on `list`. Never call `eval`.
- [X] T010 [US1] In `server/src/doorstop_server/routers/filters.py`, implement the recursive `_compile(node)`. A `str` → leaf (T009). A `dict` must have exactly one key: `and`/`or`/`not` take a non-empty list of filters (`all` / `any` / `not any`); anything else → `INVALID_FILTER` naming the key. All compilation finishes before any item is evaluated, so a malformed filter fails even on an empty project. (`hasChild`/`hasParent` are added in US4.)
- [X] T011 [US1] In `src/filterNotebook.ts`, export a pure `renderResults(items: FilterItem[]): string` per [contracts/notebook-file.md](contracts/notebook-file.md) "Cell output": `**N items matched**` (singular "item" for 1), a blank line, then the table `UID | Document | Level | Header`. Header falls back to the first 80 characters of `text`. Escape `|` as `\|` and replace `\r?\n` with a space. For `[]` return `No items matched.` For now the UID cell is plain text; US2 turns it into a link.
- [X] T012 [US1] In `src/filterNotebook.ts`, create a `vscode.notebooks.createNotebookController('doorstop-filter-controller', 'doorstop-filter', 'Doorstop Filter')` inside `registerFilterNotebook`, with `supportedLanguages = ['yaml']` and `supportsExecutionOrder = true`. For each cell the execute handler does `createNotebookCellExecution`, then `start(Date.now())`:
  - Blank text → a markdown hint ("Write a filter, e.g. `document == \"REQ\"`") and `end(true)`, without calling the server.
  - Otherwise `server.request<FilterResponse>('POST', '/filter', { query })` → `replaceOutput` with `NotebookCellOutputItem.text(renderResults(items), 'text/markdown')`, then `end(true)`.
  - On any thrown error → `NotebookCellOutputItem.error(new Error(message))`, where a `DoorstopApiError` uses its message and anything else becomes `Doorstop server is not available: …`; then `end(false)`. A failed run never shows a table.

  Push the controller into `context.subscriptions`.
- [X] T013 [US1] In `src/filterNotebook.ts`, export `NEW_NOTEBOOK_CELLS` (array of `{ kind, value }`):
  1. A markdown cell: a short intro (each code cell is one filter; run it with ▶ or Ctrl+Enter; results list matching Doorstop items) and a cheat-sheet listing the attributes, the operators `== != < <= > >=`, the methods `contains("…")`, `startsWith("…")`, `isEmpty()`, the groups `and:` / `or:` / `not:`, `hasChild:` / `hasParent:`, the note that levels are written as strings (`level >= "1.2"`), and one nested example.
  2. A filter cell `and:\n  - active == true\n  - reviewed == false\n`.

  Register command `doorstop.newFilterNotebook`: `vscode.workspace.openNotebookDocument('doorstop-filter', new vscode.NotebookData(cells))`, then `vscode.window.showNotebookDocument(doc)`.

**Checkpoint**: US1 works end to end; `pytest server/tests/test_filter.py` and `npx vscode-test --label filterNotebook` pass.

---

## Phase 4: User Story 2 — Open an item from the result table (P1)

**Goal**: UIDs in the table are clickable and open the item file.

**Independent Test**: Run any filter with results, click a UID → the item file opens (quickstart step 3).

- [X] T014 [P] [US2] In `src/test/filterNotebook.test.ts`, assert that each UID cell of `renderResults` is `[UID](<vscode.Uri.file(path).toString()>)`, including a path containing spaces
- [X] T015 [US2] In `renderResults` in `src/filterNotebook.ts`, render the UID as `[${uid}](${vscode.Uri.file(item.path).toString()})`
- [ ] T016 [US2] Manually run quickstart step 3 in the Extension Development Host. If clicking does nothing, apply research R7's fallback: a `command:` link to a new internal `doorstop.filter.openItem` command that runs `vscode.window.showTextDocument(vscode.Uri.file(path))` and shows `showWarningMessage('Item no longer exists: …')` when the file is missing. Record the result in a `ponytail:` comment above `renderResults`

**Checkpoint**: US1 + US2 together cover the MVP.

---

## Phase 5: User Story 3 — Nested AND / OR / NOT (P2)

**Goal**: Groups nest to any depth with Bases semantics. The groups were implemented in T010 because the new-notebook example needs `and`; this phase proves the nesting.

**Independent Test**: A cell with `and` holding a condition and an `or` sub-group returns the hand-computed set (quickstart step 4).

- [X] T017 [P] [US3] Add to `server/tests/test_filter.py`:
  - `or` of two documents returns both.
  - `not` excludes the matches of any listed filter.
  - A 3-level nesting (`and` → `or` → `not`) equals the hand-computed set.
  - Structure errors → 400 `INVALID_FILTER`: a mapping with two keys, an empty group list, an unknown key `foo:`, and a non-string/non-mapping leaf (e.g. `and: [42]`).

**Checkpoint**: Nesting is verified; no new code expected. Fix `_compile` in `server/src/doorstop_server/routers/filters.py` if a test fails.

---

## Phase 6: User Story 4 — Custom attributes and related items (P2)

**Goal**: Filter on custom attributes, on `links`, and with `hasChild:` / `hasParent:`.

**Independent Test**: With `status: approved` on one TST child, `and: [document == "REQ", hasChild: status == "approved"]` lists only its parent (quickstart step 5).

- [X] T018 [P] [US4] Add to `server/tests/test_filter.py`. Set custom attributes through Doorstop (`tree.find_item(uid).set("status", "approved")`, like `set_item_attributes` in `conftest.py`) and link items with `POST /items/{child}/links` `{"parentUid": …}`. Tests:
  - `status == "approved"` matches only that item, and items without `status` don't match and don't error.
  - `links.contains("REQ-001")`.
  - `hasChild: status == "approved"` (REQ-001 listed, REQ-002 with only non-approved children not).
  - `hasParent: document == "REQ"`.
  - `hasChild:` with a nested `and` group (a child must satisfy the whole group).
  - An item without children doesn't match `hasChild`, but matches `not: [hasChild: …]`.
  - A link to an unknown UID (`POST /items/{child}/links` to a nonexistent parent, as `test_tree_link_to_dangling_parent_is_suspect` does) is ignored by `hasParent`.
- [X] T019 [US4] In `server/src/doorstop_server/routers/filters.py`, add custom attribute lookup: any name not in the standard set resolves through `item.get(name)`, and a callable or missing value → `None`
- [X] T020 [US4] In `server/src/doorstop_server/routers/filters.py`, add `hasChild` / `hasParent` keys to `_compile` (value is one filter, compiled recursively). Build `items_by_uid` and `children_by_uid` once per request in the handler, in one pass over the tree, and pass them into the compiled predicates (e.g. predicates take `(item, ctx)`). `hasChild` → `any(f(c) for c in children_by_uid[uid])`; `hasParent` → `any(f(items_by_uid[u]) for u in links if u in items_by_uid)`. Direct relations only

**Checkpoint**: All filter capabilities in FR-006 to FR-009 and FR-007a are tested.

---

## Phase 7: User Story 5 — Save and reopen (P3)

**Goal**: Notebooks round-trip through `*.doorstop-filter` files without outputs.

**Independent Test**: Save, close, reopen → the same cells; running them shows current data (quickstart step 7).

- [X] T021 [P] [US5] Add to `src/test/filterNotebook.test.ts`:
  - `FilterNotebookSerializer` round-trips a markdown cell plus a filter cell; kinds and languages are preserved.
  - Serialized JSON contains no `outputs` even when the cell data has outputs.
  - Empty bytes → zero cells.
  - Invalid JSON and `{}` → throws.
- [ ] T022 [US5] Manually run quickstart step 7. Save As from an untitled notebook must offer/keep the `.doorstop-filter` extension; if it doesn't, document the filename in the markdown help cell in `NEW_NOTEBOOK_CELLS` in `src/filterNotebook.ts`

---

## Phase 8: Polish

- [X] T023 [P] Add a "Filter notebooks" section to `README.md`: the command, the syntax summary with 2–3 examples from [contracts/filter-syntax.md](contracts/filter-syntax.md), and the limits (no `!`/`&&`/`||`, direct relations only)
- [X] T024 [P] Add a spec-022 entry to `CHANGELOG.md` in the existing style
- [X] T025 Run `npm run compile` (type-check + lint + build), `pytest server/tests` and `npm test`; fix any failures
- [ ] T026 Run the remaining manual checks in [quickstart.md](quickstart.md) (steps 1, 2, 4–6), including the server-down error

---

## Dependencies & Execution Order

- **Setup (T001–T002)** → **Foundational (T003–T006)** → stories.
- **US1 (T007–T013)** needs the Foundational phase. It's the MVP core and every other story builds on its compiler and controller.
- **US2 (T014–T016)** needs T011.
- **US3 (T017)** needs T010.
- **US4 (T018–T020)** needs T009–T010. T020 changes the predicate signature, so do T019 before T020.
- **US5 (T021–T022)** needs only T006 and can run any time after Foundational.
- **Polish** comes after the stories you plan to ship.

Within `server/src/doorstop_server/routers/filters.py`, T005 → T009 → T010 → T019 → T020 are sequential (same file). Within `src/filterNotebook.ts`, T006 → T011 → T012 → T013 → T015 are sequential.

## Parallel Opportunities

```text
Setup:        T001 ‖ T002
Foundational: T003 ‖ T004, then T005 (server) ‖ T006 (extension)
US1:          T007 ‖ T008 (tests); T009→T010 (server) ‖ T011→T012→T013 (extension)
Later:        T017 (US3) ‖ T018 (US4) ‖ T021 (US5)  — all test-only, different concerns
Polish:       T023 ‖ T024
```

## Implementation Strategy

1. **MVP**: Setup → Foundational → US1 → US2. Stop and validate with quickstart steps 1–3; this already answers "which items match X" with clickable results.
2. **Increment 2**: US3 (tests only) + US4 (custom attributes, `hasChild`/`hasParent`), then validate quickstart steps 4–5.
3. **Increment 3**: US5 + Polish.

## Notes

- No new dependencies: PyYAML ships with Doorstop, `ast` is stdlib, and the notebook API is built into VS Code.
- Mark deliberate shortcuts with `ponytail:` comments (see the plan's Complexity Tracking table).
- Commit after each phase checkpoint.

## Phase 9: Convergence

- [X] T027 Add an `isNotEmpty()` method (arity 0, the exact negation of `isEmpty()`: true unless the value is `None`, `""` or `[]`) to `_METHOD_ARITY` / `_call` in `server/src/doorstop_server/routers/filters.py`, list it in [contracts/filter-syntax.md](contracts/filter-syntax.md), the `HELP` text in `src/filterNotebook.ts` and the README "Filter Notebooks" section, and cover it in `server/tests/test_filter.py` (`ref.isNotEmpty()` → only REQ-002; `status.isNotEmpty()` → only TST items) per FR-008 (partial)

## Phase 10: Convergence

- [X] T028 CRITICAL: Make result UIDs clickable through a notebook output renderer, since VS Code ignores `file:` links (and all but a few built-in `command:` links) in notebook outputs. (a) In `package.json` add `contributes.notebookRenderer`: `[{ "id": "doorstop-filter-results", "displayName": "Doorstop Filter Results", "entrypoint": "./dist/webview/filterResults/renderer.js", "mimeTypes": ["application/vnd.doorstop.filter-results+json"], "requiresMessaging": "always" }]`. (b) Create `src/webview/filterResults/renderer.js` as a plain ES module; `esbuild.js` already copies `src/webview/` to `dist/webview/`, so no build change is needed. It does `export const activate = ctx => ({ renderOutputItem(item, element) { … } })`, reads `item.json()` (a `FilterItem[]`), and builds with `document.createElement` / `textContent` only (no `innerHTML`, so no escaping or injection) a `**N items matched**`-style count line plus a table `UID | Document | Level | Header`, with the header falling back to the first 80 characters of the text. Each UID is an `<a href="#">` whose click handler calls `preventDefault()` and `ctx.postMessage({ type: 'open', path })`. Style it with VS Code theme variables (`--vscode-textLink-foreground`, `--vscode-panel-border`). (c) In `src/filterNotebook.ts`, replace the markdown table output with a single item `vscode.NotebookCellOutputItem.json(response.items, 'application/vnd.doorstop.filter-results+json')` when there are matches; keep the markdown `No items matched.` and the empty-cell hint as they are. Delete `renderResults` and its now-unused helpers. In `registerFilterNotebook`, add `vscode.notebooks.createRendererMessaging('doorstop-filter-results').onDidReceiveMessage(e => openFilterItem(e.message.path))` and push the listener into `context.subscriptions`. (d) Update [research.md](research.md) R7 and the "Cell output" table in [contracts/notebook-file.md](contracts/notebook-file.md) to describe the renderer instead of markdown links. Then re-run quickstart step 3 per FR-005, US2/AC1 (contradicts)
- [X] T029 Export `openFilterItem(path: string)` from `src/filterNotebook.ts`: `await vscode.workspace.fs.stat(vscode.Uri.file(path))`, then `vscode.window.showTextDocument(vscode.Uri.file(path), { preview: false })`; if `stat` throws, show `vscode.window.showWarningMessage(\`Item no longer exists: ${path}\`)` and nothing else, so a deleted item gives the message instead of breaking per US2/AC2 (partial)
- [X] T030 Rework `src/test/filterNotebook.test.ts` for the renderer path. Remove the `renderResults` markdown/link tests. Add: (1) a test that the cell output for matches is one item with mime `application/vnd.doorstop.filter-results+json` whose decoded JSON equals the server items. To make this testable without a server, factor a pure exported `resultOutput(items: FilterItem[]): vscode.NotebookCellOutput` in `src/filterNotebook.ts` that returns the JSON output for non-empty and the markdown `No items matched.` for empty. (2) `openFilterItem` on a temp file (`fs.mkdtempSync` + write) opens it as the active editor. (3) `openFilterItem` on a missing path does not throw and opens no editor. (4) `package.json` declares the `doorstop-filter-results` renderer with that mime and the entrypoint file exists under `src/webview/filterResults/` per Constitution VI, FR-005 (partial)

## Phase 11: Convergence

- [X] T031 Add `this.createNode('New Filter Notebook', 'filter', 'doorstop.newFilterNotebook')` to the `nodes` array in `src/commandsProvider.ts` (after *Generate Status Report*), and add a test to `src/test/filterNotebook.test.ts` asserting that `new DoorstopCommandsProvider().getChildren()` contains a node whose `command.command` is `doorstop.newFilterNotebook` per FR-002 (missing)
- [X] T032 Support the Bases-style cell shape in `server/src/doorstop_server/routers/filters.py`. When the parsed YAML is a mapping whose keys are exactly `{filters}` or `{filters, order}`, compile `filters` as the filter. `order` must be a list of strings; anything else → `INVALID_FILTER` "`order:` must be a list of attribute names". Drop `uid` from it. Any other mapping keeps going through the existing group/relation compiler. Make `compile_filter` return `(predicate, columns)`, where `columns` defaults to `["document", "level", "header"]` when there's no `order:`. Extend `server/src/doorstop_server/schemas.py`: `FilterResponse.columns: List[str]` and `FilterItem.values: List[str]`, aligned with `columns`. Keep the existing `FilterItem` fields. Build each value with `_value(item, name)`: `None` → `""`; a list → `", ".join(map(str, v))`; everything else → `str(v)`, cut to the first 80 characters. In default mode only (no `order:`), an empty `header` falls back to the first 80 characters of `text`. Mirror the new fields in `FilterItem` / `FilterResponse` in `src/doorstopTypes.ts` per FR-015, US6/AC1–AC5 (missing)
- [X] T033 Render the table from the response's columns. In `src/filterNotebook.ts` the JSON output payload becomes `{ columns: response.columns, items: response.items }` (instead of the bare `items` array T028 describes). In `src/webview/filterResults/renderer.js` the header row is `UID` followed by `columns`, and each row is the clickable UID followed by `item.values`, using `textContent` only. Drop the renderer's own header→text fallback, since the server now sends final values. T030's output test must expect `{ columns, items }` per FR-004, US6/AC1–AC4 (partial)
- [X] T034 Add US6 tests to `server/tests/test_filter.py` (using the existing `project` fixture):
  - (1) `filters: document == "TST"` + `order: [status, header]` → `columns == ["status", "header"]`, and the TST-001 values are `["approved", ""]`.
  - (2) A bare filter → `columns == ["document", "level", "header"]`, and REQ-003's header value is its text start.
  - (3) `order: [uid, status]` → `columns == ["status"]`.
  - (4) `order: [links]` on TST-001 → `"REQ-001"`, and a multi-link item is comma-separated.
  - (5) `order: 5`, `order: [1]`, and a mapping with `filters` plus an unknown key → 400 `INVALID_FILTER`.
  - (6) A value longer than 80 characters is cut to 80.

  Also add a `src/test/filterNotebook.test.ts` case that the output for a `{ columns, items }` response carries those columns unchanged per Constitution VI, US6 (missing)
- [X] T035 Document `order:` and the Commands panel entry. Update [contracts/filter-syntax.md](contracts/filter-syntax.md) (the grammar gains `cell := filter | { filters: filter, order: [attribute, ...] }` plus an example), [contracts/filter-api.md](contracts/filter-api.md) (`columns`, `values`, the new error), [contracts/notebook-file.md](contracts/notebook-file.md) (cell output columns, the Commands panel entry) and [data-model.md](data-model.md) (`FilterItem.values`, `FilterResponse.columns`). Add one `filters:` + `order:` example line to the `HELP` cheat-sheet in `src/filterNotebook.ts` and to the README "Filter Notebooks" section per FR-002, FR-015 (partial)

## Phase 12: Convergence

- [X] T036 Accept custom attribute names containing `-` in conditions, e.g. `invented-by == "Claude"` and `invented-by.contains("Cl")`. Today `ast.parse` reads `invented-by` as the subtraction `invented - by` and `_compile_expression` rejects it. In `server/src/doorstop_server/routers/filters.py`, before `ast.parse`, match the leading attribute name with `re.match(r"\s*([A-Za-z_][\w-]*)", expr)`. If it contains `-`, replace that prefix with a placeholder identifier (e.g. `__attr__`) and map the placeholder back to the real name when building the predicate. Only the leading name is rewritten, so quoted literals and `-` in numbers on the right side stay untouched. Add tests to `server/tests/test_filter.py`: set `invented-by: Claude` on TST-001 via `set_custom`, then check that `invented-by == "Claude"` → `["TST-001"]`, that `invented-by.isNotEmpty()` → `["TST-001"]`, that `hasParent: invented-by == "x"` compiles, and that `order: [invented-by]` shows the value. Note in [contracts/filter-syntax.md](contracts/filter-syntax.md) (`attribute` may contain letters, digits, `_` and `-`) and in the `HELP` text in `src/filterNotebook.ts` that hyphenated names such as `invented-by` work per FR-007, US4/AC1 (partial)
