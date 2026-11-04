# Implementation Plan: Field Quick Entry

**Branch**: `add_testreporting` (no separate feature branch) | **Date**: 2026-11-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/037-field-quick-entry/spec.md`

## Summary

Three workspace settings (`doorstop.quickEntry.valueLists`,
`.dateTimeFields`, `.suggestUsedValues`) feed one completion provider for
field values in item files and in the document view: the current date and
time (`YYYY-MM-DDThh:mm`) for date/time fields, the configured values for
fields with a list, and otherwise the values already used in other items.
Used values come from the server's existing `GET /filter/vocabulary`, whose
client cache moves into one shared loader. The filter notebook's value
suggestions apply the same lists: only listed values where a value is
written, listed then unlisted-used values where one is searched or removed.
Extension-only; no server change.

## Technical Context

**Language/Version**: TypeScript 6 on the VS Code Extension API (^1.97)

**Primary Dependencies**: VS Code API only. No new packages; no YAML parser
(quoting is a text rule, R4).

**Storage**: VS Code settings (workspace `.vscode/settings.json` by
convention); item files are changed only by the user's accepted completion.

**Testing**: vscode-test, new label `quickEntry`
(`src/test/quickEntry.test.ts`); extended `filterNotebook`
(`src/test/filterNotebook.test.ts`). Stub server object, temp Doorstop
folder, untitled documents. One small pytest
(`server/tests/test_quick_entry_quoting.py`) loads the shared quoting
fixture `server/tests/yaml_quoting.json` with PyYAML, so the client's
quoting rule is checked against the loader the server uses (SC-005).

**Target Platform**: VS Code desktop with the local Doorstop server

**Project Type**: VS Code extension + local Python server (server
unchanged)

**Performance Goals**: suggestions within 1 s on 2,000 items (SC-003):
used values are one cached request per item change, served from the
server's `tree_version` cache; settings and line scanning are O(lines above
the cursor).

**Constraints**: replace only the value being entered (FR-004); item files
stay valid YAML (FR-005, SC-005); nothing from this feature outside item
metadata / view field blocks (FR-017, FR-020).

**Scale/Scope**: 1 new module (~200 lines), changes to
`filterCompletion.ts`, `extension.ts`, `package.json`, `.vscode-test.mjs`,
README/CHANGELOG; 1 new test file, 1 extended.

## Constitution Check

| Principle | Status | How |
| --- | --- | --- |
| I. Server is source of truth | ✅ | Used values come from `GET /filter/vocabulary`; the client only scans the current line context (as `itemFile.ts` helpers do) and never parses item files. Writes are the user's own editor edits / the document view's existing save. No mutation requests, so no locking or cancellation points. |
| II. No reinvention | ✅ | Reuses Doorstop's attribute data via the existing endpoint, `metadataRange`, `inDoorstopDocument`, `PROTECTED_FIELDS`, the document view fence constants, VS Code completion. |
| III. Error handling | ✅ | Server unreachable → no used values, other suggestions still shown (R2). Invalid or protected settings ignored and reported by name (FR-015, FR-016). Unknown cursor context → `undefined`, leaving other providers untouched. |
| IV. No unjustified dependencies | ✅ | None added (YAML quoting by rule, R4). |
| V. Typed, linted, tested | ✅ | `npm run compile`; no server code change. The new pytest file passes pylint. |
| VI. CI-runnable test | ✅ | `quickEntry` label: temp folder fixture, stub server, no workspace, no Python. |
| VII. Long-running visible | ✅ | Nothing long-running: completion reads cached data; no toast (as filter completion today). |
| VIII. FR → test trace | ✅ | See Test coverage; each test carries `// Spec 037 FR-…`. |

Post-design re-check: no violations; Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/037-field-quick-entry/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/quick-entry.md
└── tasks.md            # /speckit-tasks
```

### Source Code

```text
src/
├── quickEntry.ts          # NEW: settings, suggestion rules, formatNow, yamlValue, field-at-cursor, provider, warning
├── filterCompletion.ts    # export loadUsedValues() (shared cache); value lists in condition and edit values
├── extension.ts           # registerQuickEntry(context, doorstopServer)
└── test/
    ├── quickEntry.test.ts      # NEW
    └── filterNotebook.test.ts  # value-list cases
