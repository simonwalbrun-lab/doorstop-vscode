# Bug Verification: object-storage endpoint settable by workspace

- **Slug**: endpoint-setting-scope
- **Tested**: 2026-11-04
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

The fix is in place and all checks pass. `endpoint` and `region` are `machine` scoped, the other attachment settings are unchanged, and the docs and error message are updated. The one thing not exercised is the end-to-end claim that VS Code drops a workspace-level endpoint, so the result is partial.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Manifest scopes | inspect `package.json` | pass | `endpoint`, `region`: machine; `storage`, `thresholdMB`, `bucket`, `prefix`, `publicUrl`: resource |
| Reader unchanged | inspect `src/attachments.ts` | pass | still `getConfiguration('doorstop.attachments', request.uri)` (line 223); missing-endpoint error says "in User settings" (line 193) |
| Docs | inspect `README.md`, `CHANGELOG.md` | pass | README lines 88 and 130; CHANGELOG has a **Breaking** entry |
| Compile | `npm run compile` | pass | exit 0 |
| Compile tests | `npm run compile-tests` | pass | exit 0 |
| New / updated tests | `npx vscode-test --label attachments` | pass | 21 passing, 0 failing |
| Regression | `npx vscode-test --label unit` | pass | 28 passing, 0 failing |
| Manifest contributions | `npx vscode-test --label packageMenus` | pass | 16 passing, 0 failing |
| Workspace value ignored (reproduction) | not run | not-run | see Residual Risks |

## Output Excerpts

attachments: `21 passing`; unit: `28 passing`; packageMenus: `16 passing`. `git status testdata` is clean and no doorstop_server process is running.

## Residual Risks

- The attack reproduction was not exercised. No test checks that a workspace-level `endpoint` is ignored, because the attachments suite runs without a workspace folder. I did not build a throwaway workspace test. Reliance is on VS Code's documented behaviour: a setting with `"scope": "machine"` is read only from User and Remote settings, and workspace values are ignored (VS Code `contributes.configuration` docs, `scope` property: https://code.visualstudio.com/api/references/contribution-points#contributes.configuration).
- Existing users with the endpoint in workspace settings must move it to User settings (documented as Breaking).
- Open question carried over: is a per-repo endpoint a real requirement? If so, the per-endpoint credentials alternative applies.
- `publicUrl` stays `resource` by design.

## Recommendation

Close the bug on the strength of the manifest change and the passing checks. Optionally confirm manually once: put a different endpoint in a workspace `.vscode/settings.json` and check that it is ignored.
