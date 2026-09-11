---

description: "Task list for feature 018 — Requirement Call Hierarchy"
---

# Tasks: Requirement Call Hierarchy

**Input**: Design documents from `/specs/018-call-hierarchy-provider/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/call-hierarchy.md](contracts/call-hierarchy.md), [quickstart.md](quickstart.md)

**Tests**: Test tasks ARE included. Constitution Principle VI makes at least one CI-runnable test per feature non-negotiable. This feature is automatable through VS Code's built-in provider test commands (`vscode.prepareCallHierarchy`, `vscode.provideIncomingCalls`, `vscode.provideOutgoingCalls`) inside `src/test/regressionFixture.test.ts` (real server, real `testdata/regression` fixture, already in CI) plus static manifest assertions in `src/test/packageMenus.test.ts`. Expected values are pinned in [contracts/call-hierarchy.md §3](contracts/call-hierarchy.md#3-provider-behaviour-as-observable-through-vs-codes-built-in-test-commands). The peek widget itself is not observable through the API; its behaviour is VS Code's own and is covered by the manual checks in quickstart.md.

**Organization**: Grouped by user story, matching spec.md. The provider is one file; US1 delivers it whole (both directions are needed to satisfy US1's acceptance scenarios 2–3) plus the tree command. US2–US4 then add nothing structural — they add the tests that prove multi-level expansion, header-line selection targets, and editor-side root resolution, and small follow-through where the contract requires it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Exact file paths are included in every task

## Path Conventions

Single VS Code extension at repository root: extension host in `src/`, extension tests in `src/test/`, Python server in `server/` (untouched by this feature), fixture in `testdata/regression/`. No new top-level directory is introduced.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish a clean baseline before changing anything. No new dependencies, directories or fixture files are needed — `testdata/regression` already contains every link shape the tests assert on (`ARCH-001` → `REQ-001`, `MD-001` → `REQ-001`, `REQ-009` → dangling `REQ-999`, `REQ-004` with a header, `REQ-001` without).

- [X] T001 Record a green baseline: run `npm run compile` and `npm test` from the repo root; note any pre-existing failure so it is not later mistaken for a regression. Confirm no foreign Doorstop server is bound to the default port (the fixture suite refuses to run otherwise — see `src/test/regressionFixture.test.ts` `isRegressionFixtureTree`).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared helpers and the provider skeleton every story builds on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 In `src/definitionProvider.ts`, add `export` to the existing module-private `findHeaderLocation(uri)` and `findReferenceLocation(uri, targetUid)` functions (no behaviour change; research §7 — reuse instead of duplicating the header/link regexes). Run `npm run check-types` to confirm nothing else changes.
- [X] T003 Create `src/callHierarchyProvider.ts` with the item model from data-model.md: `class RequirementHierarchyItem extends vscode.CallHierarchyItem` carrying `readonly uid: string` and `readonly unresolved: boolean`; `toCallHierarchyItem(item: IndexedItem, headerLocation: vscode.Location): RequirementHierarchyItem` producing `name = header.trim() ? \`${uid}: ${header.trim()}\` : uid` (never a trailing colon), `detail = item.documentPrefix`, `kind = vscode.SymbolKind.Object`, `uri = vscode.Uri.file(item.path)`, `range = selectionRange = headerLocation.range`; and `toUnresolvedItem(uid: string, referencingUri: vscode.Uri, linkRange: vscode.Range): RequirementHierarchyItem` producing `name = uid`, `detail = 'unresolved'`, `kind = vscode.SymbolKind.Null`, `uri = referencingUri`, `range = selectionRange = linkRange`, `unresolved = true`. Export both helpers and the class for tests.
- [X] T004 In `src/callHierarchyProvider.ts`, add `export function unavailableMessage(): string` returning `"Doorstop: call hierarchy is unavailable because the Doorstop server could not be reached."` (exported so tests assert the exact wording, mirroring `brokenReferenceMessage` in `src/definitionProvider.ts`), and `export async function resolveRootItem(document, position, index): Promise<RequirementHierarchyItem | undefined>` implementing research §4: if `document.getWordRangeAtPosition(position, UID_REGEX)` yields a UID that `index.has(...)` → root on that item; else if `getDocumentUid(document, index)` is defined → root on the file's own item; else `undefined`. Use `findHeaderLocation(index.getUri(uid))` for the item's range. Define `UID_REGEX` locally as `/\b[A-Z0-9_-]+-\d+\b/g` (same as `definitionProvider.ts`) or export it from there — pick one and do not leave two divergent copies.
- [X] T005 In `src/callHierarchyProvider.ts`, add `export function registerCallHierarchyProvider(context: vscode.ExtensionContext, options: { server: DoorstopServer; reportUnavailable?: (message: string) => void }): void` that registers `vscode.languages.registerCallHierarchyProvider([{ language: 'yaml' }, { language: 'markdown' }], provider)` and pushes the disposable to `context.subscriptions`. Implement `prepareCallHierarchy(document, position)`: `const index = await loadDoorstopIndex(server)`; on `undefined` call `reportUnavailable(unavailableMessage())` (default: `vscode.window.showWarningMessage`) and return `undefined`; otherwise return `resolveRootItem(...)`. Leave `provideCallHierarchyIncomingCalls` / `provideCallHierarchyOutgoingCalls` as stubs returning `[]` (filled in US1). Never let any provider method reject: wrap bodies so unexpected errors are `console.error`'d with a `[Doorstop][callHierarchy]` prefix and yield `undefined` / `[]`.
- [X] T006 In `src/extension.ts`, import `registerCallHierarchyProvider` and call `registerCallHierarchyProvider(context, { server: doorstopServer })` inside the existing `if (workspaceFolder) { ... }` block immediately after the `registerDefinitionProvider(...)` call, so it shares the same workspace gating. Run `npm run compile`.

