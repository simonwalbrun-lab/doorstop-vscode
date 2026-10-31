# Bug Fix: Rework codebase (diagram defects, duplicated logic, oversized functions)

- **Slug**: rework-codebase
- **Fixed**: 2026-10-31
- **Assessment**: ./assessment.md
- **Status**: partial (B1-B3, R1-R5, T1 applied; R6 applied except the `publish` split; S1 deferred as proposed)

## Summary

Fixed the three diagram defects (wrong target with several diagrams open, German messages, UID resolution by file glob) and removed the duplication the review found. `/tree` is now indexed only by `DoorstopIndex` (plus the document view's own field snapshot, as planned), item-file text helpers live in one `itemFile.ts`, `activate` shrank from ~475 to ~130 lines, and two test suites that never ran (one existing, one new) are now part of `npm test`.

Open questions were resolved with the assessment's defaults: the tree keeps its own title rule and only its fallback is translated; "Add to Diagram" uses the active, else the last active diagram; S1 is deferred; the baseline `TypeError` is out of scope.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/diagrammPanel.ts` | modified (rewritten) | B1 registry (`open` set, `lastActive`, `target` getter); B2 English messages and comments; B3 drop resolves via server meta, `findFiles` removed; R4 `Diagram`/`DiagramNode`/`DiagramEdge`/`WebviewMessage` types (0 `any`), `handleLinkChange` replaces the two link handlers, 2-space indentation, trace logs removed; R2 `refreshItemMeta` uses `loadDoorstopIndex`; R5 new `registerDiagramEditor` (custom editor, New Diagram, Add to Diagram, tree drag source) moved from `extension.ts` |
| `src/requirementTree.ts` | modified | R1: debug logs, no-op `setActive` and the scan removed, `items.get(fsPath)`, only the `ById` maps kept, `some()` for the duplicate root; `TreeItemData` replaces `itemData: any`; B2 "Unnamed requirement" and English comments; R5 new `registerTreeViews` (both views, reveal, auto-reveal commands) moved from `extension.ts` |
| `src/serverStartup.ts` | added | R5: Python lookup, package install prompt, spawn/restart, restart command and interpreter watcher, moved from `extension.ts` unchanged in behavior |
| `src/extension.ts` | modified | R5: `activate` keeps only the wiring, in the original order; the `as vscode.WorkspaceFolder` cast is gone |
| `src/itemFile.ts` | added | R3: `UID_REGEX`, `DERIVED_LINE_REGEX`, `LINK_ENTRY_REGEX`, `uidFromItemPath`, `metadataRange` |
| `src/doorstopIndex.ts` | modified | R2: `IndexedDocument.markerPath`, `getDocument(prefix)`; `getDocumentUid` uses `uidFromItemPath` |
| `src/problemsProvider.ts` | modified | R2: `DoorstopIndex` replaces `indexTree`/`TreeIndex`; R3: shared regex and `metadataRange` |
| `src/reviewLensProvider.ts` | modified | R3: `getMetadataLineRange` delegates to `metadataRange` (keeps "unclosed fence = no lenses"); `getRequirementUid` replaced by `uidFromItemPath` |
| `src/deriveProvider.ts` | modified | R2: `loadDeriveSource` on `DoorstopIndex` replaces `loadDocuments`/`getSourceDocumentPrefix`/`DoorstopDocumentInfo`; R3: `getSourceUid` and the inline `derived:` regex replaced by shared helpers |
| `src/hoverProvider.ts`, `src/definitionProvider.ts`, `src/callHierarchyProvider.ts` | modified | R3: import the shared regexes |
| `src/doorstopCommands.ts` | modified | R6: `documentPicks` shared by the four pickers, `register` alias removed; R5: `workspaceFolder` is optional, and Create Document, Export, Publish and Status Report say "open a folder first" instead of throwing |
| `.vscode-test.mjs` | modified | T1: `serverPackageInstall` entry; new `itemFile` entry |
| `src/test/itemFile.test.ts` | added test | R3 helpers |
| `src/test/diagramLayout.test.ts` | added test, modified | B1 test; `survivor?.x` because `readDiagram` is now typed |

## Diff Highlights

```ts
// B1: any number of diagrams; the target follows the active tab.
public static get target(): DoorstopDiagramPanel | undefined {
  for (const panel of DoorstopDiagramPanel.open) {
    if (panel._panel.active) { return panel; }
  }
  return DoorstopDiagramPanel.lastActive ?? DoorstopDiagramPanel.open.values().next().value;
}
```

```ts
// B3: no glob; the path is the one the server reports for the UID.
const uid = isPath ? path.basename(path.normalize(localPath)).replace(/\.(yml|md)$/, '') : cleanText;
const knownMeta = this._itemMeta[uid];
...
node: { uid, fileUri: knownMeta.path, ... }
```

```ts
// R3: one metadata range, callers keep their own meaning of the edge cases.
const range = metadataRange(lines, isMarkdown) ?? { start: 0, end: 0 };   // problems
return range?.closed ? range : undefined;                                 // review lens, folding
```

## Tests Added or Updated

- `src/test/diagramLayout.test.ts` › "Diagram target (rework-codebase B1)" › `"Add to Diagram" targets the active diagram, and closing another keeps it` — two panels: the target follows the active one, survives closing the other, and is undefined once none is open. Fails on the old singleton at both the second and third assertion.
- `src/test/itemFile.test.ts` — `uidFromItemPath` (`.yml`, `.md`, `.YML`, other files) and `metadataRange` (YAML, markdown with frontmatter, without, unclosed fence).
- `src/test/serverPackageInstall.test.ts` — unchanged, now actually run (T1).
- R2's document-level anchor is already pinned by `regressionFixture.test.ts:1007` (`no_items` on `children/EMPTY/.doorstop.yml`), so no new assertion was added.

## Local Verification

- `npx tsc --noEmit -p .` → no errors.
- `npx eslint src` → no findings.
- `npm test` (VS Code 1.144.0 test host, Windows), final run → exit 0, 18 suites (baseline 16), 295 passing (baseline 279), 0 failing. The 16 additional tests are `serverPackageInstall` (T1), `itemFile` and the B1 test.
- Earlier runs, for the record:
  - First run: 3 failures. (a) The B1 test: `target` scanned `panel.active`, and another panel's flag can still read `true` after the new panel's view-state event. Fixed in the code (see Deviations), and the test now waits for the target to switch instead of polling `webview.active`. (b) `regressionFixture` › "new blocks in a row are created in the order they were typed": `EBUSY` when its cleanup unlinked `testdata/regression/REQ-011.yml`, a Windows file lock held by another process. (c) The next section-view test then saw level `2.4` instead of `1.3`, because the failed cleanup left `REQ-011`…`REQ-014.yml` in the fixture.
  - Rerun of `regressionFixture` on that polluted fixture: 7 failures, all from the leftover items. The four untracked files were deleted.
  - Final run: green, `REQ-011.yml` deleted without `EBUSY`. (b) is a timing race between the test's cleanup and a process reading the file. It is not reproducible on demand; the baseline log shows the same kind of Windows lock on the server side (`PermissionError` on `REQ-005.yml`).
- The baseline `TypeError … reading 'size'` still appears once in the log, unchanged.
- `git status testdata/` → clean after the final run.

## Deviations from Assessment

- **R3 semantics were broader than assessed.** Besides the "no frontmatter" case, the two range functions also differed for an *unclosed* fence: problems used the rest of the file, the review lens offered nothing (and `headerFolding.ts` relies on that through `getMetadataLineRange`). `metadataRange` therefore returns a `closed` flag, and each caller keeps its own behavior.
- **A fifth UID helper.** `deriveProvider.ts` had `getSourceUid` and an inline `derived:` regex; both now use `itemFile.ts` (scope expansion within the same finding).
- **`uidFromItemPath` fixes upper-case extensions.** The old helpers lower-cased the extension but then stripped it case-sensitively, so `REQ-001.YML` yielded `REQ-001.YML`. It now yields `REQ-001`.
- **Diagram file in one pass.** B1, B2, B3, R2 (diagram part), R4 and the R5 move were applied as one rewrite of `diagrammPanel.ts` instead of phase by phase, so the re-indent does not interleave with the fixes. Nothing was committed (commits were not requested), so the per-phase commit plan does not apply yet.
- **R6 `publish` split skipped.** Moving the five branches to module-level functions means passing the format, template, link options, `run` and `exportPdf` to each, which adds more lines than it removes. The command stays as it was; only the pickers and the `register` alias changed.
- **Tree auto-reveal context key** is now set when the tree views are registered rather than at the very start of `activate`. Only the two view/title buttons read it, and the views exist only after registration.
- **Tests not added**: B3 (driving a drop needs the webview's `ready` round trip; no harness exists for posting messages into `onDidReceiveMessage`), and the "open a folder first" guard (would need a new test config without a workspace folder; the guard is a two-line branch).
- **B1 target rule simplified.** The assessment proposed "the active panel, else `lastActive`". Scanning `panel.active` proved unreliable (see Local Verification), so `target` is `lastActive` (updated on every view-state event that makes a panel active) else any open panel. In practice that is the active diagram whenever one is active.
- **`createForCustomEditor`** is now synchronous and returns the panel (it awaited nothing before), which the B1 test uses.

## Follow-ups

- S1: time `/health` during `POST /publish` with `server/tools/profile_server.py`; switch the Doorstop routes to plain `def` only if it stalls (server release).
- Baseline `TypeError … reading 'size'` in `_cacheAndConvertItem`: still unexplained.
- Flaky `EBUSY` in the regression fixture cleanup on Windows (`withRestoredFixture` unlink): retry the unlink briefly, or wait for the problem check to settle before cleanup, so one lock cannot leave items behind and fail the tests after it.
- B3 test once a webview message harness exists.
- `documentViewProvider.ts` `uidFromFileName` deliberately stays (it accepts any extension for the watcher).
