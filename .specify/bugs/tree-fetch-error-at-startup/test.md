# Bug Verification: Tree view shows "fetch failed" toast while the server is still starting

- **Slug**: tree-fetch-error-at-startup
- **Tested**: 2026-11-04
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

The new test and all suites that touch the tree pass, and type-check and lint are clean. The real startup (reload the window, watch for the toast) was not exercised, so the original symptom is not confirmed gone end to end.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | Reload the window in a development host and watch for the toast | not-run | Needs a manual run with the Python extension; the test host has none. |
| Automated equivalent | `npx vscode-test --label documentSkip` | pass | 4 passing, including the not-started case: no request, empty tree, loads after refresh. |
| Regression suites | `regressionFixture` / `emptyFolderBootstrap` / `unit` / `problemReporting` | pass | 85 / 14 / 28 / 12 passing. |
| Type-check, lint, bundle | `npm run compile-tests`, `npm run compile` | pass | No errors. |

## Output Excerpts

```
✔ a tree asked before the server runs stays empty without a request, then loads after refresh
4 passing
regressionFixture: 85 passing
```

## Residual Risks

- The reproduction was not run. The fix relies on `onStarted` → `refreshViews()` loading the tree after the start, which the unit test only simulates with `refresh()`.
- While the server starts, the view shows the "No Doorstop document yet" welcome text, which can mislead.
- If the server never starts, the tree stays empty; only the start-failure warning explains it.
- Startup time is unchanged.

## Recommendation

Hold until one manual check: reload the window in the Extension Development Host and confirm there is no toast and the tree fills after "Doorstop server is ready." If so, close the bug. Consider a "server is starting" message in the view as a follow-up.
