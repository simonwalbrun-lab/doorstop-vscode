# Bug Verification: Startup validation and tree load compete, tree takes ~26 s

- **Slug**: tree-load-slow-at-startup
- **Tested**: 2026-11-04
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

The new test and all the suites that touch the changed code pass, and type-check and lint are clean. The cold-start reproduction was not run, so the speedup is not confirmed on the real project.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | Cold start of the 9,000-item project with Automatic reporting, read `tree.load` | not-run | Needs a cold file cache and the user's project. A warm run cannot show the slowdown (earlier test: `/tree` 5.3 s alone, 5.2 s with `/validate`). |
| New test | `npx vscode-test --label documentSkip` | pass | 5 passing, including "loadItems resolves only after the load and shares it with getChildren". |
| Regression suites | `regressionFixture` / `problemReporting` / `emptyFolderBootstrap` / `timing` | pass | 85 / 12 / 14 / 18 passing. |
| Unit suite | `npx vscode-test --label unit` | pass on rerun | First run: 27 passing, 1 failing (test not identified; the log showed gallery network errors and diagram backup warnings). The immediate rerun: 28 passing. |
| Type-check, lint, bundle | `npm run compile-tests`, `npm run compile` | pass | No errors or warnings. |

## Output Excerpts

```
documentSkip: ✔ loadItems resolves only after the load and shares it with getChildren — 5 passing
regressionFixture: 85 passing
unit: 28 passing (rerun)
```

## Residual Risks

- The cold-start speedup rests on the user's earlier measurement (`tree.load` 6.2 s with validation off, 25.9 s with it on), not on a run of the fixed build.
- The ordering in `refreshViews` is not tested directly; the test covers `loadItems()` only.
- One unexplained failure in `unit` on the first run. It did not repeat; if it returns, record which test it is.
- The cause (competing reads versus something else) is shown by the user's on/off comparison, not by a profile of the disk contention.

## Recommendation

Hold until one manual check: set `doorstop.problemReporting` to automatic, do a cold start with timing on, and confirm `tree.load` is near 6 s and `validation.run` starts after it. If so, close the bug. If `tree.load` is still near 25 s, reopen and re-run `/speckit-bug-assess` with that timing output.
