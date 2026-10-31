# Bug Assessment: Rework codebase (diagram defects, duplicated logic, oversized functions)

- **Slug**: rework-codebase
- **Created**: 2026-10-31
- **Source**: pasted text (findings of a whole-codebase review run in this session: `src/`, `src/webview/`, `server/` submodule, build and CI)
- **Verdict**: valid (B1-B3 are defects; R1-R6 are confirmed duplication/structure issues; S1 is plausible and needs measurement)
- **Severity**: medium (overall; per finding below)

Treated as one bug on purpose: the findings touch the same files, and fixing them in one ordered pass avoids moving the same code twice. Each phase below is meant to be one commit with the test suite run after it.

| # | Finding | Kind | Severity |
| --- | --- | --- | --- |
| B1 | `DoorstopDiagramPanel.currentPanel` singleton targets the wrong diagram / forgets an open one | bug | medium |
| B2 | German user-facing messages and fallback title in an English extension | bug (UX) | low |
| B3 | Diagram drop resolves a UID by globbing the workspace | bug (non-deterministic) | low |
| R1 | `requirementTree.ts`: debug logging, dead code, linear scan, doubled maps | cleanup | low |
| R2 | `GET /tree` turned into lookup maps in five places | duplication | low |
| R3 | Item-file scanning and UID-from-file-name helpers duplicated | duplication | low |
| R4 | `diagrammPanel.ts`: 23 `any`, duplicated link handlers, mixed indentation | maintainability | low |
| R5 | `extension.ts` `activate` is a ~475-line closure; unsafe cast | maintainability | low |
| R6 | `doorstopCommands.ts`: four copies of the document picker list, no-op wrapper, 180-line `publish` | maintainability | low |
| T1 | `serverPackageInstall.test.ts` is never run (missing from `.vscode-test.mjs`) | test gap | low |
| S1 | Server routes are `async def` but do blocking Doorstop I/O | performance (unverified) | low |

## Report (verbatim or summarized)

> Codebase refactoring (single bug): consolidate duplicated logic and fix defects found in a whole-codebase review. Scope: (B1) DoorstopDiagramPanel.currentPanel singleton — with two diagrams open, "Add to Diagram" targets the last-created one, and closing one clears currentPanel while another is open. (B2) German user-facing messages in src/diagrammPanel.ts:690/701/727 and fallback title "Unbenanntes Requirement" in src/requirementTree.ts:24, plus German comments. (B3) Diagram drop resolves a UID via vscode.workspace.findFiles glob although doorstopIndex.ts forbids glob resolution and _itemMeta[uid].path is already required. (R1) requirementTree.ts: debug console.log in getParent/setActiveResource, no-op setActive, linear scan instead of items.get(fsPath), duplicate ByItem/ById maps. (R2) Five client-side indexings of GET /tree — consolidate onto DoorstopIndex. (R3) Duplicated item-file scanning: getMetadataRange vs getMetadataLineRange, duplicated LINK_ENTRY_REGEX/FRONTMATTER_FENCE_REGEX/UID_REGEX, four UID-from-filename helpers. (R4) diagrammPanel.ts: 23 `any`, duplicate handleAddLink/handleRemoveLink, inconsistent indentation. (R5) extension.ts activate is a ~475-line closure: extract server bootstrap, diagram custom editor, tree reveal; fix `as vscode.WorkspaceFolder` cast at extension.ts:207. (R6) doorstopCommands.ts: four pickers duplicate the same filter/map, no-op `register` wrapper, 180-line publish command. (S1, measure only) server routes are async def doing blocking Doorstop I/O, stalling /health and /validate during long requests.

Baseline at assessment time: `tsc --noEmit` and `eslint src` pass with no findings. `npm test` (VS Code 1.144.0 test host, Windows): exit 0, 16 suites, 279 passing, 0 failing. The run's log shows the `[Doorstop][tree] Parent: …` trace lines from R1, and one `TypeError: Cannot read properties of undefined (reading 'size')` raised inside VS Code's extension host (`_cacheAndConvertItem`) during the regressionFixture suite. That one does not fail a test and its trigger was not identified; see Open Questions.