**Checkpoint**: The provider is registered; Shift+Alt+H in a requirement file opens a peek that shows the root item with correct `name`/`detail` and empty directions.

---

## Phase 3: User Story 1 - Open a requirement's hierarchy from the tree view (Priority: P1) 🎯 MVP

**Goal**: A "calls" inline icon on every requirement row (never on document roots) opens the item's file at its header and the built-in peek call hierarchy in the **outgoing** (upstream) direction; the peek lists upstream items (outgoing) and downstream items (incoming) labelled `UID: Heading` with the document prefix as detail, and unresolved links as `UID` / `unresolved` entries.

**Independent Test**: With `testdata/regression` open, click the hierarchy icon on `ARCH-001` in the Doorstop tree: `ARCH-001.yml` opens on its `header:` line and a peek appears already in outgoing mode listing `REQ-001` (`REQ`); pressing the single direction icon switches to incoming (empty for ARCH-001). Automated: the `Call Hierarchy (018)` tests in `regressionFixture.test.ts` and the manifest assertions in `packageMenus.test.ts` pass.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T007 [P] [US1] In `src/test/packageMenus.test.ts`, add `suite('TreeView Call Hierarchy Icon (018 US1)')` asserting via the existing `entriesFor` / `inlineEntries` helpers: `inlineEntries('doorstop.showCallHierarchy').length === 1`; that entry's `when` includes `viewItem == doorstop.item` and does not include `doorstop.root`; `doorstop.add` and `doorstop.link` still each have exactly one inline entry (feature 017 FR-011 preserved); and `manifest.contributes.commands` contains `doorstop.showCallHierarchy` with a non-empty `icon` (read `package.json` the same way `treeViewMenus()` does).
- [X] T008 [P] [US1] In `src/test/regressionFixture.test.ts`, add `suite('Call Hierarchy (018)')` nested inside the existing fixture suite (so it reuses the started server and `treeProvider`), with a helper `prepare(fileName, line = headerLineOf(fileName))` that opens `path.join(FIXTURE_ROOT, ...)` via `vscode.workspace.openTextDocument` and returns `await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>('vscode.prepareCallHierarchy', uri, new vscode.Position(line, 0))`, and a `headerLineOf(fileName)` helper that scans the document text for `/^\s*header\s*:/` (yml) or `/^#{1,6}\s+/` (md). Add tests: (a) prepare `REQ-004.yml` → exactly one item, `name === 'REQ-004: Heading Display Coverage'`, `detail === 'REQ'`; (b) prepare `REQ-001.yml` → `name === 'REQ-001'` (empty header → UID only, no colon), `detail === 'REQ'`.
- [X] T009 [US1] In the same `Call Hierarchy (018)` suite in `src/test/regressionFixture.test.ts`, add: (c) `vscode.provideIncomingCalls` on the `REQ-001` item → the set of `call.from.name` equals `new Set(['ARCH-001', 'MD-001'])` and the corresponding `detail`s are `'ARCH'` and `'MD'`; (d) `vscode.provideOutgoingCalls` on the prepared `REQ-009` item → exactly one call with `to.name === 'REQ-999'`, `to.detail === 'unresolved'`, `to.uri.fsPath` equal to `REQ-009.yml`'s path, and `to.range.start.line` equal to the line of `REQ-009.yml` containing `REQ-999`; then `vscode.provideOutgoingCalls` and `vscode.provideIncomingCalls` on that unresolved `to` item both return `[]` (FR-010); (e) `vscode.provideOutgoingCalls` on the `REQ-001` item → `[]` (no links, FR-009).
- [X] T010 [US1] In the same suite in `src/test/regressionFixture.test.ts`, add (f): find the `REQ-001` tree item via the existing `findTreeItem(treeProvider, c => !c.itemData.isDoorstopRoot && c.itemData.uid === 'REQ-001')`, run `await vscode.commands.executeCommand('doorstop.showCallHierarchy', item)`, then assert `vscode.window.activeTextEditor?.document.uri.fsPath` equals `REQ-001.yml`'s path and `activeTextEditor.selection.start.line === headerLineOf('REQ-001.yml')`. Close the peek afterwards with `await vscode.commands.executeCommand('editor.closeCallHierarchy')` wrapped in try/catch (it no-ops when no peek is open) so later tests start clean.

