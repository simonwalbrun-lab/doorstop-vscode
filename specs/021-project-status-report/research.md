# Research: Commands Panel Updates & Project Status Report

## R1 — Publish "All": loop in the extension vs. Doorstop tree publish

- **Decision**: The extension loops over the documents and calls the existing
  `POST /documents/{prefix}/publish` once per document, writing
  `<folder>/<PREFIX><ext>` (`.md`/`.html`/`.tex`, as in `_PUBLISH_EXTENSIONS`).
  No server change.
- **Rationale**: Per-document calls reuse Doorstop's own per-document
  `publisher.publish` (Principle II is kept: rendering is still Doorstop's).
  The server's lock already serializes the calls (Principle I).
- **Failure (clarified)**: the loop stops at the first document whose
  request fails, and the error names that prefix:
  `Doorstop command failed: Publish of <PREFIX> failed: <reason>`. Documents
  already written stay on disk.
- **Alternatives**: Calling `publisher.publish(tree, folder)` once through a new
  `/publish` endpoint. Rejected: the user asked for no server change (clarification
  2026-10-04), and it needs a new endpoint, schema and test for no user-visible gain.

## R2 — Picker for "All"

- **Decision**: Reuse `chooseDocumentOrAll` from `src/doorstopCommands.ts`,
  the picker Review/Clear already use (`all` is its last entry).
- **Rationale**: It already exists. Moving `all` to the top would also change
  Review/Clear for no requested reason. The spec's FR-001 was adjusted to match.

## R3 — Running indicator and duplicate-run guard

- **Decision**:
  - `run()` in `registerDoorstopCommands` (every command's server work already
    goes through it) takes the command title and wraps the work in
    `vscode.window.withProgress({ location: Notification, title })`. Prompts
    happen before `run()`, so FR-008 holds without extra code.
  - The same `run()` keeps a `Set<string>` of titles whose work is in
    progress. When `run(title, …)` is called for a busy title, it shows
    `Doorstop: <title> is already running.` and returns `undefined`. The title
    is removed in `finally`, so errors always release it.
  - The guard is not in `register()` on purpose. The manual Reorder handler
    stays open while it waits on its "Apply Reorder" notification, and the
    second step is to run Reorder again. A whole-handler guard would block
    that step.
- **Rationale**: `run()` is the single choke point every command's work passes
  through, so all commands get the behaviour from one edit. `withProgress` is the
  editor's own spinner (no custom UI, no dependency).
- **Alternatives**:
  - Progress on the Commands view (`location: { viewId }`): shows only a thin
    bar on the panel, invisible when the command was run from the palette.
    Rejected.
  - Status-bar item managed by hand: more code than `withProgress`.
  - Disabling the panel row while busy: TreeItems can't be disabled; it would
    need a `when` context key per command. Rejected.

## R4 — Status-report data sources

- **Decision**: Item counts from `GET /tree` (`documents[].items.length`);
  problem counts from `GET /validate`, grouped by `documentPrefix` and then by
  `check`.
- **Rationale**: Same endpoints the Explorer and Problems view use, so SC-005
  ("numbers match") holds by construction. `check` is the problem-type field
  the server already classifies (spec 014), so the extension does not parse
  `message` (Principle I).
- **Alternatives**: A new `/stats` endpoint. Rejected: the two existing
  endpoints already return everything the report needs.

## R5 — Requirement volatility source

- **Decision**: The extension runs
  `git log --since="26 weeks ago" --format=%x00%aI --name-only --relative`
  with `cwd` = workspace folder, through `child_process.execFile` (Node
  stdlib). Each record is an author date followed by changed paths. A path
  counts as an item file when:
  - its directory equals a document directory (`dirname(markerPath)`,
    workspace-relative, from `/tree`),
  - its basename starts with that document's prefix (case-insensitive), and
  - its extension is `.yml` or `.md`.

  Counts are summed per week (weeks start Monday, local time); all 26 weeks are
  emitted, including zero weeks.
- **Rationale**:
  - Git history is not Doorstop functionality, so Principles I/II don't apply.
    `execFile` with an argument array avoids shell injection and needs no
    dependency (Principle IV).
  - The name rule also counts items that were deleted since, which matching
    against current item paths would miss.
  - `--relative` keeps paths workspace-relative and limits the log to the
    workspace.
- **Alternatives**: The VS Code git extension API. Rejected: it exposes
  repository state, not a `log --name-only` per commit, and it may be disabled.
  Running git on the server: same command, but it adds an endpoint for data
  that is not Doorstop's.
- **Failure**: If git is missing, the folder is not a repository, or the command
  fails, the volatility section reads "Version history unavailable: <reason>"
  (FR-017).

## R6 — Mermaid chart syntax

- **Decision**: `xychart` with a quoted category x-axis and one `bar`
  series:

  ```text
  xychart
      title "Items per document"
      x-axis ["REQ", "TST"]
      y-axis "Items"
      bar [12, 4]
  ```

  Labels are quoted, and `"` is stripped from them.
- **Rationale**: `xychart` is the Mermaid bar-chart type the user asked for
  ("xy diagram with bars"). GitHub renders it. VS Code's built-in preview needs
  a Mermaid preview extension; the spec assumes a Mermaid-capable viewer.
- **Empty data**: An `xychart` with an empty x-axis is invalid, so an empty
  section is written as a sentence ("No documents", "No problems") instead of a
  chart.

## R7 — Report output

- **Decision**: Write `doorstop-status.md` into the workspace root with
  `vscode.workspace.fs.writeFile`, overwrite it, then `showTextDocument`.
  Markdown is built by a pure function
  `buildStatusReport(input): string` in a new `src/statusReport.ts`. All data
  is fetched first, so on a fetch failure nothing is written (FR-019).
- **Rationale**: The pure builder is unit-testable without a server or git
  (Principle VI). One new file only.

## R8 — Test strategy (Principle VI)

- **Decision**: `src/test/statusReport.test.ts` (vscode-test, already in CI):
  - `buildStatusReport` checks chart blocks, counts, the "No problems" and
    "history unavailable" text, and 26 week buckets;
  - the git-log parser runs on a fixed string;
  - for the panel entry, the existing `packageMenus.test.ts` style is
    extended to assert that `doorstop.statusReport` is contributed.
- **Publish All / progress**: These are thin loops around already-tested
  endpoints. Covered by the existing server publish tests in
  `server/tests/test_documents.py`. A unit test for the "All" result summary
  is added only if summary logic is extracted (see tasks).
