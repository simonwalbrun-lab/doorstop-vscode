---

description: "Task list for 036 Batch Edit Items"
---

# Tasks: Batch Edit Items

**Input**: Design documents from `specs/036-batch-edit-items/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/batch-edit.md](contracts/batch-edit.md)

**Tests**: Required. Constitution VI/VIII: every FR has a test with a
`# Spec 036 FR-…` (pytest) or `// Spec 036 FR-…` (vscode-test) trace comment
directly above the test function.

**Organization**: by user story; each story phase is shippable alone once
Phase 2 is done.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different files, no dependency on an unfinished task
- **[Story]**: US1 set field + selection + apply flow, US2 add/remove field,
  US3 list entries, US4 generate children, US5 autocomplete

## Conventions used by every task

- Server tests: new file server/tests/test_batch.py, using `client`,
  `project_root`, `add_document`, `add_item`, `link` and
  `set_item_attributes` from server/tests/conftest.py. Each test builds a
  temp project (`REQ` root with `separator: "-"`; `TST` below it where needed).
  Item files are read back with `doorstop.build(...)` or by reading the file.
- Server request: `client.post("/batch", json={"query": <cell text>, "uids": [...], "dryRun": False})`.
- Extension tests: new suites in src/test/filterNotebook.test.ts (existing
  vscode-test label `filterNotebook`, no workspace, fake server objects as in
  the existing suites).
- Edit syntax and error codes: [contracts/batch-edit.md](contracts/batch-edit.md).
  Operation names are exactly `set`, `add`, `remove`, `appendEntry`,
  `removeEntry`, `generateChildren`.

---

## Phase 1: Setup

No setup: no new dependency, no new test label (`filterNotebook` and the
pytest suite already run in CI).

---

## Phase 2: Foundational (blocks every story)

- [X] T001 Add to server/src/doorstop_server/schemas.py: `BatchRequest` (`query: str`, `uids: List[str]`, `dryRun: bool = False`), `BatchItemResult` (`uid: str`, `status: Literal["changed", "created", "overwritten", "skipped", "failed"]`, `reason: Optional[str] = None`, `created: Optional[str] = None`), `BatchResponse` (`results: List[BatchItemResult]`), and `editable: bool = False` on `FilterResponse`. Keep the comment style of the neighbouring models
- [X] T002 Create server/src/doorstop_server/routers/batch.py with `router = APIRouter()` and `compile_edit(node) -> list` that turns the parsed `edit:` value into a list of `(operation, params)` tuples. Rules, all raising before any item is touched (data-model.md "Validation"): not a non-empty list → `DoorstopApiError(400, "INVALID_EDIT", …)`; each entry must be a single-key mapping whose key is one of the six operation names, else `INVALID_EDIT` naming the unknown key; `set`/`add`/`appendEntry`/`removeEntry` take a non-empty mapping field → value; `remove` takes a field name or a list of names; `generateChildren` takes nothing (`None`) or a mapping with only the optional keys `document` (str), `force` (bool), `blank` (bool); field names must match `^[A-Za-z_][\w-]*$`; values must be "a scalar (string, number, true/false)" - `None`, lists and mappings → `INVALID_EDIT`; "`generateChildren` together with any other operation → `INVALID_EDIT`". Field-name policy (FR-012): `SETTABLE_STANDARD = {"active", "normative", "derived", "level", "text", "ref"}` allowed under `set` only; `uid`, `links`, `header`, `reviewed` and any other name for which `hasattr(Item, name)` is true → `DoorstopApiError(422, "PROTECTED_FIELD", "<name> cannot be changed by a batch edit")`; a `SETTABLE_STANDARD` name under any other operation → `PROTECTED_FIELD`. Error messages name the offending operation/field
- [X] T003 In server/src/doorstop_server/routers/filters.py: `compile_filter` also accepts the key sets `{"filters", "edit"}` and `{"filters", "order", "edit"}`, calls `compile_edit(node["edit"])` (import from routers/batch.py) and returns the compiled edit as a third tuple element (`None` without `edit:`). `filter_items` sets `editable=edit is not None` on the response. Update the module docstring's grammar sentence
- [X] T004 In server/src/doorstop_server/routers/batch.py add `POST /batch` (`BatchRequest` → `BatchResponse`, `tree=Depends(get_tree)`, `request: Request`): `_, _, edit = compile_filter(body.query)`; `edit is None` → `INVALID_EDIT` ("the cell has no edit: section"); empty `uids` → `INVALID_EDIT` ("nothing selected"); `load_items(tree)`; dispatch to `_apply_fields(tree, uids, edit, dry_run)` or `_generate_children(tree, uids, params, dry_run)` (stubs raising `NotImplementedError` until US1/US4); UIDs not found → `skipped`, reason `item not found`. Per item wrap work in `try/except Exception` → `failed` with `str(error)`; if any item failed set `request.app.state.tree_fingerprint = None` (research R6, comment why). Include the router in server/src/doorstop_server/app.py like the others
- [X] T005 [P] In src/doorstopTypes.ts add `editable?: boolean` to `FilterResponse` and `BatchItemResult` / `BatchResponse` interfaces mirroring T001 (doc comments like the neighbours)

