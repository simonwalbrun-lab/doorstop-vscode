# Bug Fix: Startup validation and tree load compete, tree takes ~26 s

- **Slug**: tree-load-slow-at-startup
- **Fixed**: 2026-11-04
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`refreshViews` now schedules the problems check only after the tree load has finished, so the check's own read of the project no longer competes with the tree's. `DoorstopTreeProvider.loadItems` is public for that.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/extension.ts` | modified | `refreshViews`: `void treeProvider.loadItems().then(() => problemsProvider?.scheduleRefresh())` instead of scheduling at once. |
| `src/requirementTree.ts` | modified | `loadItems()` made public, with a doc comment. It joins the load the view already started. |
| `src/test/documentSkip.test.ts` | modified | New test, see below. |
| `src/serverStartup.ts`, `src/extension.ts` | modified | `measure(...)` stages (`startup`, `startup.*`) added earlier in this session for the profiling. No behaviour change; recorded under the profiling request, not part of this fix. |
| `server/tools/profile_load.py` | added | Script that splits the server's load time on a real project. Not part of the fix. |

## Diff Highlights

```ts
refreshViews = () => {
  treeProvider.refresh();
  commandsProvider.refresh();
  void treeProvider.loadItems().then(() => problemsProvider?.scheduleRefresh());
};
```

## Tests Added or Updated

- `documentSkip.test.ts`: "loadItems resolves only after the load and shares it with getChildren". It checks that `loadItems()` is not settled while the server has not answered, and that one request serves both callers.

## Local Verification

- `npm run compile-tests`, `npm run compile` → clean
- `documentSkip` 5 passing, `regressionFixture` 85, `problemReporting` 12, `emptyFolderBootstrap` 14, `unit` 28
- Manual: not done for the fix itself. The evidence is the user's timing with validation off (`tree.load` 6.2 s instead of 25.9 s).

## Deviations from Assessment

- The assessment asks for a test that `scheduleRefresh()` is not called before `loadItems()` resolves. `refreshViews` is a closure inside `activate()`, so that ordering is not tested directly; the test pins the property it relies on (`loadItems()` settles after the load and shares it). Testing the ordering itself would need `refreshViews` extracted from `activate()`.

## Follow-ups

- Cold-start check by the user: `tree.load` near 6 s, and `validation.run` starting after it, with `doorstop.problemReporting` = automatic.
- Remaining startup time is the Python extension becoming ready (about 2.4 s), the server start (about 2 s) and Doorstop's own item parsing (about 5 s for 9,000 items); none of it is touched.
