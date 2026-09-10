# Contract: Diagram Webview ⇄ Extension Messages

**Feature**: `015-diagram-context-menu-layouts` | **Date**: 2026-09-10

The diagram canvas has exactly one external interface: the `postMessage` channel
between the webview (`src/webview/diagram/*.js`) and the extension host
(`src/diagrammPanel.ts`). This document records what that contract looks like after
this feature — what is reused unchanged, what changes, and what is new.

There is **no server API change**. The only requirement mutation this feature performs
is link creation, which goes through the existing
`POST /items/{uid}/links  { parentUid }` endpoint via the existing handler
(Constitution I).

---

## Reused unchanged

These already exist and this feature deliberately does not alter them.

### `addLink` — webview → extension

```json
{ "command": "addLink", "from": "<source uid>", "to": "<target uid>" }
```

Sent by the new context-menu link flow after a target is chosen, with exactly the same
payload the drag-to-link gesture sends today. The host calls
`POST /items/{from}/links {parentUid: to}` and answers with `linkAddResult`.

### `linkAddResult` — extension → webview

```json
{ "command": "linkAddResult", "from": "…", "to": "…", "success": true }
{ "command": "linkAddResult", "from": "…", "to": "…", "success": false, "error": "…" }
```

On `success: true` the webview adds the edge and persists via `diagramChanged`
(FR-007). On failure the host has already shown an error message; the webview leaves
the diagram untouched (FR-011).

**Note for implementation**: the existing handler resolves a callback stored in
`pendingLinkOps` by `"from->to"` key, because it was written for `vis-network`'s
`manipulation.addEdge` callback protocol. The context-menu flow has no such callback,
so it must register an entry in the same map (a plain edge-adding function) rather
than bypassing the handler — one result path, not two.

### `removeLink`, `linkRemoveResult`, `createLinkedItem`, `promoteGhost`, `requestGhostPreview`, `ghostPreviewData`, `openFile`, `activateNode`, `ready`, `loadDiagram`, `resolveDroppedItem`

All unchanged in shape and meaning (FR-012, FR-016).

---

## Changed

### `addNode` — extension → webview

The `node` payload gains one optional field.

```json
{
  "command": "addNode",
  "node": {
    "uid": "REQ001",
    "fileUri": "reqs/REQ001.yml",
    "title": "…",
    "links": ["…"],
    "documentPrefix": "REQ",
    "pointer": { "x": 0, "y": 0 },
    "autoPlace": true
  }
}
```

| Field | Change |
| --- | --- |
| `autoPlace` | **NEW, optional.** When `true`, the webview ignores `pointer` and places the node at a free, non-overlapping position found by `layout.findFreeSlot` (FR-015). Absent or `false` → `pointer` is honoured exactly as today. |

Producers:

- `DiagramPanel.addRequirementToDiagram` (the tree's "Add to Diagram" command) sets
  `autoPlace: true` and stops generating a random pointer.
- Drag-and-drop from an editor keeps sending a real `pointer` and no `autoPlace`.
- `handleCreateLinkedItem` and `handlePromoteGhost` keep sending a real `pointer`
  (both have a meaningful drop point — the right-clicked node's location).

**Compatibility**: additive and optional, so an older webview build ignoring the field
still works off `pointer`.

### `diagramChanged` — webview → extension

Shape unchanged:

```json
{ "command": "diagramChanged", "diagram": { "nodes": [...], "edges": [...] } }
```

What changes is **when** it is sent:

| Trigger | Before | After |
| --- | --- | --- |
| Node dragged | only while not in hierarchical mode | always (FR-021) |
| Node removed via context menu | n/a | **new trigger** (FR-004) |
| Grid layout applied | n/a | **new trigger** (FR-022) |
| Hierarchical layout applied | never (mode was not persisted) | **new trigger** (FR-022) |

---

## New

### `removeNodeFromDiagram` — internal to the webview

Removal is **not** a message. It is handled entirely inside the webview: the node and
its incident edges are removed from `visNodes`/`visEdges`, `nodeMap`/`nodeMeta`
entries are dropped, `saveGraphState` runs, and a `diagramChanged` is sent.

**Why no round trip**: the requirement and its links must not change (FR-003), so
there is nothing for the server to do. Sending a message to the host and back would
add a failure mode to an operation that has none.

**Follow-up obligation** (FR-005): if `ghostPreviewEnabled` is true after a removal,
the webview immediately sends the existing

```json
{ "command": "requestGhostPreview", "enabled": true, "bodyUids": ["…"] }
```

with the reduced body set, so ghosts that existed only because of the removed item
disappear. This mirrors what the `addNode` handler already does after a promotion.

---

## Invariants the contract must preserve

1. Ghost nodes and `ephemeral: true` edges never appear in a `diagramChanged` payload
   (already enforced by the filters in `getDiagramData`).
2. Every persisted position in `diagramChanged` comes from `network.getPositions()`,
   not from stale DataSet `x`/`y` — the layout commands must therefore write positions
   into the DataSet **and** let the network settle before the payload is built.
3. A `linkAddResult` for a `from->to` pair that has no pending entry is ignored, so a
   cancelled flow cannot retroactively add an edge (FR-008).