### Implementation for User Story 1

- [X] T011 [P] [US1] In `package.json`, add to `contributes.commands`: `{ "command": "doorstop.showCallHierarchy", "title": "Doorstop: Show Call Hierarchy", "icon": "$(type-hierarchy)" }`; and add to `contributes.menus["view/item/context"]`: `{ "command": "doorstop.showCallHierarchy", "when": "view == doorstop.treeView && viewItem == doorstop.item", "group": "inline@3" }` (between the existing `doorstop.add` `inline@1` and `doorstop.link` `inline@4`). Do not add a context-menu (`1_requirement@*`) entry — the spec asks only for the inline icon.
- [X] T012 [US1] In `src/callHierarchyProvider.ts`, implement `provideCallHierarchyOutgoingCalls(item: RequirementHierarchyItem)`: if `item.unresolved` return `[]`; `const index = await loadDoorstopIndex(server)`; on `undefined` → `console.error` and return `[]` (no second warning — FR-011's message belongs to `prepare` only); `const root = index.getItem(item.uid)`; if missing return `[]`; for each `link` of `root.links` **in order**: `fromRange = (await findReferenceLocation(item.uri, link.uid)).range`; if `index.getItem(link.uid)` exists → `new vscode.CallHierarchyOutgoingCall(toCallHierarchyItem(target, await findHeaderLocation(index.getUri(link.uid)!)), [fromRange])`; else → `new vscode.CallHierarchyOutgoingCall(toUnresolvedItem(link.uid, item.uri, fromRange), [fromRange])`. Ignore `link.suspect` entirely (clarification Q5).
- [X] T013 [US1] In `src/callHierarchyProvider.ts`, implement `provideCallHierarchyIncomingCalls(item: RequirementHierarchyItem)`: if `item.unresolved` return `[]`; load the index as in T012; for each `linkerUid` of `index.getLinkers(item.uid)`: `linkerUri = index.getUri(linkerUid)`, skip if undefined; `fromRange = (await findReferenceLocation(linkerUri, item.uid)).range`; push `new vscode.CallHierarchyIncomingCall(toCallHierarchyItem(index.getItem(linkerUid)!, await findHeaderLocation(linkerUri)), [fromRange])`. Preserve the index's order; do not dedupe.
- [X] T014 [US1] In `src/callHierarchyProvider.ts` (inside `registerCallHierarchyProvider`, pushed to `context.subscriptions`), register `vscode.commands.registerCommand('doorstop.showCallHierarchy', async (arg?: unknown) => { ... })` implementing contracts/call-hierarchy.md §1 in order: resolve `uri` from `arg` when it looks like a `RequirementTreeItem` (`(arg as { resourceUri?: vscode.Uri; itemData?: { uid?: string; isDoorstopRoot?: boolean } })`, ignore roots), else from `vscode.window.activeTextEditor?.document` when `getDocumentUid(document)` is defined, else `showInformationMessage('Doorstop: select a requirement in the tree or open a requirement file first.')` and return; (1) `loadDoorstopIndex(server)` → on `undefined` `reportUnavailable(unavailableMessage())` and return; (2) `const header = await findHeaderLocation(uri)`; `await vscode.window.showTextDocument(uri, { selection: header.range })` inside try/catch → on error `vscode.window.showErrorMessage(\`Doorstop: cannot open ${uri.fsPath}: ${message}\`)` and return; (3) `await vscode.commands.executeCommand('editor.showCallHierarchy')`; (4) `await vscode.commands.executeCommand('editor.showOutgoingCalls')` — both in one try/catch that only `console.error`s (step 4 is a VS Code-side no-op when the peek is already outgoing; research §2–3).
- [X] T015 [US1] Run `npm run compile`, then `npm run compile-tests && npx vscode-test --label packageMenus` and `npx vscode-test --label regressionFixture`; fix until T007–T010 pass and every pre-existing test still passes. Then perform quickstart.md manual checks 1 and 2 (tree icon opens in outgoing; the single direction icon flips) and record the outcome in the commit message.

**Checkpoint**: User Story 1 is fully functional — the MVP.

---

## Phase 4: User Story 2 - Follow the chain further up or down (Priority: P1)

**Goal**: Any entry in the peek expands to its own outgoing/incoming items to any depth, with no per-session state that could dedupe or break on cycles.

**Independent Test**: From `REQ-001`'s hierarchy in incoming mode, expand `ARCH-001` (empty incoming), switch to outgoing and expand `ARCH-001` again → `REQ-001` appears beneath it. Automated: test (g) below.

### Tests for User Story 2

- [X] T016 [US2] In the `Call Hierarchy (018)` suite in `src/test/regressionFixture.test.ts`, add (g): take the `ARCH-001` item **as returned by** `vscode.provideIncomingCalls` on `REQ-001` (i.e. `call.from`, not a freshly prepared item — this is what the widget passes back on expansion), call `vscode.provideOutgoingCalls` on it → exactly one call with `to.name === 'REQ-001'`, `to.detail === 'REQ'`; and `vscode.provideIncomingCalls` on the same `ARCH-001` item → `[]`. Then call `vscode.provideIncomingCalls` on that returned `REQ-001` item and assert it again yields `{ 'ARCH-001', 'MD-001' }` — three levels through objects the widget created, proving traversal has no depth limit and no visited-set.

### Implementation for User Story 2

- [X] T017 [US2] In `src/callHierarchyProvider.ts`, confirm both `provide*Calls` methods derive everything from `item.uid` / `item.uri` alone (no cache, no visited set, no depth counter) and add a short comment above them referencing spec.md's cycle and duplicate-occurrence edge cases: "each expansion is one lazy lookup; cycles (A→B→A) and repeated items are shown wherever they occur — the widget never auto-expands". Re-run `npx vscode-test --label regressionFixture`.

**Checkpoint**: Multi-level traversal proven through widget-created items.

---

## Phase 5: User Story 3 - Jump to an item from the hierarchy (Priority: P2)

**Goal**: Selecting an entry opens its file at the requirement's header line (yml `header:` / md first `#`), leaving a normal editor-history entry; unresolved entries land on the dangling `links:` line instead.

**Independent Test**: Double-click `MD-001` in `REQ-001`'s incoming list → `MD-001.md` opens at its first heading; Alt+Left returns. Automated: tests (h) and (i).

### Tests for User Story 3

- [X] T018 [P] [US3] In the `Call Hierarchy (018)` suite in `src/test/regressionFixture.test.ts`, add (h): for the `MD-001` and `ARCH-001` items returned by incoming-of-`REQ-001`, assert `item.uri.fsPath` equals the fixture file path (`children/MD/MD-001.md`, `children/ARCH/ARCH-001.yml`) and `item.selectionRange.start.line === headerLineOf(<that file>)` (md: first `#` heading line; yml: `header:` line), and `item.range` equals `item.selectionRange`.
- [X] T019 [P] [US3] In the `Call Hierarchy (018)` suite in `src/test/regressionFixture.test.ts`, add (i): open `REQ-001.yml` in an editor, then `await vscode.window.showTextDocument(<MD-001 item>.uri, { selection: <MD-001 item>.selectionRange })` (what the widget does on select), then `await vscode.commands.executeCommand('workbench.action.navigateBack')` and assert the active editor is `REQ-001.yml` again — proving the `Location`-style navigation leaves a history entry (FR-006). Skip gracefully (`this.skip()`) only if `navigateBack` is unavailable in the test host; it is available in stock VS Code.

### Implementation for User Story 3

- [X] T020 [US3] No new production code is expected — `toCallHierarchyItem` (T003) already sets `range`/`selectionRange` to the header line and `toUnresolvedItem` to the dangling `links:` line. If T018/T019 expose a mismatch (e.g. `findHeaderLocation` returning `0:0` for a markdown item because the frontmatter precedes the heading), fix it in `src/definitionProvider.ts`'s `findHeaderLocation` so both F12 and the hierarchy benefit, and re-run `npx vscode-test --label regressionFixture`.

**Checkpoint**: Selection targets are the header lines; back-navigation works.

---

## Phase 6: User Story 4 - Open the hierarchy from inside the editor (Priority: P3)

**Goal**: Shift+Alt+H / "Peek Call Hierarchy" works in any requirement file: on a known UID token it roots on that item; elsewhere it roots on the file's own item; in non-requirement files nothing requirement-specific is offered.

**Independent Test**: In `ARCH-001.yml` put the cursor on `REQ-001` under `links:` and press Shift+Alt+H → peek rooted at `REQ-001`; put it on `text:` → rooted at `ARCH-001`. Automated: test (j).

### Tests for User Story 4

- [X] T021 [US4] In the `Call Hierarchy (018)` suite in `src/test/regressionFixture.test.ts`, add (j): prepare `children/ARCH/ARCH-001.yml` at the line containing `REQ-001` (column inside the token) → one item with `name === 'REQ-001'`, `detail === 'REQ'`; prepare the same file at its `text:` line → `name === 'ARCH-001'`, `detail === 'ARCH'`; prepare `REQ-009.yml` at the `REQ-999` token → `name === 'REQ-009'` (unknown UID falls back to the file's own item, contracts §3 last row); prepare `CHECKLIST.md` (in the fixture root, not a requirement) at line 0 → empty/undefined result.

### Implementation for User Story 4

- [X] T022 [US4] No new production code is expected — `resolveRootItem` (T004) implements all three rules. If (j) fails on `CHECKLIST.md`, ensure `getDocumentUid(document, index)` (which checks `index.has(uid)`) is what `resolveRootItem` uses, not the index-less overload. Re-run `npx vscode-test --label regressionFixture`.

**Checkpoint**: All four user stories independently verified.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, full verification, and the manual checks the API cannot cover.

- [X] T023 [P] Add an `[Unreleased]` entry to `CHANGELOG.md` in the existing style: "Requirements tree: a new **Show Call Hierarchy** icon on each item row opens the item and VS Code's peek call hierarchy — **outgoing** lists the items it links to (upstream), **incoming** the items that link to it (downstream); entries read `UID: Heading` with the document prefix alongside. Also available in any requirement file via *Peek Call Hierarchy* (Shift+Alt+H)."
- [X] T024 [P] In `README.md` under `### Hover Previews & Navigation`, add a short bullet describing the call hierarchy (tree icon, Shift+Alt+H, outgoing = upstream / incoming = downstream, the single direction-switch icon) consistent with the surrounding bullets' tone and length.
- [X] T025 Run the full gate: `npm run compile` then `npm test` (all `vscode-test` labels, as CI does) — must be green with no skipped or narrowed suites (constitution VI/Development Workflow).
- [X] T026 Execute quickstart.md manual checks 3–8 (chain traversal, open-from-hierarchy + Go Back, dangling link lands on the `links:` line, Shift+Alt+H rooting, server-down warning with no peek, live data after adding a link). Record any deviation as a bug before considering the feature complete; do not amend the spec to match observed behaviour without the user's agreement.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Phase 1 — T002 → T003 → T004 → T005 → T006 are sequential (each builds on the previous file state); BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Phase 2. Within it: tests T007–T010 first (they fail until T011–T014 land); T011 is independent of T012–T014; T012/T013 both edit `callHierarchyProvider.ts` so do them in order; T014 after T012/T013; T015 last.
- **User Story 2 (Phase 4)**: Depends on US1 (T012/T013 must exist). T016 then T017.
- **User Story 3 (Phase 5)**: Depends on US1 (items must be produced). T018/T019 parallel; T020 conditional.
- **User Story 4 (Phase 6)**: Depends on Phase 2 only (T004/T005); can run in parallel with US2/US3 once US1's suite scaffold (T008's helpers) exists.
- **Polish (Phase 7)**: T023/T024 can start any time after Phase 2; T025/T026 after all stories.

### User Story Dependencies

- **US1 (P1)** — the MVP; everything else layers tests on the provider it delivers.
- **US2 (P1)** — no production code beyond a comment; depends on US1's `provide*Calls`.
- **US3 (P2)** — depends on US1's items; may touch `findHeaderLocation` only if a test exposes a gap.
- **US4 (P3)** — depends only on Phase 2's `resolveRootItem`; independent of US2/US3.

### Parallel Opportunities

- T007 ‖ T008 (different test files).
- T011 (package.json) ‖ T012–T014 (provider file).
- T018 ‖ T019 (same file but independent tests — write in one sitting to avoid merge noise).
- T021 ‖ T016/T018/T019 once T008's helpers exist.
- T023 ‖ T024 ‖ any story work.

---

## Parallel Example: User Story 1

```bash
# Tests first, in parallel (different files):
Task: "T007 packageMenus suite for doorstop.showCallHierarchy in src/test/packageMenus.test.ts"
Task: "T008 Call Hierarchy (018) suite scaffold + prepare tests in src/test/regressionFixture.test.ts"

# Then manifest and provider in parallel (different files):
Task: "T011 command + inline menu entry in package.json"
Task: "T012 → T013 → T014 outgoing, incoming, tree command in src/callHierarchyProvider.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 baseline → Phase 2 foundation (T002–T006).
2. Phase 3: write T007–T010, watch them fail, land T011–T014, run T015.
3. **STOP and VALIDATE**: quickstart checks 1–2; the tree icon and peek work end to end.

### Incremental Delivery

1. US1 → MVP demo (tree icon, outgoing first, labels, unresolved entry).
2. US2 → multi-level proof (T016).
3. US3 → selection targets + Go Back proof (T018–T019).
4. US4 → editor-side rooting proof (T021).
5. Polish → CHANGELOG/README, full `npm test`, manual checks 3–8.

### Parallel Team Strategy

One developer can do this in order; with two, split US1's manifest+test work (T007, T011) from the provider work (T008–T010, T012–T014), then one takes US2+US3 tests while the other takes US4 and Polish.

---

## Notes

- `[P]` tasks = different files, no dependencies.
- Every provider method must degrade, never reject (constitution III); tests (d)/(e) and the `reportUnavailable` injection point exist to keep that honest.
- Do not use `getItemTitle()` for the hierarchy label — spec FR-004 wants UID-only when the header is empty (research §6), which differs from the tree view's text-fallback on purpose.
- `link.suspect` is deliberately ignored (clarification Q5).
- Fixture is read-only for this feature; no `withRestoredFile` needed.
- Commit after each phase checkpoint; end commit messages with the attribution line from the session.