**Checkpoint**: `POST /filter` accepts and validates `edit:`; `POST /batch` exists.

---

## Phase 3: User Story 1 - Select filtered items and set a field (P1) 🎯 MVP

**Goal**: tick rows of an editable result and `set` fields on them, with the unsaved-files check, confirmation, progress, summary and refresh.

**Independent Test**: three `TST` items with `testrun`, filter all, untick one, apply `set: {testrun: TR-2}` → two files changed, the third byte-equal.

### Tests for User Story 1

- [X] T006 [P] [US1] server/tests/test_batch.py:
  - `set` changes the field on ticked items that have it; an item without it is `skipped` with reason starting `field missing`; an unticked item's file is byte-for-byte unchanged (compare bytes before/after). `# Spec 036 FR-002, FR-004, FR-011`
  - `set` on `level`, `text`, `ref`, `active` changes them; other attributes keep their values. `# Spec 036 FR-004, FR-011, FR-012`
  - two operations in one edit (`set` then `set` another field) run in order, file saved once, status `changed`. `# Spec 036 FR-003`
  - invalid edits → 400 `INVALID_EDIT` and no file changed: unknown operation `apendEntry`, value as list, empty `edit: []`, no `edit:` section, empty `uids`. `# Spec 036 FR-003`
  - `set: {priority: 3, flag: true, ratio: 1.5}` on items that have those fields stores an int, a bool and a float (read back with `doorstop.build(...)` and `isinstance`), not strings. `# Spec 036 FR-004`
  - `set: {uid: X}`, `set: {links: X}`, `set: {header: X}`, `set: {reviewed: X}`, `set: {save: X}` and `add: {level: 2}` → 422 `PROTECTED_FIELD`, nothing written. `# Spec 036 FR-012`
  - `dryRun: true` returns the same statuses as the real run and writes nothing. `# Spec 036 FR-010`
  - an unknown UID is `skipped` / `item not found`; an item whose file is read-only (`os.chmod(path, stat.S_IREAD)`, restored in `finally`) is `failed` while the others are `changed`; the next `GET /tree` still answers correctly. `# Spec 036 FR-013`
- [X] T007 [P] [US1] server/tests/test_filter.py: a cell `filters: …` + `edit:` (with and without `order:`) runs and returns `editable: true`; a cell without `edit:` returns `editable: false`; a cell with an invalid `edit:` fails with `INVALID_EDIT`. `# Spec 036 FR-001, FR-003`
- [X] T008 [P] [US1] src/test/filterNotebook.test.ts, suite `Batch edit renderer (036)`, reusing the DOM-stub approach of the `Open as document` suite (extend the stub so `input` elements record `checked` and `change` handlers):
  - payload without `editable` draws no checkboxes and no "Apply to selected". `// Spec 036 FR-001`
  - `editable: true` draws one checkbox per row, all checked, plus a header checkbox that unticks/ticks all. `// Spec 036 FR-001`
  - "Apply to selected" posts `{ type: 'apply', query, uids }` with only ticked UIDs in table order and the payload's `query`. `// Spec 036 FR-002`
