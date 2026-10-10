# Research: Diagram Canvas Refinement

No `NEEDS CLARIFICATION` items remained in Technical Context. Each decision below resolves a "how" question raised by reading the current code.

## R1 — Where path reconciliation runs

- **Decision**: In the extension host, inside `DoorstopDiagramPanel.handleReady` (`src/diagrammPanel.ts`), using `refreshItemMeta()` directly (`fetchTreeMeta()` hides a failed fetch by returning `{}`, which would make every node look unresolved). A pure static `DoorstopDiagramPanel.reconcilePaths(diagram, meta)` returns `{ diagram, corrected, unresolved }`. If `corrected` is non-empty, the corrected diagram is pushed through the existing `_onDiagramChanged` callback, which already sets `document.diagram` and fires `onDidChangeCustomDocument`, so the editor becomes dirty and Save / Revert / hot-exit backup work as they do today.
- **Rationale**: `/tree` is already fetched on every load and holds `meta[uid].path`, the server's authoritative path for each UID (Constitution I). No new server call or endpoint is needed. `handleReady` runs on every webview reload, but it reads `document.diagram` as it is *now*, so once a path is corrected the next reload finds nothing to correct and nothing changes twice.
- **Path comparison**: `path.relative(stored, current) === ''`. On Windows this ignores case, which matters because the server and `path.resolve(workspaceRoot, …)` can return different drive-letter case (`c:` vs `C:`). A plain string compare would report a false correction on every open and break SC-002.
- **Uniqueness**: `/tree` is a UID→item map, and Doorstop itself rejects duplicate UIDs while loading the tree. So a "UID resolves to more than one item" case cannot reach the client and needs no extra check.
- **Alternatives rejected**: (a) Rewriting the file on disk during load: this bypasses the custom-editor save flow that the constitution's diagram-persistence constraint requires. (b) Checking with `fs.existsSync` and then searching the workspace by file name: this re-implements Doorstop item discovery on the client (Constitution I/II).

## R2 — Reporting corrections, unresolved items and an unreachable server

- **Decision**: One information message when paths were corrected (`Doorstop diagram: updated N moved item path(s). Save to keep the changes.`). One warning that lists the UIDs that could not be resolved. When the server cannot be reached, the existing `_metaWarningShown` warning is reused, with its text extended to say that item paths were not verified.
- **Rationale**: These reuse the notification pattern already in `handleReady`. Unresolved nodes are left untouched, as the existing "render what's on disk" fallback already does (Constitution III).

## R3 — Grid layout using each node's size

- **Decision**: `layout.gridPositions` takes `extents: [{ id, width, height }]` and `gap` in place of a single `cellWidth`/`cellHeight`. Each column is as wide as its widest node and each row as tall as its tallest node, so cell centres are cumulative sums of those sizes plus `gap`. The grid stays centred on `center` and keeps the deterministic sorted order.
- **Rationale**: Today every cell is sized to the largest node in the whole diagram, so one long heading spreads the entire grid apart. Sizing per column and per row still guarantees no overlap and keeps gaps between neighbours consistent (FR-014). `main.js` already measures extents with `nodeExtents()`.
- **Alternative rejected**: Packing variable-width rows like text flow. It gives uneven columns and is harder to read; per-row/per-column sizing is enough.

## R4 — Hierarchical layout using each node's size

- **Decision**: Before enabling vis-network's hierarchical mode, compute `nodeSpacing = max(100, maxWidth + GAP)`, `treeSpacing = max(200, maxWidth + GAP)` and `levelSeparation = max(150, maxHeight + GAP)` from `nodeExtents(ids)`. Pass them in the same `setOptions({ layout: { hierarchical: … } })` call. The maths lives in a pure `layout.hierarchicalSpacing(extents)` so it can be tested.
- **Rationale**: vis-network spaces hierarchical nodes by *centre* distance (`nodeSpacing` within a level, `levelSeparation` between levels) and does not look at label width. Its defaults are 100/150/200. Once headings are shown and wrapped, a node can be wider than 100 px, which is why nodes overlap today. Raising spacing to the largest measured extent plus `GAP` removes the overlap, and the vis defaults stay as minimums so short-label diagrams look the same as now. Layout stays delegated to vis-network, as the constitution requires.
- **Verification (analysis G1)**: The "centre distance" behaviour is a property of vis-network and can't be exercised headlessly, because vis loads from unpkg and CI tests may not use the network. Automated coverage therefore stops at `hierarchicalSpacing` returning ≥ max extent + `GAP`. Overlap after Hierarchical Layout with wrapped headings is an explicit manual check in quickstart.md. The grid, which is pure, gets an automated 50-node mixed-extent no-overlap test that matches SC-003's scale.
- **Measurement timing**: `nodeExtents` reads `network.getBoundingBox`, which vis updates on each redraw. The heading toggle relabels nodes and a layout command is a separate later click, so at least one frame has redrawn in between and the sizes are current (FR-016).

## R5 — Heading line wrapping

