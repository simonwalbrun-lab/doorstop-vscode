# Data Model: Commands Panel Updates & Project Status Report

All entities live in memory only. The one persisted artifact is the generated
report file. Existing server types (`DocumentNode`, `ValidationIssue` in
`src/doorstopTypes.ts`) are inputs and are not changed.

## StatusReportInput (input to the pure builder)

| Field | Type | Source |
| --- | --- | --- |
| `projectName` | string | `workspaceFolder.name` |
| `generatedAt` | Date | `new Date()` at command start |
| `documents` | `DocumentNode[]` | `GET /tree` |
| `issues` | `ValidationIssue[]` | `GET /validate` |
| `volatility` | `WeekCount[]` or `{ unavailable: string }` | `git log` (research R5) |

## Derived: document statistic

- `prefix` = `DocumentNode.prefix`
- `itemCount` = `items.length`
- `problemsByType`: map of `check` to count, built from the `issues` whose
  `documentPrefix === prefix`. One issue counts once, even when it lists
  several `uids`. That is how the Problems view counts one record.

Ordering: documents follow the `/tree` order. Problem types are sorted by
count, highest first, then by name.

## WeekCount (volatility point)

| Field | Type | Rule |
| --- | --- | --- |
| `weekStart` | Date | the Monday 00:00 (local time) of the week |
| `changedItemFiles` | number ≥ 0 | sum, over the week's commits, of the item files each commit changed |

- Exactly 26 entries, oldest first. The last one is the current week.
- Weeks without commits have value 0.
- Label in the chart: `weekStart` as `YYYY-MM-DD`.

## GitCommit (parsed git log record)

| Field | Type |
| --- | --- |
| `date` | Date (author date, `%aI`) |
| `files` | string[] (workspace-relative, `/`-separated) |

An item file follows the rule in research R5: it sits in a document's
directory, its name starts with the prefix, and the extension is `.yml` or
`.md`.

## Command run state

- `busy: Set<title>` holds the titles whose `run()` work is in progress.
  - States: idle → busy (when `run` starts) → idle (in `finally`).
  - A `run` for a busy title shows a message and does no work.
- The progress indicator is visible only while `run(title, op)` is running,
  that is, during server work and never during prompts.

## Publish-all result

- Success: `Published N document(s) to <folder>.`
- Failure: the run stops at the first failing document, and the error names
  its prefix and reason. No summary is shown.
