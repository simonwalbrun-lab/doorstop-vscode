# UI Contract: Diagram Canvas Refinement

## Contributed commands (`package.json`)

| Command | Before | After |
| --- | --- | --- |
| `doorstop.newDiagram` | "Doorstop: New Traceability Graph" in palette + Doorstop TreeView title bar | **"Doorstop: New Diagram"** in palette + **Doorstop Commands panel entry "New Diagram"** (icon `new-file`) |
| `doorstop.showDiagram` ("Open Traceability Graph") | Palette + TreeView title bar | **Removed** (no contribution, no registration) |
| `doorstop.addToDiagram` | TreeView item context menu | Unchanged |

`menus.view/title` for `view == doorstop.treeView` contains no `doorstop.*Diagram` command.

Heading wrap rule: break at the first space after the first 30 characters (0-based index ≥ 30), repeatedly; never mid-word.

Opening an existing diagram: the `doorstop.diagram` custom editor for `*.doorstop.json` stays at `priority: default`, so a click in the Explorer opens the canvas.

## Notifications on diagram load

| Condition | Kind | Text (shape) |
| --- | --- | --- |
| ≥1 path corrected | info | `Doorstop diagram: updated N moved item path(s). Save to keep the changes.` |
| ≥1 UID unresolved | warning | `Doorstop diagram: could not find item(s) <UID, …> in the project; kept as stored.` |
| `/tree` unavailable | warning (once per panel) | Existing message + `Item paths were not verified.` |
| nothing to change | none | — |

## Canvas surface

- No vis-network manipulation toolbar ("Edit") is rendered.
- Toolbar: Hierarchical Layout, Grid Layout, Ghost Preview, Show/Hide Headings (unchanged).
- Context menu entries are unchanged: node → Add Linked Item…, Add Link to…, Remove from Diagram. Ghost → Add to Diagram. Edge → Remove Link.
- Node label: `UID` and, if headings are on, the heading wrapped per `wrapHeading`. No status icons, and no suspect border.
- Legend: only the "Documents" section.

## Extension ↔ webview messages

The message names don't change. Payload changes:

- `loadDiagram.meta[uid]`: status flags are gone (see data-model.md).
- `loadDiagram.diagram.edges[]`: `suspect` is gone.
- `ghostPreviewData.nodes[]`: status flags are gone.
