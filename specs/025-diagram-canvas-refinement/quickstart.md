# Quickstart: Diagram Canvas Refinement

## Automated (CI)

```sh
npm run compile          # check-types + lint + build
npm test                 # vscode-test, includes the suites below
```

| Suite | Proves |
| --- | --- |
| `src/test/diagramLayout.test.ts` | `wrapHeading` breaks at the first space at index ≥ 30, never mid-word; `gridPositions` with mixed extents (incl. 50 nodes, SC-003 scale) has no overlapping boxes and is deterministic; `hierarchicalSpacing` ≥ max extent + GAP and ≥ vis defaults |
| `src/test/extension.test.ts` | `reconcilePaths`: moved item → corrected; matching path (incl. drive-letter case difference) → unchanged, same object; unknown UID → unresolved, node untouched |
| `src/test/extension.test.ts` (manifest suite) | `doorstop.showDiagram` absent; no diagram command in TreeView `view/title`; `doorstop.newDiagram` contributed as "Doorstop: New Diagram"; `doorstop.addToDiagram` still in the TreeView item context menu |
| `src/test/regressionFixture.test.ts` (real server) | End to end: `REQ-001.yml` moved into a subfolder → `/tree` reports the new path → `reconcilePaths` corrects it → `serializeDiagram` writes `moved-025/REQ-001.yml`; file restored afterwards |

## Manual (Extension Development Host, `testdata/regression` workspace)

1. **Entry point**: the Doorstop Commands panel lists "New Diagram" and clicking it creates and opens a diagram. The TreeView title bar has no diagram buttons. The palette has no "Open Traceability Graph". Clicking any `*.doorstop.json` in the Explorer opens the canvas.
2. **Path repair** (the dirty flag and notifications are only checked here; the data path is covered by the fixture test): add an item to a diagram, save, close. Move the item's `.yml` into a subfolder and reopen. The node renders, an info message reports 1 updated path, and the tab is dirty. After saving, the file holds the new relative path. Reopen again: no message, not dirty.
3. **Unresolved**: edit a node's `id` in the JSON to `NOPE-999` and open. A warning names `NOPE-999` and the node is still shown.
4. **Edit control**: no "Edit" button at the top-left. Add Link, Remove Link, Remove from Diagram and Add Linked Item all work from the context menu.
5. **Layout**: give one item a ~80-char heading and turn on Show Headings. The heading shows on 2–3 lines. Run Grid Layout, then Hierarchical Layout: no boxes overlap. Hierarchical overlap has no automated check, because vis-network can't run headless, so this step is the check for FR-015 / SC-003.
6. **Icons**: items that are unreviewed, suspect or derived show no icons and no red border. The legend shows only Documents.
