# Implementation Plan: Filter Notebooks (MVP)

**Branch**: `022-filter-notebooks` | **Date**: 2026-10-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/022-filter-notebooks/spec.md`

## Summary

Add a `doorstop-filter` notebook type. Each filter cell holds a YAML filter in
the shape of an Obsidian Bases `filters:` block: `and` / `or` / `not` groups,
`hasChild` / `hasParent` relations, and leaf expressions such as
`status == "approved"`. Running a cell posts its text to a new server endpoint,
`POST /filter`. The server parses the YAML (PyYAML, already installed with
Doorstop) and parses each leaf with stdlib `ast` against a whitelist, evaluates
the filter over the loaded Doorstop tree (standard and custom attributes,
direct children/parents) and returns the matching rows. The extension renders
them as a markdown table whose UIDs link to the item files. New notebooks
start with a help text cell and one runnable example.

## Technical Context

**Language/Version**: TypeScript 6 (extension, VS Code API `^1.75`); Python ≥3.9 (server; `ast.Constant` is fine on 3.9)

**Primary Dependencies**: VS Code notebook API (`NotebookSerializer`, `NotebookController`); FastAPI + Doorstop 3.x; PyYAML (transitive via Doorstop); stdlib `ast`. **No new dependencies.**

**Storage**: Notebook files `*.doorstop-filter` (JSON) in the workspace; no server-side storage

**Testing**: pytest `server/tests` (real temp Doorstop project); vscode-test unit suite `src/test` (no server)

**Target Platform**: VS Code desktop, Windows/macOS/Linux

**Project Type**: VS Code extension + local Python server

**Performance Goals**: A result within 2 s for 1,000 items (SC-002). One O(n) index pass per request, then O(n · filter size)

**Constraints**: Read-only on the Doorstop repository; never `eval`; errors as structured `INVALID_FILTER` responses

**Scale/Scope**: Projects up to a few thousand items; one new endpoint, one new extension module, one command, one notebook type

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How |
|-----------|--------|-----|
| I. Server is the single source of truth | ✅ | Filter evaluation and attribute access happen in the server; the extension only sends text and renders rows. |
| II. No reinvention of Doorstop | ✅ | Uses Doorstop's `Level` for ordering/comparison, `Item.get` for custom attributes and Doorstop's own item sort order. Doorstop has no query language, so the filter evaluator is new by necessity. |
| III. Error handling | ✅ | `INVALID_FILTER` envelope with line/expression; controller maps every failure to an error output, never a table. Corrupt notebook JSON fails to open rather than being overwritten. |
| IV. No new dependencies | ✅ | PyYAML is already installed with Doorstop; `ast` is stdlib; the notebook API is built into VS Code. |
| V. Typed, linted, tested | ✅ | `check-types` / `lint` gates unchanged; the new server route is covered by pytest against a real Doorstop project, no mocks. |
| VI. CI-runnable test | ✅ | `server/tests/test_filter.py` (runs in `server-tests`) covers the primary path; the `filterNotebook` vscode-test label (runs in `extension-integration-tests` via `npm test`) covers serializer and rendering. |

**Post-design re-check**: still passing; the design adds no layers beyond one router module and one extension module.

## Project Structure

### Documentation (this feature)

```text
specs/022-filter-notebooks/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── filter-api.md    # POST /filter
│   ├── filter-syntax.md # cell grammar + semantics
│   └── notebook-file.md # file format, command, outputs
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
server/src/doorstop_server/
├── routers/filters.py        # NEW: POST /filter — YAML/ast parse → closures → evaluate
├── schemas.py               # + FilterRequest, FilterItem, FilterResponse
└── app.py                   # + include_router(filters.router)

server/tests/
└── test_filter.py           # NEW: pytest against a temp Doorstop project

src/
├── filterNotebook.ts        # NEW: serializer, controller, new-notebook command,
│                            #      renderResults() + NEW_NOTEBOOK_CELLS (exported for tests)
├── doorstopTypes.ts         # + FilterItem, FilterResponse
├── extension.ts             # + register filterNotebook (serializer, controller, command)
└── test/filterNotebook.test.ts  # NEW: pure tests, no server

package.json                 # + contributes.notebooks, command doorstop.newFilterNotebook
.vscode-test.mjs             # + label "filterNotebook"
README.md, CHANGELOG.md      # + feature entry
```

**Structure Decision**: Follow the existing split. Server logic goes in one
new router module next to `tree.py` and `validation.py`, with the parser and
evaluator in the same file (no separate package until a second user appears).
The extension side is one module like `statusReport.ts`, with its pure parts
exported for a server-free unit suite.

## Complexity Tracking

No constitution violations. Deliberate simplifications (recorded as
`ponytail:` comments during implementation):

| Simplification | Ceiling | Upgrade path |
|----------------|---------|--------------|
| `!` / `&&` / `\|\|` not supported inside one expression | Bases users must use `not:` / `and:` / `or:` groups | Translate them before `ast.parse` if users ask |
| Markdown output with `file:` links | Depends on VS Code's markdown renderer opening file links | `command:` URI + trusted markdown (research R7) |
| JSON notebook file format | Diffs are less readable than plain text | A text format with `---` separators |
| Whole tree evaluated per run | Fine at thousands of items | Cache the indexes between runs if SC-002 slips |
