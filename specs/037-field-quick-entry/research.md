# Research: Field Quick Entry

No open questions were left in the spec; this records the design choices.

## R1 — Suggestions are completion items, not a new UI

- **Decision**: One `CompletionItemProvider` serves item files (`.yml`, `.md`
  frontmatter) and the document view (scheme `DOCUMENT_VIEW_SCHEME`). The
  filter notebook keeps its own provider (`src/filterCompletion.ts`) and only
  changes where its values come from.
- **Rationale**: Completion is the editor's dropdown; it filters as the user
  types, works with keyboard only, and needs no command or view. The spec's
  date/time entry was moved from a CodeLens into the same list (spec
  revision 2026-11-01).
- **Alternatives**: Quick pick command per field (more clicks, needs a
  trigger); CodeLens per field (rejected in spec review: visual noise, a
  second mechanism).

## R2 — Where the "used values" come from

- **Decision**: Reuse `GET /filter/vocabulary` (`server/.../routers/filters.py`).
  It already returns, per custom field, the distinct plain values of all
  items with list entries split, protected and standard fields left out,
  sorted, capped at 50 (`_MAX_SUGGESTED_VALUES`), and cached on the server by
  `tree_version`, which follows file changes on disk
  (`test_vocabulary_follows_changes`). The client cache that
  `FilterCompletionProvider` keeps for it moves to one exported loader in
  `src/filterCompletion.ts` (`loadUsedValues(server)`), invalidated by the
  existing `**/*.{yml,md}` watcher, and both providers call it.
- **Rationale**: Principle I (server owns item data) and no new endpoint or
  scan. One cache means one request per change, not one per provider.
- **Alternatives**: Read item files in the extension (violates Principle I,
  the index rework removed exactly that); a new endpoint per field (same
  data, more code).
- **Consequence**: Without a running server there are no used values (spec
  edge case); value lists and the date/time entry are client-only and keep
  working.

## R3 — Finding the field at the cursor

- **Decision**: Pure functions over the document's lines:
  - Item file: inside `metadataRange()` (`src/itemFile.ts`), a column-0 line
    `name:` with the cursor after the colon is the value position of `name`;
    an entry line `- …` belongs to the nearest column-0 `name:` above it.
    The file must also pass `inDoorstopDocument()` (FR-017).
  - Document view: a `name: value` line inside a ```` ```doorstop-fields ````
    fence (`FIELDS_FENCE_OPEN`/`_CLOSE`, `src/documentViewModel.ts`), the
    same shape `parseFields()` reads (FR-020).
- **Rationale**: The same text scanning the review lenses, folding and link
  completion already do; no YAML parsing in the client. Indented lines in a
  `text: |` block never match a column-0 key, and an entry under `text:` maps
  to the protected `text` field, so prose never gets suggestions.
- **Alternatives**: A YAML parser in the client (new dependency, Principle
  IV; and it fails on half-typed lines).

## R4 — What a suggestion replaces and inserts

- **Decision**: The completion range runs from the start of the value (after
  `name:` and its spaces, or after `- `) to the end of the line, so a picked
  value replaces the old one (FR-004). When the colon has no space after it
  yet, the inserted text starts with one space.
  - Item files: the value goes through `yamlValue()`: written as is only
    when it starts with a letter, does not match
    `/^(null|true|false|yes|no|on|off|y|n)$/i` (YAML 1.1 words PyYAML turns
    into null/boolean), and has no colon before whitespace or the end, no
    `#` after whitespace, no line break and no trailing whitespace;
    otherwise single-quoted with `'` doubled (FR-005).
    Starting with a letter rules out every YAML indicator, number,
    timestamp, `~` and `.inf`/`.nan`, so no number or date detection is
    needed. The rule is checked against PyYAML itself through a fixture
    shared by the TypeScript and pytest suites (`server/tests/yaml_quoting.json`).
  - Document view: written as is. The view saves field text through
    `Item.set` as a string and Doorstop quotes it on save, so quotes typed in
    the view would end up in the value.
  - Filter notebook: as today, text values are written in double quotes.
- **Rationale**: A short allow-list is easier to get right than a list of
  everything YAML 1.1 treats specially (an earlier deny-list left `1.10`
  and `2026-11-01` unquoted; PyYAML reads them as a number and a date).
- **Alternatives**: Always quote (noisy diffs, unlike how Doorstop writes
  files); never quote (breaks on `Mister A: lead`, `yes`); a deny-list of
  indicators plus number/date patterns (longer, and each miss changes data).

## R5 — Date/time value

- **Decision**: `formatNow(date)` → `YYYY-MM-DDThh:mm` from local time,
  zero-padded, 24-hour. Computed when suggestions are built, so the label
  shows exactly what is inserted. The date entry sorts first via `sortText`
  and is preselected.
- **Rationale**: ISO 8601 to the minute. It starts with a digit, so
  `yamlValue` quotes it in item files (`'2026-11-01T09:05'`) and it stays
  text.
- **Alternatives**: `Date.toISOString()` (UTC, with seconds and `Z`: not the
  local time the spec asks for).

## R6 — Settings shape and validation

- **Decision**: Three settings under a new "Quick Entry" section, all with
  the default (window) scope so they can live in `.vscode/settings.json`:
  `doorstop.quickEntry.valueLists` (object: field → string array),
  `doorstop.quickEntry.dateTimeFields` (string array),
  `doorstop.quickEntry.suggestUsedValues` (boolean, default `true`).
  `normaliseQuickEntry(raw)` turns them into a `QuickEntrySettings` and
  returns the protected names it dropped and the settings (or value-list
  fields) that had the wrong shape. Protected names are the same
  `PROTECTED_FIELDS` the document view uses.
- **Reporting**: on activation and on each `onDidChangeConfiguration` that
  affects `doorstop.quickEntry`, one warning lists ignored and invalid names
  (FR-015, FR-016), when there are any.
- **Workspace default (FR-014)**: the extension never writes these
  settings; the descriptions tell users to set them in the Workspace tab /
  `.vscode/settings.json`. The JSON schema in `package.json` gives the
  Settings editor validation and examples.
- **Alternatives**: A per-field setting object (`{status: {values, dateTime}}`)
  — rejected: harder to write by hand, and the three concerns are
  independent.

## R7 — Value lists in the filter notebook

- **Decision**: In `FilterCompletionProvider`, the places that today return
  `attributes[name]` call `filterValues(name, mode, settings, used)`:
  - `mode: 'write'` for edit values under `set`, `add`, `appendEntry`:
    the listed values only (FR-021);
  - `mode: 'find'` for filter conditions and `removeEntry`: listed values,
    then used values not in the list, each with detail "not in value list"
    (FR-023);
  - no list: used values as before (FR-022).
- **Rationale**: Writes must not spread typos; finding and removing them
  must still work.

## R8 — Tests

- **Decision**: New vscode-test label `quickEntry` (`src/test/quickEntry.test.ts`):
  pure function tests (settings, suggestion rules, `yamlValue`, `formatNow`,
  field-at-cursor for both surfaces), plus provider tests on a temp Doorstop
  folder (a `.doorstop.yml` and item files) and untitled documents, with a
  stub server object answering `/filter/vocabulary`, like
  `filterNotebook.test.ts` does. Filter notebook rules extend
  `src/test/filterNotebook.test.ts`. No server changes, so no pytest change.