Out of scope (reviewed and deliberately left alone): the Document View files (`documentViewProvider.ts`, `documentViewLanguage.ts`, `documentViewModel.ts`), webview JS, `timing.ts`, `pdfExport.ts`, `statusReport.ts`, `filterNotebook.ts`, the server's structure, the test files. Client-side caching of `/tree` is also out: the server already caches the answer per `tree_version` (`server/src/doorstop_server/routers/tree.py`).

---

## B1 — Diagram singleton targets the wrong diagram

### Symptom

`DoorstopDiagramPanel.currentPanel` holds only the panel created last. With two diagrams open, "Add to Diagram" (tree context menu) adds to the last-opened one even when the other tab is active. Closing any diagram sets `currentPanel = undefined`, so with one diagram still open "Add to Diagram" says "Open a diagram file ... first". Expected: the command targets the active (or last active) diagram, and works as long as any diagram is open.

### Reproduction

1. Open `a.doorstop.json`, then `b.doorstop.json` (both in the Doorstop diagram editor).
2. Click the tab of `a`, right-click an item in the Doorstop tree, choose "Add to Diagram": the node is added to `b`.
3. Close `b`, run "Add to Diagram" again: the info message says no diagram is open although `a` is.

### Suspected code paths

- `src/diagrammPanel.ts:53` — `public static currentPanel`.
- `src/diagrammPanel.ts:73` — `createForCustomEditor` overwrites it on every open.
- `src/diagrammPanel.ts:756` — `dispose()` clears it unconditionally, whichever panel is closing.
- `src/extension.ts:392-396` — `doorstop.addToDiagram` reads it.

### Root cause hypothesis

A single static slot models "the" diagram, but a custom editor can have any number of open instances. Confidence: high (read directly from the code).

### Proposed remediation

Replace the slot with a static `Set<DoorstopDiagramPanel>` of open panels plus a static `lastActive` that `onDidChangeViewState` updates when `panel.active` becomes true. `dispose()` removes its own panel from the set and clears `lastActive` only if it is itself. "Add to Diagram" picks the active panel, else `lastActive`, else the only open one. Expose this as a static getter (for example `DoorstopDiagramPanel.target`) so `extension.ts` and tests have one read path.

---

## B2 — German text in an English extension

### Symptom

Users see German messages from the diagram drop path and a German fallback tree title; everything else in the extension is English.

### Suspected code paths

- `src/diagrammPanel.ts:690` — `Konnte Requirement für "…" nicht finden.`
- `src/diagrammPanel.ts:701-702` — `Der Doorstop-Server kennt "…" nicht. …`
- `src/diagrammPanel.ts:727` — `Fehler beim Lesen der Requirement-Datei.`
- `src/requirementTree.ts:24` — `'Unbenanntes Requirement'`.
- German comments: `src/diagrammPanel.ts:170, 559-561, 652, 673, 679, 695, 710`; `src/requirementTree.ts:110, 166-167` and the `// Neu:` remarks on the parent maps; `src/extension.ts:361` (`STELLE A: …`).

### Proposed remediation

Translate the messages. Use `'Unnamed requirement'` for the tree fallback, the string `getItemTitle` in `src/doorstopIndex.ts` already uses. Translate or delete the comments (delete those that only restate the code, such as "Klick öffnet die Datei").

---

## B3 — Diagram drop resolves a UID by globbing

### Symptom

Dropping a bare UID (text selected in an editor) onto the canvas looks the file up with `findFiles('**/<UID>.{yml,md}')`. With two files of that name (a copy, a test fixture, a published export under the workspace), the result is whichever `findFiles` returns first. `src/doorstopIndex.ts:8-17` documents that exact problem as the reason glob resolution was removed elsewhere.

### Suspected code paths

- `src/diagrammPanel.ts:676-686` — the `else` branch with `findFiles`.
- `src/diagrammPanel.ts:697-705` — the same function then requires `this._itemMeta[uid]` and gives up without it, so the server's `path` is always available when the drop succeeds.

