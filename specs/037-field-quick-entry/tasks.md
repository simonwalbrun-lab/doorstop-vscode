---

description: "Task list for 037 Field Quick Entry"
---

# Tasks: Field Quick Entry

**Input**: Design documents from `specs/037-field-quick-entry/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/quick-entry.md](contracts/quick-entry.md)

**Tests**: Required. Constitution VI/VIII: every FR has a test with a
`// Spec 037 FR-…` trace comment directly above the test function.

**Organization**: by user story, phases in priority order (P1, then the
P2 stories, then P3). Each story phase ships alone once Phase 2 is done.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different files, no dependency on an unfinished task
- **[Story]**: US1 value lists in item files, US2 date/time, US3 used
  values, US4 shared settings and warnings, US5 document view, US6 filter
  notebook

## Conventions used by every task

- New code lives in src/quickEntry.ts (flat module, comment style of
  src/filterCompletion.ts: a header doc comment naming the spec, one-line
  doc comments on exports, no other comments unless the why is not obvious).
- Settings keys are exactly `doorstop.quickEntry.valueLists`,
  `doorstop.quickEntry.dateTimeFields`, `doorstop.quickEntry.suggestUsedValues`.
- Protected names: import `PROTECTED_FIELDS` from src/documentViewModel.ts;
  do not copy the list.
- Tests: src/test/quickEntry.test.ts (new vscode-test label `quickEntry`)
  and new suites in src/test/filterNotebook.test.ts (label `filterNotebook`).
  No workspace, no Python. A stub server is
  `{ request: async (_m: string, p: string) => … } as unknown as DoorstopServer`,
  as in the `Filter cell autocomplete (022 FR-016)` suite. Item-file tests
  write a temp folder (`fs.mkdtempSync(path.join(os.tmpdir(), 'doorstop-qe-'))`)
  holding `.doorstop.yml` and item files, opened with
  `vscode.workspace.openTextDocument(uri)`; settings are set with
  `getConfiguration('doorstop').update(key, value, ConfigurationTarget.Global)`
  and reset to `undefined` in `teardown`, as src/test/headerFolding.test.ts does.
- Suggestion contract (labels, kinds, details, order, insert text):
  [contracts/quick-entry.md](contracts/quick-entry.md).

---

## Phase 1: Setup

- [X] T001 [P] Add a "Quick Entry" entry to `contributes.configuration` in package.json (after "Editor") with: `doorstop.quickEntry.valueLists` (`"type": "object"`, `"additionalProperties": { "type": "array", "items": { "type": "string" } }`, `"default": {}`), `doorstop.quickEntry.dateTimeFields` (`"type": "array"`, `"items": { "type": "string" }`, `"default": []`), `doorstop.quickEntry.suggestUsedValues` (`"type": "boolean"`, `"default": true`). No `scope` key. Each `markdownDescription` gives an example (`{"status": ["Draft", "Approved", "Obsolete"]}`, `["tested_on"]`) and says to set it in the Workspace tab / `.vscode/settings.json` so the team shares it; the date/time one names the inserted format `YYYY-MM-DDThh:mm`; the used-values one says fields with a value list or date/time fields never get used values
- [X] T002 [P] Add a vscode-test entry to .vscode-test.mjs after `taskToggle`: comment `// Spec 037: quick-entry settings, suggestions and providers on a temp Doorstop folder and untitled documents, stub server. No workspace, no Python.`, `label: 'quickEntry'`, `files: 'out/test/quickEntry.test.js'`. Create src/test/quickEntry.test.ts with the imports, a `suite('Field quick entry (037)')` and two helpers: `doorstopFolder(files: Record<string, string>): string` (temp folder with `.doorstop.yml` containing `settings:\n  prefix: REQ\n` plus the given files) and `stubServer(attributes: Record<string, string[]> | Error)` that answers `GET /filter/vocabulary` with `{ attributes }` or rejects with the error, recording request paths

---

## Phase 2: Foundational (blocks every story)

