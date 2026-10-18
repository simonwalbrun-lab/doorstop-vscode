# Research: YAML Header Folding

## R1. How the header gets folded on open, in editors and peek editors

**Decision**: A `FoldingRangeProvider` returns one range for the header. When the
switch is on, the range has kind `FoldingRangeKind.Imports`; when off, no kind.
`package.json` sets `configurationDefaults` `"[markdown]": { "editor.foldingImportsByDefault": true }`,
so VS Code itself folds Imports ranges when it first computes the ranges of an
editor.

**Rationale**: The extension API does not expose the embedded peek editor of
references and call hierarchy, so the extension cannot fold there. VS Code's own
folding controller runs in every code editor, peek included, and reads the same
language setting (FR-006). It folds Imports ranges once per editor; after the user
unfolds, it does not fold again (FR-003). No editor tracking or `editor.fold` calls
are needed.

**Consequence (spec edge case updated)**: when the switch is turned on, the
provider fires `onDidChangeFoldingRanges`; open editors that never had an
automatic fold now get one. Turning it off only drops the kind; existing folds stay.

**Alternatives considered**:
- `onDidChangeVisibleTextEditors` + `editor.fold` command: misses peek editors,
  needs per-editor state for FR-003.
- Changing `[markdown] editor.foldingImportsByDefault` from the button instead of
  the range kind: writes a second setting and also affects other Markdown files.

**Risk**: another Markdown folding provider could return a range starting on
line 0 that wins the merge and drops the Imports kind. The FR-001/FR-002 tests
call `vscode.executeFoldingRangeProvider`, which returns the merged result, so
this is caught.

## R2. Which files count as Doorstop items without the server

**Decision**: a `.md` file counts when its folder or an ancestor folder (up to the
filesystem root) contains `.doorstop.yml`. Only the presence of the file is
checked; it is not read.

**Rationale**: FR-009 requires folding without a running server, so the server's
item list cannot be the source. A presence check is the smallest test that
excludes READMEs and notes outside Doorstop documents (FR-007).

**Ceiling**: a non-item `.md` with front matter inside a document folder is also
folded. Harmless (it is only a fold). Upgrade path: ask the server's item list
when it is available.

**Alternatives considered**: reading the document prefix from `.doorstop.yml` to
match the file name: parses Doorstop config in the extension (Principle I).

## R3. Finding the header

**Decision**: reuse `getMetadataLineRange` from `src/reviewLensProvider.ts`
(export it). It returns `{ start: 1, end: <closing fence line> }` for a `.md`
file with a closed `---` block on line 1, else undefined. Fold range is
`0..end` when `end >= 2` (at least one line in between, FR-001).

**Alternatives considered**: a fourth copy of the fence scan (three exist).

## R4. Setting and button

**Decision**: boolean setting `doorstop.foldYamlHeaderOnOpen`, default false.
Two commands, `doorstop.foldYamlHeaderOnOpen.on` / `.off`, shown in `view/title`
of `doorstop.treeView` with `when` clauses on `config.doorstop.foldYamlHeaderOnOpen`.
The `config.` context key follows the setting by itself, so no `setContext` is needed
(FR-005). The commands write `ConfigurationTarget.Workspace` like the
problem-reporting button (spec 032), `Global` when no folder is open.

**Alternatives considered**: `setContext` + watcher as in `watchProblemReportingMode`:
needed there for a three-value enum mirror; not needed for a boolean `config.` key.
