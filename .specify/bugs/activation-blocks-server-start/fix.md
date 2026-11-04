# Bug Fix: activate() waits for the server start (and for the install prompt)

- **Slug**: activation-blocks-server-start
- **Fixed**: 2026-11-01
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Took the preferred remediation. `await registerServerStartup(...)` moved to the end of `activate()`, so every command, view and provider is registered before the first server start or the install prompt can block. `onStarted` now calls `refreshViews()`, so the tree, commands view and problems check update after the first start.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/extension.ts` | modified | Startup block moved to the end of `activate()`. `onStarted` now refreshes the views. Removed the activation-time `if (isRunning && automatic) refreshNow()` and the unused `problemReportingMode` import. |
| `src/serverStartup.ts` | modified | Corrected the misleading comment at the `watchInterpreter` call. |

## Tests Added or Updated

- None. The test the assessment asks for (a server stub whose `start()` never resolves) can't be written in the current setup. `activate()` builds its own `DoorstopServer`, and tests load the bundled `dist/extension.js`, so neither the server nor `registerServerStartup` can be swapped out. The test host also has no `ms-python.python`, so the start path is never reached under test.

## Local Verification

- `npm run compile` (tsc + eslint + esbuild) → clean
- `npx vscode-test --label unit` → 28 passing
- `npx vscode-test --label regressionFixture` → 85 passing
- `npx vscode-test --label emptyFolderBootstrap` → 14 passing (covers activation and command registration)
- `npx vscode-test --label problemReporting` → 12 passing
- `npx vscode-test --label reviewLensScan` → 8 passing
- `git status testdata` → clean

## Deviations from Assessment

- The removed `isRunning` check would never have fired once the startup moved to the end, because the server is not up yet when it runs. The first Automatic-mode problems check now comes from `onStarted` → `refreshViews()` → `scheduleRefresh()`. That happens once a server came up and only in Automatic mode, as before, but after the debounce interval instead of immediately.

## Follow-ups

- Manually check, with a slow or absent server, that the tree, document view and filter notebook show "server not available" and no error toast (assessment risk 1).
- After a restart, `onStarted` and `onRestartCommand` both call `refreshViews()`. The tree refreshes twice, which is harmless.
