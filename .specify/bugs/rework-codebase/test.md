# Bug Verification: Rework codebase (diagram defects, duplicated logic, oversized functions)

- **Slug**: rework-codebase
- **Tested**: 2026-10-31
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

The fix holds: the full test suite passes (18 suites, 295 tests, 0 failing; baseline 16 suites, 279 tests), type-check and lint are clean, the production bundle builds, and every duplication/structure finding is confirmed gone by direct source checks. The result is `partial` rather than `verified` because two defect reproductions from the assessment were not exercised end to end in the UI: B1 was reproduced through the panel API rather than through the "Add to Diagram" command on real `*.doorstop.json` editors, and B3 (bare-UID drop) has no runtime check at all. A Windows-only flaky failure in the regression fixture's cleanup was also seen once during the fix.

## Checks Performed

| Check | Command / Action | Result | Notes |
| --- | --- | --- | --- |
| B1 reproduction (automated equivalent) | `npm test` › diagramLayout › "Diagram target (rework-codebase B1)" | pass | Two webview panels driven through `DoorstopDiagramPanel.createForCustomEditor`: the target follows the revealed panel, survives closing the other, and is undefined with none open. Not run through `vscode.openWith` + `doorstop.addToDiagram` (the test cannot reach the bundled extension's module instance). |
| B1 source | `grep -rn currentPanel src` | pass | 0 references left |
| B2 German text | `grep` for umlauts, `Unbenannt`, `STELLE`, `Fehler`, `Konnte`, `nicht` in `src/**/*.ts,js` | pass | 4 hits, all false positives (emoji bytes and `▶` in English strings) |
| B3 reproduction | bare-UID drop onto a canvas with a duplicate `REQ-001.yml` on disk | not-run | Needs the webview's `ready` round trip and a way to post messages into the panel; no harness exists. |
| B3 source | `grep -rn findFiles src --include=*.ts` | pass | Only a comment in `regressionFixture.test.ts:535` remains |
| R1 tree cleanup | `grep -cE "console\.log\|setActive\(\|ByItem" src/requirementTree.ts` | pass | 0; tree and reveal tests in `regressionFixture` pass |
| R2 single index | `grep` for `GET /tree` callers | pass | Remaining direct callers are the intended ones: `doorstopIndex.ts`, `deriveProvider.ts` (builds a `DoorstopIndex`), `problemsProvider.ts` (raw fetch, indexed by `DoorstopIndex`), `documentViewProvider.ts` (field snapshot, kept by plan), `requirementTree.ts` and the status report (consume the raw response) |
| R3 shared helpers | `grep` for duplicate regex definitions and `path.basename(…, extension)` | pass | All definitions only in `src/itemFile.ts` |
| R4 types | `grep -cE ":\s*any\b\|as any\|<any>" src/diagrammPanel.ts` | pass | 0 (was 23) |
| R5 `activate` | line count; `grep "as vscode.WorkspaceFolder"` | pass | 131 lines (was ~475); cast gone |
| R6 pickers | code read of `doorstopCommands.ts` | pass | `documentPicks` used by all four pickers; `publish` split skipped by design (fix.md) |
| T1 suite registration | count of `test.js'` entries in `.vscode-test.mjs` vs `src/test/*.test.ts` | pass | 18 / 18; "Server package install (feature 016)" ran and passed |
| New / updated tests | `npm test` › `itemFile`, diagram target, `serverPackageInstall` | pass | All listed tests green |
| Regression suite | `npm test` (VS Code 1.144.0 test host, Windows) | pass | exit 0, 18 suites, 295 passing, 0 failing; `testdata/` clean afterwards |
| Lint / type-check | `npx tsc --noEmit -p .`, `npx eslint src` | pass | no findings |
| Production bundle | `node esbuild.js --production` | pass | exit 0, `dist/extension.js` 115 KB (`dist/` is git-ignored) |
| S1 server measurement | `server/tools/profile_server.py` | skipped | Deferred by the assessment's default answer; server change would need its own release |

## Output Excerpts

```text
Diagram target (rework-codebase B1)
  ✔ "Add to Diagram" targets the active diagram, and closing another keeps it (110ms)
Server package install (feature 016)
  ✔ two concurrent calls for the same interpreter share one underlying spawn
Item file helpers (rework-codebase)
  ✔ strips .yml and .md, in any case
  ✔ an unclosed fence runs to the end and says so

18 suites · 295 passing · 0 failing · exit 0
```

From the fix's first run (see fix.md), the flaky failure:

```text
Error: EBUSY: resource busy or locked, unlink '…\testdata\regression\REQ-011.yml'
  at async withRestoredFixture (out/test/regressionFixture.test.js:1184:25)
```

## Residual Risks

- **B1 through the real command is unverified.** The test covers the registry logic, but not that `doorstop.addToDiagram` in the bundled extension resolves `DoorstopDiagramPanel.target` against custom editors opened from files. A manual check closes this: open two diagrams, switch tabs, add an item from the tree, close one, add again.
- **B3 has no runtime check.** The change is a deletion (the `findFiles` branch) plus taking `fileUri` from the server meta that the same function already required, so the risk is low, but a dropped bare UID was not tried.
- **The B1 test was not run against the old code.** That it fails there is reasoned, not observed: with the old singleton the target never switches to A, so the wait would time out. Running the new test against the old `diagrammPanel.ts` would need a second checkout, and that wasn't done.
- **Flaky Windows cleanup.** `withRestoredFixture` can hit `EBUSY` when another process holds an item file. One such failure also leaves items behind, which fails the tests after it. It was seen once in four full runs. It is not caused by this fix (the baseline log shows the same kind of lock on the server side), but it can make a future run look like a regression.
- **Untested paths changed by moves.** `hoverProvider`, `completionProvider`, `callHierarchyProvider`, `documentViewLanguage`, `headerFolding`, `reviewCodeActionProvider` and `extension` have no direct test file; they are only covered through the extension-host suites, which pass.
- **The "open a folder first" guard** for Create Document, Export, Publish and Status Report has no test.
- **Linux/macOS not run.** Only the Windows test host was used; CI runs Ubuntu.
- **The baseline `TypeError … reading 'size'`** in `_cacheAndConvertItem` is still logged once per run, unchanged.

## Recommendation

Hold before closing: the code checks are all green, but do the short manual check for B1 (two diagrams, tab switch, "Add to Diagram", close one, add again) and one bare-UID drop for B3 in a real VS Code window. If both behave, close the bug as verified. Let CI confirm the Ubuntu run on the next push. Track the flaky `EBUSY` cleanup and S1 as separate follow-ups rather than reopening this one.