- [X] T003 Create src/quickEntry.ts with the types and settings reader from data-model.md: `QuickEntrySettings { valueLists: Map<string, string[]>; dateTimeFields: Set<string>; suggestUsedValues: boolean; ignored: string[]; invalid: string[] }`, `Suggestion { value: string; source: 'now' | 'listed' | 'used' }`, `FieldAtCursor { name: string; valueStart: number; needsSpace: boolean }`. `normaliseQuickEntry(raw: { valueLists?: unknown; dateTimeFields?: unknown; suggestUsedValues?: unknown })` applies exactly: valueLists — "Field names trimmed; protected names dropped (→ `ignored`); entries that are numbers or booleans become text; empty entries skipped; duplicates kept once, first position wins. A value that is not an array, or holds anything else (object, null), drops that field (→ `invalid`, as `valueLists.<field>`). A non-object setting → `invalid: valueLists`."; dateTimeFields — "Trimmed, empty skipped, protected dropped (→ `ignored`). Not an array of strings → `invalid: dateTimeFields`, treated as empty."; suggestUsedValues — "Default `true`. Not a boolean → `invalid`, treated as `true`."; `ignored` holds each protected name once. `readQuickEntrySettings()` passes `vscode.workspace.getConfiguration('doorstop.quickEntry').get(...)` of the three keys to it
- [X] T004 In src/filterCompletion.ts move the vocabulary half of `FilterCompletionProvider.load()` into exported `loadUsedValues(server: DoorstopServer): Promise<Record<string, string[]> | undefined>`, cached in a module-level `WeakMap<DoorstopServer, Promise<…>>` (per server, so tests with different stub servers stay isolated); a failed load is removed from the map so the next call retries (keep the existing comment). Export `invalidateUsedValues(server)` deleting the entry. `load()` uses `loadUsedValues` (attributes `?? {}` as now) and `invalidate()` also calls `invalidateUsedValues(this.server)`; the watcher in `registerFilterCompletion` stays as is. Existing filterNotebook tests must still pass unchanged
- [X] T005 [P] Tests in src/test/quickEntry.test.ts for `normaliseQuickEntry`: `// Spec 037 FR-001, FR-006, FR-009` valid object/array/boolean read as given, duplicates once, empties skipped, `1`/`true` entries become `'1'`/`'true'`, `suggestUsedValues` defaults to `true` when undefined; `// Spec 037 FR-015` `links` in valueLists and `reviewed` in dateTimeFields dropped and listed once in `ignored`; `// Spec 037 FR-016` `valueLists: 'x'` → `invalid` contains `valueLists`, `{status: 'Draft'}` → `valueLists.status` invalid while another valid field is kept, `dateTimeFields: [1]` → invalid, `suggestUsedValues: 'yes'` → invalid and `true`

**Checkpoint**: settings normalise; used values have one shared cache; filterNotebook tests green.

---

## Phase 3: User Story 1 - Pick a field value from a configured list (P1) 🎯 MVP

**Goal**: `status: ` in an item file offers the configured values and replaces the old value.

**Independent Test**: value list for `status` in settings, temp item `status: Draft`, cursor after `status: ` → `Draft`, `Approved`, `Obsolete` in order; accepting replaces the value.

### Tests for User Story 1

