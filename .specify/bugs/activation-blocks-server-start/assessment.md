# Bug Assessment: activate() waits for the server start (and for the install prompt)

- **Slug**: activation-blocks-server-start
- **Created**: 2026-11-01
- **Source**: pasted text
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

> activation blocking on the server start

## Symptom

`activate()` awaits the whole first server start before it registers the tree view provider, the commands, hovers, folding, and the other features. This takes up to the 15 s health timeout. If the server package is missing, `activate()` waits until the user answers the "Install / Dismiss" warning, which can be indefinitely. Meanwhile every Doorstop command fails with "command not found" and the views stay empty. Expected behavior: features register immediately, and the server comes up in the background. The comment at `src/serverStartup.ts:157` says "Only the first start is awaited so activation never blocks on the wait", which is the opposite of what happens.

## Reproduction

1. Select an interpreter without `doorstop-vscode-server` installed and open a Doorstop workspace.
2. Do not answer the install prompt. Run any Doorstop command from the palette. It is not found.
3. With the package installed, run a command within the first seconds after opening, before "Doorstop server is ready". Same result.

## Suspected Code Paths

- `src/extension.ts:41`: `await registerServerStartup(...)` comes before every other registration (`extension.ts:48` onward).
- `src/serverStartup.ts:167-171`: `await watchInterpreter(api, …, async pythonPath => { await startDoorstopServer(…) })`.
- `src/pythonEnvironment.ts` `watchInterpreter`: its initial `await check()` runs `await onPath(path)` for the current interpreter, so the first start is awaited.
- `src/serverStartup.ts:115-127`: `startDoorstopServer` awaits `isServerPackageInstalled`, then either `promptToInstallServerPackage` (awaits `showWarningMessage`) or `spawnServerProcess` (awaits `server.start`, 15 s timeout, `src/doorstopServer.ts:59`).

## Root Cause Hypothesis

The awaited chain runs from `activate()` through `watchInterpreter`'s initial `check()` into the server start and the install prompt. Confidence: high.

## Proposed Remediation

**Preferred**: In `extension.ts`, move `await registerServerStartup(...)` to the end of `activate()`, after all providers and commands are registered. This is a single moved block. The `onStarted` hook should also call `refreshViews()` (not just `problemsProvider?.scheduleRefresh()`), so the tree populates once the first start finishes. Views already have to handle "server not running", because a restart passes through the same state.

**Alternatives**:

- Keep the order, but don't await the first `onPath` inside `watchInterpreter` (`void onPath(path)`). This also makes `activate()` resolve immediately, but it changes a shared helper and its error flow.

**Files likely to change**:

- `src/extension.ts`
- `src/serverStartup.ts` (the comment at L157)
- `src/test/extension.test.ts`

**Tests to add or update**:

- Activate with a server stub whose `start()` never resolves. Assert that `doorstop.*` commands are registered (`vscode.commands.getCommands`).

## Risks & Considerations

- Providers may now query a server that is not up yet. Check that the tree, document view, and filter notebook show the "server not available" state rather than an error toast.
- Integration tests that assume the server is ready when `activate()` resolves need an explicit wait.

## Open Questions

- None.