- [X] T009 [P] [US1] src/test/filterNotebook.test.ts, suite `Batch edit flow (036)`, calling exported `applyBatch` with a fake server recording requests and injected UI functions (see T012):
  - no UIDs → "Nothing selected." and no request. `// Spec 036 FR-002`
  - injected open documents: a dirty `yaml` file document, a dirty `markdown` document with scheme `doorstop-document` → error naming them, no request at all. A dirty `yaml` document with scheme `vscode-notebook-cell`, a dirty untitled markdown document, a dirty `plaintext` file and clean documents → the batch runs. `// Spec 036 FR-020`
  - confirm text contains item count, "will change" and "will be skipped" counts, and "existing items will be overwritten" only when a dry-run result is `overwritten`; Cancel → no real run. `// Spec 036 FR-010`
  - after the real run: summary text "X changed, Y skipped, Z failed" (warning when Z > 0), details markdown lists every UID with status, reason and created UID; `onChanged` called once. `// Spec 036 FR-014, FR-016`
  - both requests run inside the injected progress wrapper with title `Doorstop: Batch edit…`. `// Spec 036 FR-015`
  - a `DoorstopApiError` from the dry run → error message with the server text, no real run. `// Spec 036 FR-003`

### Implementation for User Story 1

- [X] T010 [US1] In server/src/doorstop_server/routers/batch.py implement `plan_item(data: dict, operations) -> tuple[dict, dict, list]` (pure: current values in; values to set, names to remove, per-operation outcomes out) for `set` (standard names are always present; a custom field is present when the key is in `data`), and `_apply_fields`: per UID, `plan_item` on `{**item.data}`, status `changed` if any operation applied else `skipped` with the joined reasons (`field missing: <name>`); real run only: `item.auto = False`, `item.set(name, value)` for each change, `item.save()` once. Leave clear extension points for US2/US3 operations
- [X] T011 [US1] src/webview/filterResults/renderer.js: when `payload.editable`, prepend a checkbox column (header checkbox ticks/unticks all; every row starts checked), and add a button "Apply to selected" next to "Open as document" that posts `{ type: 'apply', query: payload.query, uids }` with the checked UIDs in table order. Build DOM with `createElement`/`textContent` only, like the existing code; style the button with the existing `.doorstop-filter-open` class. Update the file's header comment (payload now also has `query`, `editable`)
- [X] T012 [US1] src/filterNotebook.ts:
  - `resultOutput(response, query)` puts `query` and `editable` into the JSON payload (update the existing caller in `runFilter` and the existing tests' calls).
  - export `applyBatch(server, query, uids, options)` where `options` = `{ onChanged, ui }` and `ui` defaults to the real VS Code calls (`showInformationMessage`/`showWarningMessage`/`showErrorMessage`, `workspace.textDocuments`, `withDelayedProgress`, opening an untitled markdown document). Flow exactly as contracts/batch-edit.md "User-facing flow" steps 1-6. Blocking documents (FR-020, research R7): `isDirty && !isUntitled && uri.scheme !== 'vscode-notebook-cell' && (languageId === 'markdown' || languageId === 'yaml')`; error text `Save or discard unsaved changes first: ` + up to three `path.basename(uri.path)` names (`, …` when more). Request `POST /batch` with `dryRun: true`, then `false`. Details markdown: a table `UID | Status | Reason | Created`.
  - the renderer-messaging handler handles `type === 'apply'` by calling `applyBatch`.
  - `registerFilterNotebook(context, server, onChanged?: () => void)`.
- [X] T013 [US1] src/extension.ts: declare `let refreshAfterBatch: (() => void) | undefined;` before the `registerFilterNotebook` call (line ~80), pass `() => refreshAfterBatch?.()` as its new argument, and set `refreshAfterBatch = onChanged;` right after `onChanged` is defined (line ~102)
- [X] T014 [US1] Add a short `**Batch edit**` paragraph to `HELP` in src/filterNotebook.ts: wrap the filter in `filters:`, add `edit:` with a list of `set` / `add` / `remove` / `appendEntry` / `removeEntry` / `generateChildren`, tick rows, "Apply to selected"; one example line `edit: [{set: {testrun: TR-1}}]`

**Checkpoint**: US1 independent test passes; quickstart §1-§3 work.

---

## Phase 4: User Story 2 - Add and remove fields (P2)

**Independent Test**: one item with and one without `result`; `add: {result: open}` then `remove: result`.

- [X] T015 [P] [US2] server/tests/test_batch.py: `add` sets the field on items without it and skips items with it (`field exists`, old value kept). `# Spec 036 FR-005`. `remove` (single name and list of names) drops the field from the file and skips items without it (`field missing`); `remove: active` → 422. `# Spec 036 FR-006, FR-012`
- [X] T016 [US2] In `plan_item` (server/src/doorstop_server/routers/batch.py) add `add` and `remove`; in `_apply_fields` apply removals with `item._data.pop(name, None)` before `save()`, with a `# ponytail: Doorstop 3.2 has no public way to delete an extended attribute; switch if Item gains one.` comment and `# pylint: disable=protected-access`

---

## Phase 5: User Story 3 - Append to / remove from list fields (P2)

**Independent Test**: lists `[TR-1]` and `[TR-1, TR-2]`; appendEntry `TR-2` → both `[TR-1, TR-2]`; removeEntry `TR-1` → both `[TR-2]`.

- [X] T017 [P] [US3] server/tests/test_batch.py: `appendEntry` adds at the end, skips `entry exists`, creates `[entry]` when missing, skips `not a list` for a scalar field. `# Spec 036 FR-007`. `removeEntry` removes every occurrence (list `[A, B, A]` → `[B]`), leaves an empty list in place, skips `field missing` / `not a list` / `entry missing`. `# Spec 036 FR-008`
- [X] T018 [US3] In `plan_item` (server/src/doorstop_server/routers/batch.py) add `appendEntry` and `removeEntry`; later operations in the same edit see the result of earlier ones (work on the copied dict)

---

## Phase 6: User Story 4 - Generate child items (P3)

**Independent Test**: `REQ-001`, `REQ-003` with child document `TST` (digits 3) → `TST-001`, `TST-003` created and linked.

- [X] T019 [P] [US4] server/tests/test_batch.py (`# Spec 036 FR-009` on each unless noted):
  - creates children numbered like the parents with the child's prefix and digit count (create `TST` via `add_document(..., digits=4)`; parents `REQ-001`, `REQ-003` → `TST-0001`, `TST-0003`, even when `TST-0005` already exists), each linked to its parent; result `created` = child UID.
  - single child document is used without `document:`; with two child documents and no `document:` → 409 `CHILD_DOCUMENT_REQUIRED`; `document:` naming a child works; naming a non-child → 409 `NOT_A_CHILD_DOCUMENT`; no child document → 409 `NO_CHILD_DOCUMENT`; ticked items from two documents → 409 `MIXED_DOCUMENTS`. Nothing written in every 409 case.
  - `generateChildren` combined with `set` → 400 `INVALID_EDIT`. `# Spec 036 FR-003`
  - existing target UID without `force` → `skipped` / `UID exists`, existing file unchanged. `# Spec 036 FR-018`
  - with `force` → `overwritten`, the file now holds default content plus the link only; dry run reports `overwritten` and writes nothing. `# Spec 036 FR-018, FR-010`
  - with `blank` → children get the child document's next free numbers in request order (send UIDs in reverse order and assert the numbering follows the request); `force` has no effect with `blank`. `# Spec 036 FR-019`
- [X] T020 [US4] Implement `_generate_children` in server/src/doorstop_server/routers/batch.py per research R5: resolve all items first (unknown → `skipped`/`item not found`); one source document or `MIXED_DOCUMENTS`; child documents = `[d for d in tree if d.parent == source_prefix]`; resolve target or the 409s above; per parent in request order: `blank` → `document.add_item()`; else target UID `UID(target.prefix, target.sep, parent.uid.number, target.digits)`, existing (`tree.find_item` inside `try/except DoorstopError`) → skip, or with `force` `target.remove_item(uid, reorder=False)` then `target.add_item(name=str(parent.uid.number))`; link with `tree.link_items(child.uid, parent.uid)`. Dry run computes the same statuses (`blank` reports `created` with the UIDs it would take: `next_number + i`) without calling any of these. Comment why `add_item(number=)` is not used (it takes `max(number, next_number)`)

---

## Phase 7: User Story 5 - Autocomplete in the `edit:` section (P2)

**Independent Test**: `testruns: [TR-1]` on an item; typing under `edit:` offers operations, the field `testruns` and the value `TR-1`.

- [X] T021 [P] [US5] server/tests/test_filter.py: `GET /filter/vocabulary` lists string entries of list-valued attributes as that attribute's values (`testruns: [TR-1, TR-2]` → `["TR-1", "TR-2"]`). `# Spec 036 FR-017`
- [X] T022 [P] [US5] src/test/filterNotebook.test.ts, suite `Edit section autocomplete (036)`, using the existing `labels()` helper pattern with a vocabulary including `testruns: ['TR-1']` (`// Spec 036 FR-017` on each):
  - empty top-level line offers `edit:` next to `filters:`.
  - a `  - ` line below `edit:` offers exactly the six operation names (no comparison operators, no `and:`).
  - inside `  - set: {` offers custom names plus `active`, `normative`, `derived`, `level`, `text`, `ref`, and never `uid`, `links`, `header`, `reviewed`; inside `  - appendEntry: {` offers custom names only.
  - after `  - appendEntry: {testruns: ` offers `TR-1`.
  - inside `  - generateChildren: {` offers `document`, `force`, `blank`; after `document: ` offers the prefixes.
  - item data is still loaded once (requests recorded as in the existing caching test). `// Spec 036 FR-017, SC-006`
- [X] T023 [US5] server/src/doorstop_server/routers/filters.py `filter_vocabulary`: for list values add each `str`/number/bool entry to the attribute's value set (keep the 50-value cap)
- [X] T024 [US5] src/filterCompletion.ts: add `['edit:', 'edit:\n  - $0']` to `KEY_SNIPPETS`; detect "inside the edit block" (nearest line above at column 0 that is a key is `edit:`) **before** the existing operator/method checks so `  - set ` does not offer `==`; then: line start → six operation snippets (`set: {${1:field}: ${2:value}}`, `add: …`, `remove: ${1:field}`, `appendEntry: …`, `removeEntry: …`, `generateChildren: {document: ${1}}`); field position after `<op>: {` or `, ` → names (custom from vocabulary; plus the six settable standard names only for `set`); value after `<field>: ` → `attributes[field]`; inside `generateChildren` → keys `document`, `force`, `blank`, and prefixes after `document: `. Same cache, no extra requests

---

## Phase 8: Polish & Cross-Cutting

- [X] T025 [P] server/tests/test_batch.py: performance test - 500 items in `TST` (create with Doorstop directly via `doorstop.build(...)` + `add_item()` for speed, each with `testrun: old`), one `POST /batch` with `set: {testrun: new}` over all 500 UIDs finishes in under 10 s (`time.perf_counter()`), all 500 `changed`. `# Spec 036 SC-002`
- [X] T026 Run `npm run compile`, `npm run pretest; npx vscode-test --label filterNotebook`, and in server/ `pytest tests/test_batch.py tests/test_filter.py` plus `pylint src/doorstop_server`; fix everything
- [X] T027 Check every `FR-0NN` of specs/036-batch-edit-items/spec.md (FR-001..FR-020) appears in at least one `Spec 036` trace comment (`git grep -n "Spec 036"`); add missing ones
- [X] T028 Update README.md filter-notebook section with two sentences on `edit:` and "Apply to selected", and CHANGELOG.md with one entry, matching existing style
- [ ] T029 Walk through specs/036-batch-edit-items/quickstart.md "Manual walkthrough" §1-§5 in the Extension Development Host (manual)

---

## Dependencies & Execution Order

- Phase 2 (T001-T005) blocks everything. T005 is independent of T001-T004.
- US1 (T006-T014) next: it builds the whole apply flow; US2-US4 only add server operations behind it.
- US2 (T015-T016) and US3 (T017-T018) both edit `plan_item` → run one after the other; their tests can be written in parallel.
- US4 (T019-T020) touches only `_generate_children` → parallel to US2/US3.
- US5 (T021-T024) is independent of US2-US4 (needs only Phase 2 for `edit:` to be a valid key).
- Polish after all stories.

### Parallel examples

- After Phase 2: T006, T007, T008, T009 (tests, different files/suites).
- After US1: US4 (T019-T020) ∥ US5 (T021-T024) ∥ US2→US3.

## Implementation Strategy

1. MVP: Phase 2 + US1 → set fields on ticked items end to end. Stop and validate with quickstart §1-§3.
2. US2 + US3: the remaining field operations (server only).
3. US4: child generation.
4. US5: autocomplete.
5. Polish.

## Phase 9: Convergence

- [X] T030 In src/filterCompletion.ts leave `edit:` out of the top-level key suggestions when the cell already has a line matching `^edit\s*:`, and add a case to the `Edit section autocomplete (036)` suite in src/test/filterNotebook.test.ts (`// Spec 036 FR-017`) per US5/AC1 (partial)
- [X] T031 Decide on date values in `edit:` (server/src/doorstop_server/routers/batch.py `_SCALARS` accepts `datetime.date`): either document dates as allowed in specs/036-batch-edit-items/contracts/batch-edit.md and data-model.md "Validation" and add a server/tests/test_batch.py case that `set: {due: 2026-11-30}` stores a date (`# Spec 036 FR-004`), or drop `datetime.date` from `_SCALARS` per data-model: Validation (unrequested)

## Phase 10: Convergence

- [X] T032 In server/src/doorstop_server/routers/batch.py `_check_value`, refuse a float for `level` with `INVALID_EDIT` and the message `Write levels in quotes, e.g. level: "1.10".` (YAML reads an unquoted `1.10` as 1.1); add a case to `test_set_standard_attributes` in server/tests/test_batch.py that `set: {level: 1.10}` returns 400 and writes nothing, and that `set: {level: "1.10"}` stores level 1.10 (`# Spec 036 FR-004`) per FR-004 (partial)
- [X] T033 In src/filterNotebook.ts `applyBatch`, keep a module-level `batchRunning` flag: while a batch is running (from the unsaved-files check until the summary), a further "Apply to selected" shows `A batch edit is already running.` and returns; reset the flag in a `finally`. Add a case to the `Batch edit flow (036)` suite in src/test/filterNotebook.test.ts that starts a second `applyBatch` while the first waits on its confirmation and asserts the second sends no request (`// Spec 036 FR-010, FR-019`) per FR-010 (partial)

## Phase 11: Convergence

- [X] T034 In server/src/doorstop_server/routers/batch.py read the `edit:` values with their quoting: compose the cell YAML (`yaml.compose`) and, for every value scalar of an operation (field values, list entries, `generateChildren` `document`), reject a plain (unquoted) scalar that resolves to text with `INVALID_EDIT` naming the value and asking for double quotes; numbers, `true`/`false` and dates stay unquoted; `level` must be quoted text (reject numbers for `level`, which also covers T032). Apply the same check where `compile_filter` validates `edit:` in routers/filters.py so the cell run reports it. Tests in server/tests/test_batch.py: `set: {testrun: TR-1}` → 400 naming `TR-1`, `set: {testrun: "TR-1"}` works, `set: {level: 1.10}` → 400, `set: {level: "1.10"}` stores 1.10, `generateChildren: {document: TST}` → 400 (`# Spec 036 FR-021`) per FR-021 (missing)
- [X] T035 In server/src/doorstop_server/routers/batch.py `_check_value` accept an empty list (`[]`) for `set` and `add` only (non-empty lists and lists for `appendEntry`/`removeEntry` stay invalid); tests in server/tests/test_batch.py: `add: {testruns: []}` creates an empty list field on items without it, `set: {testruns: []}` clears an existing list, `set: {testruns: [a]}` → 400 (`# Spec 036 FR-004, FR-005`) per FR-004, FR-005 (missing)
- [X] T036 In src/filterCompletion.ts make `edit:` suggestions follow FR-021: operation snippets use quoted placeholders (`set: {${1:field}: "${2:value}"}`, likewise `add`, `appendEntry`, `removeEntry`, `generateChildren: {document: "$1"}`); after `field: ` insert values and document prefixes as `"value"`, and after `field: "` suggest them inside the quotes like the filter part; `true`/`false` stay unquoted. Update the `Edit section autocomplete (036)` suite in src/test/filterNotebook.test.ts accordingly (`// Spec 036 FR-017, FR-021`) per FR-017, FR-021 (partial)
- [X] T037 Update every unquoted text value in existing tests and help to the quoted form: the `edit:` strings in server/tests/test_batch.py and server/tests/test_filter.py, the `QUERY` constants in src/test/filterNotebook.test.ts, and the `HELP` batch-edit example in src/filterNotebook.ts (`edit: [{set: {testrun: "TR-1"}}]`); all suites stay green per FR-021 (partial)
- [X] T038 Update the examples and value rules in specs/036-batch-edit-items/contracts/batch-edit.md ("Edit section", value rule: text quoted, numbers/true/false/dates unquoted, empty list for `set`/`add`), data-model.md ("Validation", operation table), quickstart.md, and the README.md batch-edit line to quoted text values per FR-021, plan: contract (partial)

## Phase 12: Convergence

- [X] T039 In server/src/doorstop_server/routers/batch.py `CellLoader`, also override the bool, int and float constructors: an unquoted scalar counts as a number or true/false only when its text is exactly `true` / `false` (any case) or a plain decimal number (`-?\d+(\.\d+)?`, optional exponent); any other unquoted value that PyYAML would read as bool/int/float (`yes`, `no`, `on`, `off`, `1:30`, `010`, `0x1F`, `.inf`) comes back as `Unquoted(node.value)` so `_check_value` rejects it with the double-quotes message. Add a case to `test_text_values_must_be_quoted` in server/tests/test_batch.py for `set: {result: no}`, `set: {duration: 1:30}` and `set: {build: 010}` → 400 naming the value, and `set: {priority: 3, flag: true, ratio: 1.5}` still stored as int/bool/float (`# Spec 036 FR-021`); filter cells keep working (`pytest tests/test_filter.py`) per FR-021 (partial)
- [X] T040 After T039, run the complete checks once: `npm run pretest; npx vscode-test` (all labels), `pytest tests` and `pylint src/doorstop_server` in server/; record the result in the implement report, naming any failing suite and whether it also fails without the spec 036 changes per Constitution VI (partial)

## Phase 13: Convergence

- [X] T041 In src/filterCompletion.ts `completeEdit`, insert a suggested value without quotes when it is a number or true/false (same rule as `_PLAIN_LITERAL` in server/src/doorstop_server/routers/batch.py: `true`/`false` in any case, or a plain decimal number); only text goes in double quotes. Add a case to the `Edit section autocomplete (036)` suite in src/test/filterNotebook.test.ts with vocabulary `priority: ['3']`, `flag: ['True']`: after `  - set: {priority: ` the inserted text is `3`, after `  - set: {testruns: ` it is `"TR-1"` (`// Spec 036 FR-017, FR-021`) per FR-017, FR-021 (partial)
- [X] T042 In server/src/doorstop_server/routers/batch.py make the unquoted-`level` message repeat the level as the user typed it (`level: 1.10` → `e.g. level: "1.10"`, not `"1.1"`), e.g. by letting `CellLoader` return the source text of an unquoted number under `level`, or by reading the scalar text from the node; extend the `level: 1.10` case of `test_text_values_must_be_quoted` in server/tests/test_batch.py to assert `"1.10"` appears in the message (`# Spec 036 FR-021`) per FR-021 (partial)
