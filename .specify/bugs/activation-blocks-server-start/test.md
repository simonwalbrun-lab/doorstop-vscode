# Bug Verification: activate() waits for the server start (and for the install prompt)

- **Slug**: activation-blocks-server-start
- **Tested**: 2026-11-04
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

Code review confirms the fix: `registerServerStartup` is the last awaited step of `activate()`, `onStarted` refreshes the views, and the misleading comment is corrected. Compile and all four requested suites pass. The never-resolving start itself was not exercised, because no test or non-source method can reach it, so the result is partial.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Code review | read `src/extension.ts`, `src/serverStartup.ts` | pass | `await registerServerStartup(...)` at extension.ts:145, after every provider, command, hover, completion, quick entry and attachment registration. `onStarted` and `onRestartCommand` both call `refreshViews()`. The comment in serverStartup.ts now says activate() registers this last. |
| Reproduction (post-fix) | no Python extension / blocking server | not-run | The test host has no `ms-python.python`, so `getPythonApi()` returns undefined and the start path is never reached. There is no way to stub `start()` or the install prompt without changing source. Gap. |
| Compile | `npm run compile` | pass | tsc, eslint, esbuild clean. |
| Unit | `npx vscode-test --label unit` | pass | 28 passing |
| Activation / commands | `npx vscode-test --label emptyFolderBootstrap` | pass | 14 passing, including activation and `doorstop.restartExtension` registered after `activate()`. |
| Problem reporting | `npx vscode-test --label problemReporting` | pass | 12 passing |
| Regression fixture, run 1 | `npx vscode-test --label regressionFixture` | fail | 84 passing, 1 failing: "a new item created below the section root stays in the section view after saving" failed with `EBUSY ... unlink testdata/regression/REQ-011.yml` (Windows file lock during fixture restore). It is not the known "failed write is reported" flake, and it left `REQ-011.yml` behind. |
| Regression fixture, run 2 | same | fail | 79 passing, 6 failing. Cascade from the leftover `REQ-011.yml` (tree and document view item counts). |
| Regression fixture, run 3 | same, after deleting the leftover untracked `testdata/regression/REQ-011.yml` | pass | 85 passing |
| testdata clean | `git status --short testdata` | pass | Clean after run 3. |

## Output Excerpts

- Run 1: `84 passing, 1 failing ... EBUSY: resource busy or locked, unlink '...testdata\regression\REQ-011.yml'`
- Run 3: `85 passing`

## Residual Risks

- The never-resolving start (slow server, unanswered install prompt) is not covered by any test. It is argued from code order only. Writing the test the assessment asks for needs a seam to inject the server or `registerServerStartup`.
- The "server not available" state of the tree, document view and filter notebook before the server is up was not checked (assessment risk 1, fix follow-up 1). Still manual.
- Stale doc comment: the JSDoc on `registerServerStartup` (serverStartup.ts, "Resolves once the first start attempt is over, so activation can check `server.isRunning` afterwards") no longer matches how `activate()` uses it, since the isRunning check was removed. Cosmetic.
- The regressionFixture suite has a Windows EBUSY flake in fixture restore, separate from the known one. A failed run can leave `testdata/regression/REQ-011.yml` and make the next run fail. Not related to this fix.

## Recommendation

Close with a caveat. Code order and the regression suites support the fix, but the blocking scenario was not exercised. Do one manual check with an interpreter lacking `doorstop-vscode-server` (palette commands should work while the prompt is open), or add an injection seam for a test.