### Proposed remediation

For the bare-UID branch, take `targetFilePath` from `this._itemMeta[uid].path` and delete the `findFiles` call. For the file-path branch, keep deriving the UID from the file name, then use the meta's path. This also makes the `fs.existsSync` probe unnecessary for the UID branch.

---

## R1 — `requirementTree.ts` cleanup

### Findings

- `getParent` (`:170-174`) logs on every call; VS Code calls it on every `reveal`, which runs on every editor switch while auto-reveal is on. `setActiveResource` (`:189-199`) logs three lines per editor switch.
- `setActive` (`:118-120`) returns `baseLabel` in both branches, so it does nothing; the loop in `setActiveResource` that calls it for every item is dead work.
- `setActiveResource` scans `items.values()` linearly although `items` is keyed by `fsPath`.
- `childrenByItem`/`childrenById` and `parentByItem`/`parentById` are parallel maps. Items are rebuilt on every refresh and `id` is always `resourceUri.toString()`, so the `ById` maps alone are enough.
- The duplicate-root check (`:236-243`) is a hand-written `some()`.
- `itemData: any` (`:93`) is read in `doorstopCommands.ts` (21 reads), `documentViewProvider.ts`, `deriveProvider.ts` and `callHierarchyProvider.ts`. The fields are `uid`, `prefix`, `level`, `header`, `isDoorstopRoot`, `markerPath`, `skipped`.

### Proposed remediation

Delete the logs, `setActive` and the loop; use `this.items.get(activePath)`. Keep only the `ById` maps. Replace the duplicate-root loop with `some()`. Give `itemData` a small type with the fields listed above (all optional except what the constructor always sets). A full discriminated union is optional; the plain interface already catches typos.

---

## R2 — `/tree` indexed in five places

### Findings

- `src/doorstopIndex.ts` `DoorstopIndex.fromTree` — the shared index: items with `documentPrefix`, linkers, documents (`prefix`, `parentPrefix`).
- `src/problemsProvider.ts:165-182` `indexTree` — `pathByUid`, `documentByUid`, `documentByPrefix` (needs `markerPath`).
- `src/deriveProvider.ts:45-54` `loadDocuments` — `prefix`, `parentPrefix`, `itemUids`.
- `src/diagrammPanel.ts:225-253` `refreshItemMeta` — per-UID `path`, `documentPrefix`, `links`, `header`, plus documents.
- `src/documentViewProvider.ts` `loadSnapshot` — tags items with `documentPrefix`; it requests `?fields=` and works on `DocumentNode`, so it stays as it is.
- `src/requirementTree.ts:12-25` `extractTitle` duplicates `getItemTitle` (`src/doorstopIndex.ts`), except that it also takes a markdown `# H1` from the text.

### Proposed remediation

Add `markerPath` to `IndexedDocument` and a `getDocument(prefix)` lookup to `DoorstopIndex`. Then:
- `problemsProvider.ts`: build a `DoorstopIndex` inside `buildDiagnostics` and drop `indexTree`/`TreeIndex`. Keep the exported `buildDiagnostics(validation, tree)` signature (tests and `refilter` call it with a `TreeResponse`).
- `deriveProvider.ts`: replace `loadDocuments` with the index (`index.documents`, `index.getItem(uid)?.documentPrefix`). `loadDocuments` throws on failure while `loadDoorstopIndex` returns `undefined`, so the caller's current error message must be preserved.
- `diagrammPanel.ts`: build `meta` and `documents` from `index.items` / `index.documents`. The message posted to the webview must keep exactly the same shape.
- Title: see Open Questions.

---

## R3 — Item-file scanning and UID helpers duplicated

### Findings