- **Decision**: Add a pure `layout.wrapHeading(text, limit = 30)`. While the remaining text is longer than 30 characters, it breaks at `rest.indexOf(' ', 30)`, the first space at 0-based index ≥ 30, i.e. after the first 30 characters (FR-017 wording aligned in the analysis follow-up W1). The space is dropped and the rule repeats on the rest. If no space follows, the remainder stays on one line. `render.buildLabel` calls it on the heading line. vis-network renders `\n` in `label` as separate lines.
- **Rationale**: This is exactly the rule in the spec (FR-017/018). It lives in `layout.js` because that is the only webview module that loads under Node, so `src/test/diagramLayout.test.ts` can cover it in CI (Constitution VI) without a new file. Body and ghost labels both go through `buildLabel`, so FR-019 needs no extra work.
- **Alternative rejected**: vis `widthConstraint.maximum`. It wraps by pixel width rather than at the next space after ~30 characters, and it cannot be unit-tested without a canvas.

## R6 — Removing the "Edit" control

- **Decision**: Delete the `manipulation` block from the vis options in `main.js`. vis-network's default is `manipulation.enabled: false`, so the top-left "Edit" toolbar disappears.
- **Rationale**: The context menu (`interactions.js`) does not depend on manipulation mode. "Add Link to…" goes through `beginLinkSelection` → `commands.requestLink`, and "Remove Link", "Remove from Diagram" and "Add Linked Item…" are plain messages or commands. `pendingLinkOps` is still used by `requestLink` and the `linkResult` handler, so it stays; only the `addEdge`/`deleteNode`/`deleteEdge` callbacks become dead code and are removed.

## R7 — Removing status icons

- **Decision**: Delete `render.buildBadge`, `SUSPECT_BORDER` and the suspect-border branches in `toVisNode`/ghost rendering, and drop the `badge` parameter from `buildLabel`. Delete the legend's "Status" section in `diagram.html`. Remove `active/normative/derived/reviewed/cleared` from the `NodeMeta`/`GhostNode` payloads in `diagrammPanel.ts` and `suspect` from the edges built in `withAuthoritativeEdges`.
- **Rationale**: FR-020–023. The server's `/tree` response is left as it is, because the TreeView, CodeLens and status report still use these fields.

## R8 — Entry point and removing "Open Traceability Graph"

- **Decision**:
  - Add `this.createNode('New Diagram', 'new-file', 'doorstop.newDiagram')` to `DoorstopCommandsProvider`.
  - Remove the `doorstop.showDiagram` contribution and its `view/title` entry, and remove `doorstop.newDiagram` from `view/title`.
  - Delete the `showDiagramCommand` registration in `extension.ts`.
  - Change the `addToDiagram` hint so it says "Open a diagram file (*.doorstop.json) or create one with New Diagram first."
  - Rename the `doorstop.newDiagram` title from "Doorstop: New Traceability Graph" to "Doorstop: New Diagram", so the palette and the Commands panel use the same name (analysis T1).
- **Rationale**: The `doorstop.diagram` custom editor already has `"priority": "default"` for `*.doorstop.json`, so clicking the file opens the canvas with no further work (FR-004). Assertions on the package manifest go in `src/test/extension.test.ts`. `packageMenus.test.ts` is not listed in `.vscode-test.mjs`, so it never runs in CI. The manifest suite also asserts that `doorstop.addToDiagram` is still in `view/item/context` for `doorstop.treeView` (FR-005, analysis G2).

## R9 — End-to-end test for path repair (Constitution VI, analysis K1)

- **Decision**: Add a test to the `Regression Fixture Integration Suite` in `src/test/regressionFixture.test.ts`. That suite already runs a real Doorstop server against `testdata/regression`, with that folder as the workspace. The test:
  1. Moves `REQ-001.yml` to `testdata/regression/moved-025/REQ-001.yml`.
  2. `GET /tree` through the suite's `server`, and builds `meta = { uid: { path } }` from the response.
  3. Runs `DoorstopDiagramPanel.reconcilePaths({ nodes: [{ id: 'REQ-001', fileUri: <old absolute path>, x: 0, y: 0 }], edges: [] }, meta)`.
  4. Asserts exactly one correction. Then it parses `serializeDiagram(result.diagram)` and asserts `nodes[0].fileUri === 'moved-025/REQ-001.yml'`, i.e. workspace-relative with forward slashes.
  5. In a `finally` block, moves the file back and removes `moved-025/`.
- **Why it's feasible**:
  - Doorstop's `Document._iter` walks subfolders with `os.walk`, so a moved item stays in its document.
  - The server's `get_tree_for_reading` rebuilds whenever the project fingerprint changes, so the next `/tree` reports the new path without a restart.
  - Other tests in this suite mutate fixture files and restore them the same way (`withRestoredFile`).
- **What it covers**: the real server path → reconciliation → on-disk serialization. That is exactly the server/extension seam the constitution says regressions come from.
- **What it doesn't cover**: the `handleReady` wiring (dirty flag, notifications). That would need the webview to run, which needs vis-network from unpkg, which CI may not use. This gap is accepted and the wiring is checked manually in quickstart.md.
- **Alternative rejected**: driving `vscode.openWith` on a diagram and waiting for the tab to become dirty. It depends on the webview booting, which needs the network.

## Analysis follow-ups (accepted, no change)

- **G3**: Context-menu actions are checked by hand only. They can't run headless, and R6 shows they don't depend on the removed manipulation mode.
- **G4**: Path correction on a restored hot-exit backup is not tested separately. `handleReady` reads `document.diagram` whatever its source, so the same code path runs.
- **C1**: The US4 and US5 tests read the built files as text. That is acceptable as extra checks, because R9 and the layout tests provide the feature's Principle VI floor test.
