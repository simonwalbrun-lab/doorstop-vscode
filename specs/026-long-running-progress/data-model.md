# Data Model: Progress Notifications for Long-Running Commands

No persisted data and no server-side changes. The only state is per call and
in memory:

## Delayed progress run (one per `withDelayedProgress` call)

| Field | Meaning |
| ----- | ------- |
| `title` | User-facing operation name shown in the toast (FR-003) |
| `work` | The promise of the running work, started immediately |
| `timer` | 1000 ms timer armed at start; cleared when `work` settles |

**States**

```text
running-silent ──(work settles < 1 s)──▶ done (no toast)
running-silent ──(timer fires)──────────▶ running-toast
running-toast  ──(work settles)─────────▶ done (toast closed)
```

`done` returns the work's value or rethrows its error unchanged.

## Module state

| Field | Meaning |
| ----- | ------- |
| `progress` | The function used to show the toast; `vscode.window.withProgress` by default, replaced only by `setProgressForTest` |
