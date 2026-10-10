# Quickstart: Validate Progress Notifications

## Automated (CI)

```sh
npm run compile          # type-check + lint + build (Principle V)
npm test                 # includes src/test/progress.test.ts
```

Expected: the progress suite passes the three cases from
[research.md R4](research.md#r4--testing-in-ci-without-reading-the-screen-principle-vi)
(slow → one toast by 1.2 s; fast → none; slow failure → one toast, original
error, no unhandled rejection). All existing suites stay green.

## Manual (F5 Extension Development Host)

Use a Doorstop project. Rows marked "large project" need one whose operations
take more than 1 s (several hundred items); on a small project those rows
correctly show no notification.

| # | Action | Expected |
| - | ------ | -------- |
| 1 | Open the workspace | "Starting Doorstop server…" appears if start takes > 1 s, closes when ready; "server is ready" message follows |
| 2 | Run *Doorstop: Restart Server* | "Restarting Doorstop server…" while > 1 s |
| 3 | Run *Doorstop: Recheck Problems* on a large project | "Doorstop: Checking requirements…" until the Problems panel updates |
| 4 | Edit a requirement file and type | No notification for the automatic re-check (FR-006) |
| 5 | Run *Doorstop: Refresh* on a small project | No notification (finishes < 1 s) |
| 6 | Run *Doorstop: Publish* → wait in the destination picker for 5 s | No notification while the picker is open (FR-005) |
| 7 | Stop the server, run *Doorstop: Add Item* | Existing error message only, no notification |
| 8 | Run *Doorstop: Install Server Package* (env without the package) | Notification shows immediately, as before (FR-007) |

See [contracts/delayed-progress.md](contracts/delayed-progress.md) for the
guarantees each check maps to.