package.json               # "Quick Entry" settings section
.vscode-test.mjs           # label quickEntry
README.md, CHANGELOG.md    # settings rows, feature line
```

**Structure Decision**: flat modules like every feature. Item files and
the document view share one provider in `quickEntry.ts` (they differ only
in how the field is found and whether the value is YAML-quoted). The filter
notebook keeps its provider; it imports `fieldSuggestions`'s sibling
`filterValues` and the settings reader, so the rules live in one place.

## Design notes

- `FilterCompletionProvider.load()` today caches index and vocabulary
  together. The vocabulary half becomes a module-level
  `loadUsedValues(server)` (a failed load is not kept, as now); the provider
  calls it, and `invalidate()` / the watcher clear it. The quick-entry
  provider calls the same function, so one change costs one request.
- `registerFilterCompletion` runs at activation via `registerFilterNotebook`,
  so the watcher that clears the shared cache always exists.
- Settings are read on every completion request (`readQuickEntrySettings()`),
  so FR-013 needs no change listener; the listener only drives the warning.
- `registerQuickEntry(context, server, warn = showWarningMessage)` takes the
  warning sink so tests can capture it.
- Document view inserts raw text (R4): the view saves field lines through
  `PATCH /items` → `Item.set`, and Doorstop does the YAML quoting.

## Test coverage

| Test (file → case) | FRs |
| --- | --- |
| quickEntry → `normaliseQuickEntry`: valid object/array/boolean; duplicates and empties; numbers to text | 001, 006, 009 |
| quickEntry → `normaliseQuickEntry`: protected names dropped and listed in `ignored`; wrong shapes listed in `invalid`, others kept; default `suggestUsedValues` true | 015, 016, 009 |
| quickEntry → `fieldSuggestions`: listed in order; date first then listed; used only without list and not for date fields; nothing with option off; protected → none | 002, 007, 008, 010, 011, 018 |
| quickEntry → `formatNow`: local time, zero-padded, `2026-01-02T03:04` | 007 |
| quickEntry → `yamlValue` against every pair in `server/tests/yaml_quoting.json` | 005 |
| test_quick_entry_quoting (pytest) → each `quoted` in `yaml_quoting.json` loads with PyYAML `CSafeLoader` as exactly its `value` (a `str`) | 005, SC-005 |
| quickEntry → 2,000 used values for one field: completion returns within 1 s | SC-003 |
| quickEntry → `itemFieldAt`: column-0 key; list entry under key; md body and unclosed/no frontmatter → none; indented text block → none; `needsSpace` | 002, 003, 017 |
| quickEntry → provider on temp Doorstop item (yml and md): items, order, range to end of line replaces old value, quoting applied; file outside a Doorstop document → none | 002, 003, 004, 005, 017 |
| quickEntry → provider with stub server: used values offered, typo not offered for listed field; server failure → listed/date still offered | 010, 011, 018 |
| quickEntry → settings changed between two requests → second reflects it | 013 |
| quickEntry → stub server answers differently after `invalidate` (watcher path) → new value offered | 012 |
| quickEntry → `viewFieldAt` + provider on an untitled document with view text: field line inside fence → suggestions, raw insert; text line / outside fence → none | 019, 020 |
| quickEntry → registerQuickEntry with bad settings → `warn` called once with ignored and invalid names; not called when clean | 015, 016 |
| quickEntry → `package.json` declares the three settings with defaults, no machine/application scope, description mentions `.vscode/settings.json` | 001, 006, 009, 014 |
| filterNotebook → `set`/`add`/`appendEntry` value for listed field → listed only | 021 |
| filterNotebook → condition and `removeEntry` for listed field → listed then used-not-listed with detail | 023 |
| filterNotebook → field without list → used values as before | 022 |

## Complexity Tracking

None.