- `src/problemsProvider.ts:102` `getMetadataRange(lines, isMarkdown)` and `src/reviewLensProvider.ts:88` `getMetadataLineRange(document, lines)` compute the same range. They differ only for a `.md` file without frontmatter: `{start: 0, end: 0}` versus `undefined`. Both callers rely on their own behavior.
- `LINK_ENTRY_REGEX` and `FRONTMATTER_FENCE_REGEX` are defined identically in both files. `LINKS_KEY_REGEX` (`problemsProvider.ts:56`, indented) and `LINKS_FIELD_REGEX` (`reviewLensProvider.ts:69`, column 0) differ deliberately; the comment at `reviewLensProvider.ts:66-67` explains why.
- `UID_REGEX` is defined in `src/hoverProvider.ts:17` and `src/definitionProvider.ts:8` (exported, and imported by `callHierarchyProvider.ts`). `DERIVED_LINE_REGEX` is also in both.
- UID from a file name: `editorUid` (`doorstopCommands.ts:56`), `getRequirementUid` (`reviewLensProvider.ts:74`), `uidFromFileName` (`documentViewProvider.ts:157`, takes any extension on purpose: it feeds the watcher), `getDocumentUid` (`doorstopIndex.ts`, optionally confirmed against the index).

### Proposed remediation

New `src/itemFile.ts` with `UID_REGEX`, `DERIVED_LINE_REGEX`, `LINK_ENTRY_REGEX`, `FRONTMATTER_FENCE_REGEX`, `uidFromItemPath(fsPath)` (`.yml`/`.md` only, else `undefined`), and `metadataRange(lines, isMarkdown)` returning `undefined` when a `.md` file has no frontmatter. `problemsProvider` maps `undefined` to `{start: 0, end: 0}` at its one call site. `getDocumentUid`, `editorUid` and `getRequirementUid` call `uidFromItemPath`. `uidFromFileName` stays: its any-extension behavior is intentional. The column-0 `LINKS_FIELD_REGEX`/`REVIEWED_FIELD_REGEX` stay in `reviewLensProvider.ts`.

---

## R4 — `diagrammPanel.ts` types and duplication

### Findings

- 23 uses of `any`: the diagram document, nodes and edges, and every webview message.
- `handleAddLink` (`:423-440`) and `handleRemoveLink` (`:442-459`) differ only in HTTP method, path, progress title, error text and the result command name.
- Indentation mixes 4, 6 and 12 spaces (the static helpers at `:521-598` sit at 12); the rest of the codebase uses 2.
- Six `console.log` trace lines in the drop path (`:111, 118, 608, 620, 626, 673`).

### Proposed remediation

Add `Diagram`, `DiagramNode` and `DiagramEdge` interfaces matching what `readDiagram` already validates, and a `WebviewMessage` union for the `switch` in the constructor. Merge the two link handlers into one `changeLink(kind, message)`. Reformat the file to 2 spaces in its own commit, so the diff of the real changes stays readable. Drop the trace logs; keep `warn`/`error`. Keep the static API (`readDiagram`, `readDiagramOrBackup`, `serializeDiagram`, `reconcilePaths`) unchanged: `extension.test.ts`, `diagramLayout.test.ts` and `regressionFixture.test.ts` call it.

---

## R5 — `activate` is one 475-line closure

### Findings

`src/extension.ts:26-498` holds three self-contained features inline, next to the wiring:
- Python and server startup (`:39-187`): Python API lookup, package install prompt, spawn, restart command, waiting notice, interpreter watcher.
- Diagram custom editor (`:281-399`): `doorstop.newDiagram`, the `CustomEditorProvider`, the tree drag-and-drop controller, `doorstop.addToDiagram`.
- Tree view and auto-reveal (`:402-489`): both tree views, `revealInTree`, `prepareTreeItemForReveal`, the auto-reveal commands and the active-editor listener.

`:207` passes `workspaceFolder || vscode.workspace.workspaceFolders?.[0] as vscode.WorkspaceFolder`. Both sides are the same value, so without a folder the cast hands `undefined` to code typed as non-optional; `options.workspaceFolder.uri` then throws inside the command.

### Proposed remediation