- [X] T006 [P] [US1] Create server/tests/yaml_quoting.json: a JSON array of `{ "value": …, "quoted": … }` pairs. Unchanged (`quoted` = `value`): `Approved`, `Mister A`, `Draft v1.0`, `A-B_c/d (x)`, `it's`. Single-quoted: `1.0`, `1.10`, `007`, `0x1F`, `1:30`, `2026-11-01`, `2026-11-01T09:05`, `.inf`, `Mister A: lead` → `'Mister A: lead'`, `a #b`, values starting with `-`, `?`, `:`, `,`, `[`, `]`, `{`, `}`, `#`, `&`, `*`, `!`, `|`, `>`, `'`, `"`, `%`, `@`, backtick; `yes`, `No`, `ON`, `off`, `y`, `n`, `true`, `False`, `null`, `~`; empty → `''`; leading space and trailing space; `it's: x` → `'it''s: x'`. Create server/tests/test_quick_entry_quoting.py with `# Spec 037 FR-005` above one parametrised test: for each pair, `yaml.load("k: " + quoted, Loader=yaml.CSafeLoader)["k"]` is a `str` equal to `value` (module docstring: the fixture is shared with src/test/quickEntry.test.ts so the client's quoting is checked against the server's loader). In src/test/quickEntry.test.ts add `// Spec 037 FR-005`: `yamlValue(value) === quoted` for every pair, reading the file via `path.join(REPO_ROOT, 'server', 'tests', 'yaml_quoting.json')`
- [X] T007 [US1] Tests for `itemFieldAt` — `// Spec 037 FR-002, FR-003, FR-017`: YAML lines `['status: Draft']` cursor at 8 → `{name: 'status', valueStart: 8, needsSpace: false}`; `status:` cursor 7 → `needsSpace: true`; `tester:\n- Mister A` cursor on line 1 after `- ` → `tester`; `tester:\n  - ` (indented entry) → `tester`; markdown `---/status: x/---/status: body` → line 1 yes, line 3 none; markdown without or with unclosed frontmatter: no frontmatter → none, unclosed → inside counts (as `metadataRange` says); YAML `text: |\n  status: x` line 1 → none; entry under `text:` → none (protected); cursor before the colon → none
- [X] T008 [US1] Tests for `fieldSuggestions` listed and empty branches — `// Spec 037 FR-002, FR-018`: listed values in configured order with source `listed`; a field without list, not date/time, `suggestUsedValues: false` → `[]`; a protected name → `[]`
- [X] T009 [US1] Provider tests on a temp Doorstop folder with `valueLists: {status: [Draft, Approved, Obsolete], tester: ['Mister A', 'Madame B', 'Mister A: lead']}` — `// Spec 037 FR-002, FR-004` `REQ-001.yml` `status: Draft` → labels in order, `range` from char 8 to end of line, applying `Approved` with `vscode.workspace.applyEdit` yields `status: Approved` and the other lines unchanged; `// Spec 037 FR-003` a `- ` entry under `tester:` offers the tester values; `// Spec 037 FR-005` `Mister A: lead` has insertText `'Mister A: lead'`; `// Spec 037 SC-003` with a stub vocabulary of 2,000 values for `component` (no list) and the option on, one completion request returns within 1,000 ms; `// Spec 037 FR-017` the same file outside a Doorstop folder and the body of an `.md` item → `undefined`; `// Spec 037 FR-018` `component: ` (no list, option off) → `undefined`

### Implementation for User Story 1

- [X] T010 [US1] In src/quickEntry.ts implement `yamlValue(value)` per research R4: return it unchanged only when it starts with a letter (`/^[A-Za-z]/`), does not match `/^(null|true|false|yes|no|on|off|y|n)$/i`, and contains no `: `, no ` #`, no line break and no trailing whitespace; otherwise `'` + value with `'` doubled + `'`. One-line comment: an allow-list, because YAML 1.1 (PyYAML on the server) reads numbers, dates and those words as non-text
- [X] T011 [US1] In src/quickEntry.ts implement `itemFieldAt(lines, line, character, isMarkdown)` with `metadataRange` from src/itemFile.ts (line must be in `[start, end)`): a column-0 `^([A-Za-z_][\w-]*):` line with `character` after the colon → `valueStart` is after the colon and any spaces, `needsSpace` when no space follows the colon; an entry line `^\s*-\s*` with `character` after the dash → name from the nearest line above that matches the column-0 key pattern (a column-0 line that is not a key → none), `valueStart` after `- ` (`needsSpace` when the dash has no space after it). Protected names → `undefined`
- [X] T012 [US1] In src/quickEntry.ts implement `fieldSuggestions(name, settings, used, now)` with rules 1, 3 and 5 of data-model.md "Suggestion rules" (protected → none; listed values in order; nothing else → `[]`), structured so US2 adds rule 2 before and US3 rule 4 after
- [X] T013 [US1] In src/quickEntry.ts add exported `class QuickEntryProvider implements vscode.CompletionItemProvider` with `constructor(server: DoorstopServer, mode: 'item' | 'view')`. `provideCompletionItems` wrapped in `measure('quickEntry.completion', …)` (src/timing.ts): mode `item` → `undefined` unless `itemFieldAt` finds a field and then `inDoorstopDocument(document.uri.fsPath)` holds (in that order: the text check is cheap, the folder walk touches the disk, and the space trigger fires on every space); build items per the contract table (label = value, `EnumMember`, detail `value list`, `sortText` keeps the order, `filterText` = value, `range` `valueStart` → end of line, `insertText` = `(needsSpace ? ' ' : '') + yamlValue(value)`); empty list → `undefined`. `registerQuickEntry(context, server, warn = (m: string) => void vscode.window.showWarningMessage(m))` registers it for `[{ scheme: 'file', language: 'yaml' }, { scheme: 'file', language: 'markdown' }]` with trigger characters `' '`, `':'`
- [X] T014 [US1] In src/extension.ts call `registerQuickEntry(context, doorstopServer)` next to `registerCompletionProvider(context, { server: doorstopServer })`

