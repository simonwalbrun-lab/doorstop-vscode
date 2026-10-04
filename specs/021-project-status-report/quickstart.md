# Quickstart: validating feature 021

## Prerequisites

- `npm ci` and `pip install -e "./server[dev]"` have been run.
- `git` is on PATH.
- A Doorstop sample project that is a git repository and has at least 2
  documents. The repository's own `reqs/` setup (or the spec 012 test model)
  works.
- Optional: a Mermaid preview extension for VS Code, to see the charts rendered.

## Automated

```bash
npm test             # includes src/test/statusReport.test.ts
pytest server/tests  # existing publish tests cover the per-document call
```

Expected result: all suites pass.

## Manual scenarios

1. **Publish All** (US1)
   1. Open the Commands panel and click Publish Document.
   2. Choose `all`, then HTML, then an empty folder.
   3. Expected: there is one output per document in that folder, plus one
      summary message with the count.
   4. Repeat with one document's template folder broken. Expected: the run stops with an error naming
      that document, and no success summary appears.
2. **Running indicator** (US2)
   1. Run Publish → `all`. Expected: a "Doorstop: Publish…" progress
      notification is visible until the summary appears.
   2. Click Publish again while it is still running. Expected: the
      "already running" message appears and no second run starts.
   3. Start Export and press Escape at the first prompt. Expected: no progress
      notification appears.
3. **Status report** (US3/US4)
   1. Click Generate Status Report in the Commands panel.
   2. Expected: `doorstop-status.md` opens. It has the items chart (counts match
      the Explorer), one problems chart per document (counts match the
      Problems view grouped by type), and a 26-bar volatility chart.
   3. Copy the project out of git (no `.git`) and run again. Expected: the
      volatility section reads "Version history unavailable: …".
   4. Stop the server and run again. Expected: an error message is shown and
      the old file is left unchanged.

See [contracts/status-report-format.md](contracts/status-report-format.md) and
[contracts/commands.md](contracts/commands.md) for the exact expected output.