- `src/serverStartup.ts` (new; `doorstopServer.ts` stays free of `vscode` imports): `registerServerStartup(context, server, hooks)` returning `restart()`. `hooks` carries the late-bound callbacks (`onStarted` → `problemsProvider?.scheduleRefresh()`, `refreshViews`).
- `registerDiagramEditor(context, server, tree)` in `src/diagrammPanel.ts`, which also owns the drag-and-drop controller it needs for the tree view.
- `registerTreeViews(context, tree, commandsProvider, dnd)` in `src/requirementTree.ts`, with auto-reveal.
- `CommandOptions.workspaceFolder` becomes `vscode.WorkspaceFolder | undefined`. The commands that need it (`createDoc`, `export`, `publish`, `statusReport`) show "Doorstop: open a folder first." and return.

`activate` must keep its current order: problems provider before derive/review/definition/call-hierarchy/document-view registration; `refreshViews` assigned after the tree provider exists; the return value `{ treeProvider, problemsProvider, documentView }` unchanged (tests read it).

---

## R6 — `doorstopCommands.ts`

### Findings

- `choosePrefix` (`:79`), `chooseParentPrefix` (`:96`), `choosePublishTarget` (`:122`) and `chooseDocumentOrAll` (`:149`) each repeat `roots.filter(prefix is a non-empty string).map({label: prefix, description: fsPath})`.
- `register` (`:221-222`) only forwards to `registerCommand`.
- `publish` (`:446-627`) is about 180 lines with five branches (PDF single, single, PDF all, together, each).

### Proposed remediation

One `documentPicks(tree)` returning the shared quick-pick items; the four pickers add their extra entries. Replace `register` with `registerCommand`. Split `publish` into module-level `publishPdf`, `publishSingle` and `publishAll` functions that take the already-chosen format, template and link options; the command body keeps the prompts and dispatches. Behavior, messages and order of dialogs stay identical (spec 021 FR-003 fail-fast, spec 024, spec 027).

---

## T1 — A test file that never runs

`src/test/serverPackageInstall.test.ts` exists, but no entry in `.vscode-test.mjs` lists `out/test/serverPackageInstall.test.js`, and each entry names one exact file. It compiles but never runs. Add a `serverPackageInstall` entry (no workspace, no server needed: the file injects `spawnFn`) and check that it passes.

---

## S1 — Blocking I/O in `async def` routes (measure only)

Every route in `server/src/doorstop_server/routers/` is `async def` and calls Doorstop synchronously (file reads and writes, publish). That runs on the event loop, so while a long request (publish of all documents, a large save) runs, `/health` and `/validate` cannot be answered either, even though `lock.py` deliberately exempts them from the request lock. In particular, `Validator.check` polls with `run_in_threadpool` and `is_disconnected()`, and both need the loop.

Remediation is conditional: measure first with `server/tools/profile_server.py` (time `/health` while `POST /publish` runs on the regression fixture). Only if it stalls noticeably, change the Doorstop-touching routes to plain `def`. FastAPI then runs them in its thread pool, and `SerializeRequestsMiddleware` still lets only one through at a time. This is a change in the `doorstop-vscode-server` submodule and needs its own release; it is not part of the extension commits.

---

## Execution order

| Phase | Content | Why this position |
| --- | --- | --- |
| 0 | T1, record baseline `npm test` | Every later phase is judged against it |
| 1 | B2, B3, R1 | Small, local, no API change |
| 2 | B1 | Behavior fix, before R4/R5 move the code |
| 3 | R3 (`itemFile.ts`) | No dependencies; R2 and R5 reuse it |
| 4 | R2 (`DoorstopIndex` everywhere) | Needs R3's `uidFromItemPath` |
| 5 | R4 (diagram types; reformat as its own commit) | After B1/B3 so they are not re-indented mid-fix |
| 6 | R5 (`activate` split) | After R4, so the moved diagram code is already typed |
| 7 | R6 (`doorstopCommands.ts`) | Independent; last because it is the least valuable |
| 8 | S1 measurement | Server submodule, separate release |

