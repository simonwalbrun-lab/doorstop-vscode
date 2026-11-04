# Bug Verification: hover renders item text as trusted Markdown

- **Slug**: hover-istrusted
- **Tested**: 2026-11-04
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

Both hover `MarkdownString`s now use `isTrusted = { enabledCommands: ['vscode.open'] }`. No `isTrusted = true` remains in `src`. The new tests and the regression suites pass. The pre-fix failure of the new tests was not executed, because source files must not be modified in this run.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | Code inspection (`grep isTrusted src`) plus the automated equivalent, the new unit tests | pass | The manual click in a live hover was not exercised. The tests assert the `isTrusted` value, which is what VS Code enforces. |
| New / updated tests | `npx vscode-test --label unit` | pass | 28 passing, 0 failing, including both "Hover trust" tests. |
| Regression suite | `npx vscode-test --label regressionFixture` | pass | 85 passing, 0 failing. |
| Lint / type-check | `npm run compile` (tsc, eslint, esbuild) | pass | Exit 0. |
| Pre-fix failure of the new test | not run | not-run | Source must not be modified. The test deep-equals `{ enabledCommands: ['vscode.open'] }`, so it would fail against `true`. |

## Output Excerpts

```
Hover trust (bug hover-istrusted)
  ✔ item preview only enables vscode.open, so command links in item text stay inert
  ✔ reverse-link hover only enables vscode.open
28 passing (2s)
85 passing (43s)
```

## Residual Risks

- `vscode.open` can still be abused to open arbitrary URIs. This was accepted in the assessment.
- The live hover click was not tested manually.
- The fix is already in commit 1ed8ee7. The working tree has unrelated changes (`src/callHierarchyProvider.ts`, `temp.md`).

## Recommendation

Close the bug. The code and automated checks confirm the fix.
