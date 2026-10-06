# Quickstart: Validating Execution Timing

## Prerequisites

- `pip install -e "./server[dev]"` (server from this branch, so it emits `Server-Timing`)
- `npm ci`

## Automated checks (what CI runs)

```sh
pytest server/tests/test_timing.py   # header present, stages numeric, wait ≥ 40 ms under contention
npm run compile                      # type-check + lint + build
npm test                             # includes src/test/timing.test.ts + end-to-end refresh case
```

Expected: everything green. The source-scan test fails if any
`vscode.commands.registerCommand(` call outside `src/timing.ts` was missed.

## Manual walkthrough (Extension Development Host, F5)

1. Open a workspace with a Doorstop project. Set `"doorstop.timing.enabled": true`.
2. **US1**: Click refresh in the Doorstop tree, then run `Doorstop: Recheck Problems`.
   → The "Doorstop Timing" channel shows a short `doorstop.refresh` line, followed
   by a separate `tree.load` line with `GET /tree` nested under it. The refresh
   only asks the tree to reload; VS Code performs the load afterwards. The
   `doorstop.recheckProblems` line has `validation.run` with `GET /validate` and
   `GET /tree` nested under it, each with `wait · load · work · other` (from US3).
   A delayed re-check that a command scheduled appears as its own top-level
   `validation.run` line.
3. **US1 (failure)**: Stop the server with `Doorstop: Restart Server` while a refresh is
   pending, or point to a non-existent UID.
   → The entry is logged with outcome `failed`.
4. **US2**: Refresh 5×, then open the document view of one document twice. Run
   `Doorstop: Show Timing Summary`.
   → The `doorstop.refresh` count is 5, the `documentView.load` count is 2, and every row
   has min ≤ avg ≤ max. Rows are sorted by total.
5. **US2 (reset)**: Run `Doorstop: Reset Timing Data`, then show the summary.
   → `No timing data recorded.`
6. **US3**: Trigger two server-backed commands quickly one after another, e.g.
   Validate and Refresh.
   → One of the `GET` lines shows a non-zero `wait`.
7. **US4**: Run `Doorstop: Export Timing Data…`, save, and open the file.
   → It is valid against [contracts/timing-export.schema.json](contracts/timing-export.schema.json).
   With no data, an info message appears and no file is written.
8. **Disabled**: Set the setting to `false` and refresh.
   → No new lines appear in the channel, and the three timing commands disappear
   from the Command Palette.
9. **Older server**: Run against a PyPI server release that predates this feature.
   → Extension entries still appear, server lines have no stages, and there are no errors.