**Files likely to change**:
- `src/diagrammPanel.ts`, `src/extension.ts`, `src/requirementTree.ts`, `src/doorstopIndex.ts`, `src/problemsProvider.ts`, `src/reviewLensProvider.ts`, `src/hoverProvider.ts`, `src/definitionProvider.ts`, `src/callHierarchyProvider.ts`, `src/deriveProvider.ts`, `src/doorstopCommands.ts`
- new: `src/itemFile.ts`, `src/serverStartup.ts`
- `.vscode-test.mjs`
- tests: `src/test/extension.test.ts`, `src/test/regressionFixture.test.ts`, new `src/test/itemFile.test.ts`
- conditional (S1): `server/src/doorstop_server/routers/*.py`

**Tests to add or update**:
- B1: open two diagram files with `vscode.openWith(..., 'doorstop.diagram')`, activate the first, assert the target getter returns its panel; close the second, assert the first is still the target.
- B3: with two files named `REQ-001.yml` on disk (the fixture one and a copy outside any document), a bare-UID drop resolves to the path the server reports.
- R1: the existing reveal tests in `regressionFixture.test.ts` must stay green; no new test (pure removal).
- R2: the existing `problemReporting` suite covers `buildDiagnostics`; add one assertion that a document-level issue still anchors at the document's `markerPath`. Derive and diagram are covered by `regressionFixture`.
- R3: `itemFile.test.ts` (plain unit test, no workspace): `metadataRange` for YAML, for markdown with frontmatter, without frontmatter, and with an unclosed fence; `uidFromItemPath` for `.yml`, `.md`, `.YML`, other extensions.
- R5: `emptyFolderBootstrap` and `extension.test.ts` must stay green; add a test that `doorstop.export` without a workspace folder shows the "open a folder" message instead of throwing [NEEDS CLARIFICATION: whether a no-folder test config is wanted, see Open Questions].
- T1: the new `serverPackageInstall` config entry runs and passes.

## Risks & Considerations

- **Activation order (R5)**: the problems provider must be registered before the providers that call `scheduleRefresh`, and `refreshViews`/`problemsProvider` are late-bound closures. Moving code into modules must keep them as getters, not snapshots.
- **Webview contract (R2, R4)**: `loadDiagram`, `addNode` and `ghostPreviewData` payloads are read by `src/webview/diagram/*.js`. Their shape must not change; the new types should describe the current payload, not a cleaned-up one.
- **Different "no frontmatter" semantics (R3)**: merging the two range functions must keep problems anchoring at line 0 and the review lens showing no lenses.
- **Coverage gaps**: `hoverProvider`, `completionProvider`, `callHierarchyProvider`, `documentViewLanguage`, `headerFolding`, `reviewCodeActionProvider` and `extension` are imported by no test file; they are only exercised through the extension-host suites. R2, R3 and R5 depend on those suites catching regressions.
- **Reformat noise (R4)**: a reformat mixed with real changes hides them in review; keep it a separate commit.
- **Server release (S1)**: the extension installs `doorstop-vscode-server` from PyPI, so a server change only reaches users after a release.

## Open Questions

- [NEEDS CLARIFICATION: Tree title rule (B2/R2). `extractTitle` (tree) takes a markdown `# H1` from the text before the first line; `getItemTitle` (hover/completion) does not. Keep the tree's rule and only translate the fallback (smallest change), or make both use one rule (changes visible titles in one of the two places)?]
- [NEEDS CLARIFICATION: B1 target rule. When no diagram tab is active, should "Add to Diagram" use the last active diagram (proposed), or ask which diagram when more than one is open?]
- [NEEDS CLARIFICATION: R5 no-folder test. Is a new `.vscode-test.mjs` entry without `workspaceFolder` acceptable for the "open a folder first" test, or should the guard be covered by a unit test of the command handler only?]
- [NEEDS CLARIFICATION: S1. Measure now as part of this bug, or record it and defer to the next server release?]
- [NEEDS CLARIFICATION: Baseline `TypeError … reading 'size'` in `_cacheAndConvertItem`. It is logged by VS Code's extension host while the regressionFixture suite runs, without failing a test. Investigate as part of this bug (it may come from a provider result such as call hierarchy), or leave it out of scope?]
