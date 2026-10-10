# Data Model: Diagram Canvas Refinement

The file format does not change. This feature only changes *when* `fileUri` is rewritten and which metadata reaches the webview.

## Diagram file (`*.doorstop.json`, unchanged on disk)

```json
{
  "nodes": [{ "id": "REQ-001", "fileUri": "reqs/sub/REQ-001.yml", "x": 120, "y": -40 }],
  "edges": [{ "from": "REQ-002", "to": "REQ-001" }]
}
```

| Field | Rule |
| --- | --- |
| `nodes[].id` | Item UID. The stable key (the "alias") that reconciliation matches on. Never rewritten. |
| `nodes[].fileUri` | Workspace-relative on disk, absolute in memory (`readDiagram` / `serializeDiagram`, unchanged). Rewritten on load when it differs from `/tree`'s `meta[id].path`. |
| `nodes[].x/y` | Unchanged by reconciliation; rewritten only by drag or a layout command. |

## PathReconciliation (in memory, extension host)

Result of `DoorstopDiagramPanel.reconcilePaths(diagram, meta)`.

| Field | Type | Meaning |
| --- | --- | --- |
| `diagram` | diagram object | Same as input except corrected `fileUri`s. The input object is returned unchanged (same reference) when `corrected` is empty. |
| `corrected` | `{ uid, from, to }[]` | Nodes whose `fileUri` no longer matched the server path. |
| `unresolved` | `string[]` | UIDs not present in `meta`. The node is left untouched. |

State per node, decided once per load:

```
stored path == meta[uid].path  → unchanged
uid in meta, path differs      → corrected  (diagram marked dirty)
uid not in meta                → unresolved (warning, node kept as-is)
meta unavailable               → reconciliation skipped (warning, nothing changed)
```

## Webview metadata (reduced)

`NodeMeta` / `GhostNode` lose `active`, `normative`, `derived`, `reviewed`, `cleared`. What is left:

| Entity | Fields |
| --- | --- |
| `NodeMeta` | `path`, `documentPrefix`, `links`, `header` |
| `GhostNode` | `uid`, `fileUri`, `header`, `documentPrefix`, `tethers` |
| edge (from `withAuthoritativeEdges`) | `from`, `to`, `arrows` (no `suspect`) |

## Layout inputs (webview, pure functions in `layout.js`)

| Name | Shape | Used by |
| --- | --- | --- |
| extent | `{ id, width, height }` (measured by `nodeExtents`) | `gridPositions`, `hierarchicalSpacing` |
| `gridPositions({ extents, gap, center })` | → `[{ id, x, y }]` | Grid Layout |
| `hierarchicalSpacing(extents)` | → `{ nodeSpacing, levelSeparation, treeSpacing }` | Hierarchical Layout |
| `wrapHeading(text, limit = 30)` | → string with `\n` breaks | `render.buildLabel` |
