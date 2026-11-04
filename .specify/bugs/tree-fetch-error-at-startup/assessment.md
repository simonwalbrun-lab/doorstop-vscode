# Bug Assessment: Tree view shows "fetch failed" toast while the server is still starting

- **Slug**: tree-fetch-error-at-startup
- **Created**: 2026-11-04
- **Source**: pasted text
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

> during start of the extension I get the error Doorstop tree view: could not reach the Doorstop server (fetch failed). and than is does take a while and than the threeview appears.

## Symptom

On startup an error toast "Doorstop tree view: could not reach the Doorstop server (fetch failed)." appears. The tree stays empty for a while and then fills in. Expected: while the server is starting, the tree shows a "starting" state with no error toast, and fills once the server is up.

## Reproduction

1. Open a workspace with Doorstop documents and the Doorstop view visible in the sidebar.
2. Reload the window (or start VS Code).
3. The toast appears at once. The tree fills only after "Doorstop server is ready."

Not tried here; the path below is read from the code. [NEEDS CLARIFICATION: confirm the toast is followed by "Doorstop server is ready."]

## Suspected Code Paths

- `src/extension.ts:145`: `registerServerStartup` is awaited last (the fix for `activation-blocks-server-start`). The tree view is registered at `extension.ts:129`, so VS Code calls `getChildren` before the server exists.
- `src/requirementTree.ts:173-212`: `getChildren` → `loadItems` → `fetchItems` → `server.request('GET', '/tree')`. Its catch shows the error toast and sets `loaded = true`.
- `src/doorstopServer.ts:56,210`: `port` is `0` until the server prints `DOORSTOP_PORT=`, so `send()` fetches `http://127.0.0.1:0/tree`. That throws `TypeError: fetch failed`, the exact text in the toast.
- `src/serverStartup.ts:114-127` and `src/doorstopServer.ts:73,262`: the delay is the package check (a Python spawn), the server spawn and the health poll, up to 15 s.
- `src/extension.ts:146`: `onStarted` → `refreshViews()` → `treeProvider.refresh()`. This is why the tree fills afterwards.

## Root Cause Hypothesis

A regression exposed by the `activation-blocks-server-start` fix, which listed this risk as a follow-up ("tree shows 'server not available' and no error toast", not yet checked). The tree is now visible and queried before the server runs. `fetchItems` treats "not started yet" as a connection error, shows a toast and marks the tree loaded and empty. The later `refresh()` repairs it, which matches "takes a while, then appears". Confidence: high.

## Proposed Remediation

**Preferred**: In `fetchItems` (`requirementTree.ts`), if `!this.server.isRunning`, set neither `loaded` nor the toast: return without loading, so a later `refresh()` (already fired by `onStarted`) loads for real. To give the user something to see meanwhile, return no items and let the view show a `viewsWelcome` entry ("Doorstop server is starting…") gated on a context key, or, simplest, use `treeView.message`. Keep the toast for a failure when the server is running, or when the start failed.

Detail to settle in the fix: `loaded` must stay false in the not-running case so `loadItems` does not cache an empty result. `loading` must be cleared, or the pending promise would be reused. `refresh()` already resets both.

**Alternatives**:
- Make `DoorstopServer.request` wait for `startPromise` before sending. The tree then shows a spinner and fills by itself, with no empty state. This changes a shared path used by every provider, and an absent package or an unanswered install prompt would hang each request forever. Higher risk.
- Only suppress the toast for the first failed load. The tree would still be marked loaded and empty until `onStarted`. Smaller, but it hides a real failure if the start fails.

**Files likely to change**:
- `src/requirementTree.ts`
- `package.json` (only if a welcome text or context key is used)
- `src/test/` (a tree-provider test)

**Tests to add or update**:
- A `DoorstopTreeProvider` with a stub server where `isRunning` is false: `getChildren()` shows no toast and does not set `loaded`, and after the stub starts and `refresh()` runs, the items load.
- With `isRunning` true and a failing request: the toast still appears once.

## Risks & Considerations

- If the server never starts (package missing, install prompt dismissed), the tree stays empty. A message pointing to "Doorstop server unavailable" and "Restart Extension" is needed, or the user sees a blank view with no hint. The start-failure warning from `serverStartup.ts:64` already appears, so this is a UX gap, not a regression.
- The other `getChildren` callers (`setActiveResource`, reveal) await the same `loadItems` and will wait on an empty tree until refresh; check `treeView.reveal` is not broken at startup.
- The same "server not running" assumption may exist in the other views: problems, document view, hover. The earlier fix flagged this and it was not verified. Out of scope here, but worth a manual pass.
- The 15 s start delay itself is not touched. Whether Windows spawn time for the package check plus server can be cut is a separate performance question.

## Open Questions

- [NEEDS CLARIFICATION: how long is "a while"? If well above ~5 s, a separate look at startup time (`isServerPackageInstalled` plus health polling at 100 ms) is worthwhile.]
- [NEEDS CLARIFICATION: is "Doorstop server is ready." shown after the toast, or does the server fail to start?]