**Checkpoint**: US1 tests green; manual quickstart steps 2, 3, 6.

---

## Phase 4: User Story 2 - Insert the current date and time from the suggestions (P2)

**Goal**: a date/time field offers "Current date and time" first.

**Independent Test**: `dateTimeFields: ['tested_on']`, cursor after `tested_on: ` → first item `Current date and time`, detail is `YYYY-MM-DDThh:mm` of now; accepting writes it.

- [X] T015 [P] [US2] Tests — `// Spec 037 FR-007` `formatNow(new Date(2026, 0, 2, 3, 4))` → `2026-01-02T03:04`, `new Date(2026, 10, 1, 21, 5)` → `2026-11-01T21:05`; `fieldSuggestions('tested_on', …)` returns `{source: 'now', value: formatNow(now)}` first; `// Spec 037 FR-008` with a value list as well → now, then listed; provider on a temp item `tested_on: old` → first label `Current date and time`, `preselect` true, detail matches `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/`, applying it replaces `old` with the quoted value (`tested_on: '2026-…'`)
- [X] T016 [US2] In src/quickEntry.ts implement `formatNow(date)` (local getters, `padStart(2, '0')`, `` `${y}-${m}-${d}T${hh}:${mm}` ``) and rule 2 in `fieldSuggestions` ("`name` in `dateTimeFields` → `now` first (`formatNow(new Date())`)" — use the `now` argument). In `QuickEntryProvider` render `now` as label `Current date and time`, kind `Event`, detail = the value, `filterText` = value, `preselect: true`, sorted first

**Checkpoint**: quickstart step 4.

---

## Phase 5: User Story 4 - Configuration shared with the team (P2)

**Goal**: settings are workspace-ready, changes apply at once, bad settings are reported.

**Independent Test**: settings in workspace settings give suggestions; changing them changes the next list; a protected or malformed entry yields one warning.

- [X] T017 [P] [US4] Tests — `// Spec 037 FR-001, FR-006, FR-009, FR-014` read package.json the way src/test/packageMenus.test.ts does (`JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'))`) and assert the three keys exist with defaults `{}`, `[]`, `true`, no `scope` of `machine`/`application`/`machine-overridable`, and each `markdownDescription` mentions `.vscode/settings.json`; `// Spec 037 FR-013` provider request, then `update` the value list, then a second request → second reflects the change; `// Spec 037 FR-015, FR-016` `registerQuickEntry` on a fake `ExtensionContext` (`{ subscriptions: [] }`) with a capturing `warn`, with `dateTimeFields: ['links']` and `valueLists: {status: 'x'}` set beforehand → `warn` called once, message contains `links` and `valueLists.status`; with clean settings → not called; changing a `doorstop.quickEntry` setting to another bad value → called once more. Dispose the subscriptions in `teardown`
- [X] T018 [US4] In `registerQuickEntry` (src/quickEntry.ts) add `report()`: reads settings and, when `ignored` or `invalid` is non-empty, calls `warn` once with `Doorstop: quick entry ignored protected field(s): <names>; invalid setting(s): <names>` (each part only when non-empty). Call it at registration and from `vscode.workspace.onDidChangeConfiguration` when `event.affectsConfiguration('doorstop.quickEntry')`; push the listener to `context.subscriptions`. Settings stay read per request (FR-013)

**Checkpoint**: quickstart steps 1 and 9.

---

## Phase 6: User Story 5 - Same suggestions in the document view (P2)

