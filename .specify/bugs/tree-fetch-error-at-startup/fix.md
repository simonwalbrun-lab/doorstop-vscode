# Bug Fix: Tree view shows "fetch failed" toast while the server is still starting

- **Slug**: tree-fetch-error-at-startup
- **Fixed**: 2026-11-04
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`DoorstopTreeProvider.fetchItems` now returns quietly, without a request, toast or `loaded` flag, while the server has no port yet (still starting). The refresh from `onStarted` then loads the tree.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/requirementTree.ts` | modified | Early return in `fetchItems` when `!this.server.port`. |
| `src/test/documentSkip.test.ts` | modified | Existing stub gets `port: 1`; new test for the not-started case. |

## Tests Added or Updated

- `documentSkip.test.ts`: "a tree asked before the server runs stays empty without a request, then loads after refresh".

## Local Verification

- `npm run compile-tests`, `npm run compile` → clean
- `documentSkip` 4 passing, `regressionFixture` 85 passing, `emptyFolderBootstrap` 14 passing, `unit` 28 passing
- Not checked by hand: the real startup in the Extension Development Host.

## Deviations from Assessment

- The assessment suggested `server.isRunning`. I used `server.port === 0` instead: the `regressionFixture` suite points the extension's server at a separate process, so `isRunning` is false there (37 failures on the first attempt). `port` is 0 exactly while the failing `http://127.0.0.1:0/…` request would be made, and it stays set if the server crashes later, so that case still shows the toast.
- No "server is starting" message in the view. The tree is empty until the server is up. The existing welcome text ("No Doorstop document yet…") shows meanwhile, which may mislead.

## Follow-ups

- Decide whether to show a "server starting" message (`viewsWelcome` with a context key, or `treeView.message`) so the empty view during the start is not read as "no documents".
- Same check for the other views and providers before the server is up (document view, hover, problems), as in the earlier fix.
- Startup time itself (package check + spawn + health polling) is untouched.
