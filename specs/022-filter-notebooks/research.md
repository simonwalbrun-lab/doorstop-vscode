# Research: Filter Notebooks (MVP)

## R1 — Where the filter is evaluated

- **Decision**: On the server. New endpoint `POST /filter` takes the raw cell
  text, parses and evaluates it against the loaded Doorstop tree, and returns
  the matching rows.
- **Rationale**: Constitution I (server is the single source of truth). The
  server already holds every item, including custom attributes
  (`Item.get(name)`), so FR-007 needs no new `/tree` fields. PyYAML is already
  installed there (Doorstop depends on it) — the extension has no YAML parser
  and would need a new npm dependency (Constitution IV). The primary path can
  then be tested with pytest against a real temporary Doorstop project
  (Constitution V/VI).
- **Alternatives considered**: Client-side evaluation over `DoorstopIndex`.
  Rejected: needs a YAML npm package, needs `/tree` extended with custom
  attributes, and duplicates item semantics (level ordering, link resolution)
  in TypeScript.

## R2 — Filter syntax

- **Decision**: The cell is YAML in the shape of an Obsidian Bases `filters:`
  block: a filter is either one expression string, or a single-key mapping
  `and:` / `or:` / `not:` (list of filters) or `hasChild:` / `hasParent:`
  (one filter). Full grammar in [contracts/filter-syntax.md](contracts/filter-syntax.md).
- **Rationale**: FR-010 (Bases-like). YAML gives nesting, comments (`#`) and
  multi-line layout for free; VS Code highlights `yaml` out of the box.
- **Alternatives considered**: A custom single-line expression language with
  `&&` / `||` (needs a hand-written parser; not Bases-shaped); JSON (no
  comments, noisy).

## R3 — Parsing leaf expressions safely

- **Decision**: Parse each expression string with Python's stdlib
  `ast.parse(expr, mode="eval")` and walk a whitelist of node types: one
  `Compare` (`== != < <= > >=`), a method `Call` on an attribute name
  (`text.contains("x")`, `header.startsWith("x")`, `ref.isEmpty()`), `Name`,
  and `Constant`. Anything else is rejected with `INVALID_FILTER`. `true` /
  `false` / `null` are accepted as names for JS/Bases-style literals. Never
  `eval`.
- **Rationale**: Stdlib, no new dependency, no hand-written tokenizer, and
  the whitelist makes code execution impossible.
- **Alternatives considered**: Regex split on operators (breaks on quoted
  strings containing operators); a parser library (new dependency for
  something `ast` covers).
- **Known ceiling**: Bases' `!` / `&&` / `||` inside a single expression are
  not supported; negation and combination go through `not:` / `and:` / `or:`
  groups. The error message says so.

## R4 — Attribute values and comparison semantics

- **Decision**:
  - Standard names map to item fields: `uid`, `document` (prefix), `level`,
    `header`, `text`, `ref`, `active`, `normative`, `derived`, `reviewed`,
    `links` (list of parent UID strings).
  - Any other name is a custom attribute read via `Item.get(name)`; a missing
    attribute (or a non-data value such as a method) is `None`.
  - `None` never matches a comparison or `contains`/`startsWith`; `isEmpty()`
    is true for `None`, `""` and `[]`.
  - `level` comparisons convert both sides to Doorstop's `Level`, so
    `"1.10" > "1.2"` behaves like Doorstop's own ordering. Level literals are
    written as strings (`level >= "1.2"`) — a bare `1.10` would parse as a
    float and lose the trailing zero.
  - A comparison that raises `TypeError` (e.g. text vs number) counts as no
    match.
  - `contains` is case-sensitive: substring for text, membership for lists.
- **Rationale**: Matches the spec's edge cases (unknown attribute / type
  mismatch → no match, no crash) and reuses Doorstop's own `Level` type
  (Constitution II).

## R5 — Related-item conditions

- **Decision**: Per request, build `uid → item` and `uid → children` maps in
  one pass over the tree. `hasChild: F` matches when any item linking to this
  item matches `F`; `hasParent: F` matches when any item this item links to
  matches `F`. Links to unknown UIDs are skipped.
- **Rationale**: O(n) setup, no per-item `find_child_items()` calls (which
  rescan the tree). Direct relations only, per the 2026-10-04 clarification.

## R6 — Notebook surface in the extension

- **Decision**: VS Code notebook API (stable at the project's `^1.75` engine):
  - `contributes.notebooks` type `doorstop-filter`, file pattern
    `*.doorstop-filter`.
  - A `NotebookSerializer` storing JSON `{"cells":[{"kind":"markdown"|"filter","value":"…"}]}`
    with no outputs (FR-014). Unparseable JSON throws, so VS Code shows an
    error and never overwrites the file (Constitution III).
  - A `NotebookController` for language `yaml` that posts the cell text to
    `/filter`.
  - Command `doorstop.newFilterNotebook` opens an untitled notebook with the
    help text cell and one example filter cell (FR-002).
- **Rationale**: This is the API the user asked for. A JSON file format needs
  only `JSON.parse`/`JSON.stringify`.
- **Alternatives considered**: A text format (YAML documents separated by
  `---`) — nicer diffs but needs a parser for the text cells; not worth it for
  the MVP.

## R7 — Result table and clickable links

- **Decision**: Matches are one output item of the custom mime
  `application/vnd.doorstop.filter-results+json` (`{ columns, items }`), drawn by
  a notebook renderer (`contributes.notebookRenderer`, plain ES module in
  `src/webview/filterResults/renderer.js`, `requiresMessaging: "always"`). A
  UID click posts `{ type: "open", path }`; the extension receives it through
  `vscode.notebooks.createRendererMessaging` and opens the file, or warns
  "Item no longer exists". "No items matched." and the empty-cell hint stay
  markdown.
- **Rationale**: Verified in use: VS Code ignores clicks on `file:` links in
  notebook outputs and only lets a small built-in list of `command:` links
  through, so the original markdown-table design (and its `command:`
  fallback) cannot open items. The renderer builds the DOM with
  `textContent` only, so item text needs no escaping. No new dependency: the
  file is copied to `dist/webview/` by the existing esbuild step.
- **Alternatives considered**: Markdown table with `file:` links (original
  decision, does not work); `command:` links (blocked); relative links
  (break for untitled notebooks).

## R8 — Error surfaces

- **Decision**: Server returns `400 {"error":{"code":"INVALID_FILTER","message":…}}`
  for YAML errors (message includes the line number from PyYAML's
  `problem_mark`) and invalid expressions (message quotes the expression). The
  controller turns every failure (`DoorstopApiError`, a network error, the
  server not started) into `NotebookCellOutputItem.error`, so a failed run
  never shows a table. An empty cell gets a hint output without calling the
  server.

## R9 — Tests (Constitution VI)

- **Decision**:
  - `server/tests/test_filter.py` (pytest, real temp Doorstop project):
    equality, nested `and`/`or`/`not`, custom attribute, `hasChild` with
    `status == "approved"`, `hasParent`, missing attribute, invalid YAML,
    rejected unsafe expression, and the new-notebook example filter.
  - `src/test/filterNotebook.test.ts` (new `filterNotebook` label in
    `.vscode-test.mjs`, no workspace, no server): serializer round-trip,
    markdown table rendering/escaping/count, and new-notebook template shape.
- **Rationale**: The primary success path runs end to end through the real
  stack in CI. The extension-side pure functions are covered without a server.