**Goal**: field lines in the document view offer the same suggestions, inserted raw.

**Independent Test**: view text with a `doorstop-fields` fence holding `status: Draft`, cursor after `status: ` → the listed values, insertText without quotes; a text line → nothing.

- [X] T019 [P] [US5] Tests — `// Spec 037 FR-019` `viewFieldAt` on `['### 1 Login', FIELDS_FENCE_OPEN, 'status: Draft', FIELDS_FENCE_CLOSE, 'text']` line 2 → `status`; `new QuickEntryProvider(stubServer({}), 'view')` on an untitled markdown document with that text → listed values, `insertText` of `Mister A: lead` is the raw value, a date/time field offers `Current date and time` first; `// Spec 037 FR-020` the text line, the fence lines and a `status: x` line outside a fence → `undefined`
- [X] T020 [US5] In src/quickEntry.ts implement `viewFieldAt(lines, line, character)`: the current line must not be a fence line; walk up from `line - 1` — a line equal to `FIELDS_FENCE_CLOSE`, or reaching the top, → none; a line equal to `FIELDS_FENCE_OPEN` → inside a field block, and the current line must match `^([^:\s]+):` (the shape `parseFields` in src/documentViewModel.ts reads) with `character` after the colon; protected names → none. In `QuickEntryProvider` mode `view` uses it and inserts the raw value (`(needsSpace ? ' ' : '') + value`, comment: the view saves through `Item.set`, Doorstop quotes). Register a second instance for `{ scheme: DOCUMENT_VIEW_SCHEME }` in `registerQuickEntry`, same trigger characters

**Checkpoint**: quickstart step 7.

---

## Phase 7: User Story 6 - Value lists in filter notebooks (P2)

**Goal**: writes offer only listed values; searches and `removeEntry` list unlisted used values after them.

**Independent Test**: value list for `status`, stub vocabulary `status: ['Aproved', 'Draft']`; `set: {status: "` → listed only; `status == "` → listed, then `Aproved` with detail `not in value list`.

- [X] T021 [P] [US6] New suite `Value lists in filter cells (037)` in src/test/filterNotebook.test.ts (stub vocabulary `status: ['Aproved', 'Draft']`, `component: ['UI']`; value list `status: [Draft, Approved, Obsolete]` set in `setup`, reset in `teardown`): `// Spec 037 FR-021` `edit:\n  - set: {status: "`, `add`, `appendEntry` → exactly `Draft, Approved, Obsolete`; `// Spec 037 FR-023` `filters: status == "`, `filters: status.contains("` and `removeEntry: {status: "` → `Draft, Approved, Obsolete, Aproved`, the last with detail `not in value list`; `// Spec 037 FR-022` `filters: component == "` and `set: {component: "` → `UI` as before
- [X] T022 [US6] In src/quickEntry.ts implement `filterValues(name, mode, settings, used)` per data-model.md "Filter notebook values" ("`write` (`set`, `add`, `appendEntry`): listed values only"; "`find` (conditions, `removeEntry`): listed, then used values not listed (marked)"; no list: used values as today). In src/filterCompletion.ts read `readQuickEntrySettings()` per request and use `filterValues` where `attributes[name]` is returned today: the condition branch (`VALUE_AFTER_OPERATOR` / `VALUE_IN_METHOD`, mode `find`) and the edit value branch (mode `write`, or `find` when `operation === 'removeEntry'`). Listed values get kind `EnumMember`; unlisted used values under a list get detail `not in value list`. Quoting stays as is

**Checkpoint**: quickstart step 8.

---

## Phase 8: User Story 3 - Offer values already used in other items (P3)

**Goal**: fields with no list and not date/time offer the values used in other items.

**Independent Test**: stub vocabulary `component: ['Server', 'UI']`, temp item `component: ` → `Server`, `UI`; option off → nothing.

