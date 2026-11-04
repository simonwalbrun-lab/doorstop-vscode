# Bug Verification: diagram drag-and-drop of a path containing "%" failed silently

- **Slug**: diagram-dnd-percent-silent
- **Tested**: 2026-11-04
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The fix holds. `droppedTextToUid` wraps `decodeURIComponent` in try/catch with a raw-text fallback, and all callers go through it. No regressions. The drop-to-UID step is covered by unit tests only; the webview message path was not driven end to end.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Code inspection | read src/diagrammPanel.ts | pass | L99-113 try/catch fallback; `handleDroppedData` (L695) calls `droppedTextToUid`; callers at L472 and L602 call `handleDroppedData`, so all paths share the fix |
| Pre-fix behavior (pure-logic copy) | node script in scratchpad | pass | Old logic throws URIError on `C:\x\reqs 100%\REQ-001.md`; new logic gives `REQ-001`. The real function imports vscode, so the parsing logic was copied, not loaded |
| Type check, lint, build | `npm run compile` | pass | exit 0 |
| Test compile | `npm run compile-tests` | pass | exit 0 |
| New tests | `npx vscode-test --label diagramLayout` | pass | 24 passing, 0 failing |
| Regression | `npx vscode-test --label unit` | pass | 28 passing, 0 failing |

## Output Excerpts

- Old logic: `URIError`. New logic: `REQ-001`.

## Residual Risks

- Follow-up (not a defect of this fix): the `resolveDroppedItem` handler (L187-191) awaits `handleDroppedData` with no catch, so any other unexpected throw would still be silent. Confirmed present.
- Tests check the parsed UID only, not the `resolveDroppedItem` to `addNode` flow. No manual drag in a real webview was done.
- Pre-fix failure of the new tests was shown by replicating the logic, not by running the tests against the old source.
- `testdata/` was clean after the runs. No doorstop_server processes were left running.

## Recommendation

Close the bug. Consider a separate ticket to add a try/catch with a user-visible error to the `resolveDroppedItem` handler.