- [X] T023 [P] [US3] Tests — `// Spec 037 FR-010` `fieldSuggestions('component', …, {component: ['Server', 'UI']})` → both as `used` in that order; provider on a temp item and in `view` mode offers them with detail `used in other items`; `// Spec 037 FR-011` `status` with a list and used `['Aproved']` → no `Aproved`; a date/time field with used values → only `now`; `// Spec 037 FR-018` `suggestUsedValues: false` → `undefined`; stub server rejecting → listed values and `now` still offered, used none; `// Spec 037 FR-012` stub returns `['UI']`, request, change the stub to `['UI', 'Database']`, `invalidateUsedValues(server)`, request again → `Database` offered
- [X] T024 [US3] Rule 4 in `fieldSuggestions` ("Else, if not a date/time field and `suggestUsedValues` → `usedValues[name]` as `used` (already sorted, ≤ 50)"). `QuickEntryProvider` calls `loadUsedValues(this.server)` only when rule 4 can apply (no list, not date/time, option on) so listed fields cost no request; a rejected or `undefined` load means no used values. Render `used` with kind `Value`, detail `used in other items`

**Checkpoint**: quickstart step 5; all FR-001…FR-023 have a traced test.

---

## Phase 9: Polish & Cross-Cutting

- [X] T025 [P] README.md: a feature bullet near the `doorstop.documentView.fields` one ("Quick entry of field values: value lists, current date and time, values used in other items, in item files, the document view and filter notebooks") and three rows in the settings table after `doorstop.foldYamlHeaderOnOpen`: `doorstop.quickEntry.valueLists` | none | Values offered for a field; `doorstop.quickEntry.dateTimeFields` | none | Fields offered the current date and time; `doorstop.quickEntry.suggestUsedValues` | on | Offer values used in other items for fields without a value list
- [X] T026 [P] CHANGELOG.md: one line under the unreleased section in the style of the neighbours naming the three settings
- [X] T027 Run `grep -rn "Spec 037 FR-" src/test server/tests` and confirm every FR-001…FR-023 appears; then `npm run compile`, `npm test -- --label quickEntry`, `npm test -- --label filterNotebook`, `pylint server/tests/test_quick_entry_quoting.py`, `pytest server/tests/test_quick_entry_quoting.py`; fix until green
- [ ] T028 Walk through [quickstart.md](quickstart.md) manually in the Extension Development Host

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 → stories. T004 is needed by US3 and US6 only, but is
  in Phase 2 so the shared cache exists before two callers use it.
- US1 creates `QuickEntryProvider` and `registerQuickEntry`; US2, US4, US5,
  US6 (its `filterValues` goes into src/quickEntry.ts) and US3 extend that
  file, so they all come after US1 and run one at a time.
- Within a story: tests first (they fail), then implementation.
- All edits to src/quickEntry.ts and to src/test/quickEntry.test.ts are
  sequential (one file each); a [P] task touches a file no other open task
  in its phase touches.

### Parallel examples

- Phase 1: T001 and T002 together.
- US1: T006 (fixture, pytest, one TS test) alongside the first
  implementation task; T007–T009 one after another (same test file).
- Each later story: its [P] test task can be written while the previous
  story's implementation finishes, as long as no one else edits
  src/test/quickEntry.test.ts at the same time.
- Polish: T025 and T026 together.

## Implementation Strategy

1. MVP: Phases 1–3 (value lists in item files) — the core of the request.
2. Then US2 (date/time) and US4 (warnings), then US5 (document view) and
   US6 (filter notebook), then US3 (used values).
3. Each phase ends at a checkpoint that runs its tests and quickstart step.

## Phase 10: Convergence

- [X] T029 Quote values that end in `:` or hold a `:` before a tab or a `#` after a tab in `yamlValue` in src/quickEntry.ts (test `/:(\s|$)|\s#|[\r\n]|\s$/`); add `TODO:`, `a:\tb` and `a\t#b` to server/tests/yaml_quoting.json so the extension and pytest checks cover them; reword the FR-005 list of unquoted cases in spec.md to match per FR-005 (partial; ponytail review finding 1: `status: TODO:` is a PyYAML ScannerError)
- [X] T030 Return early from `QuickEntryProvider.provideCompletionItems` in src/quickEntry.ts when the cursor line cannot be a field (item file: `/^([A-Za-z_][\w-]*:|\s*-)/`, document view: `/^[^:\s]+:/`) before calling `document.getText().split` per SC-003 (partial; ponytail review finding 2)
