# Data Model: Diagram Ghost Items Preview

**Feature**: `011-ghost-items-preview` | **Date**: 2026-09-09

This feature adds no persisted schema (Ghost Items are explicitly never
written to `*.doorstop.json`, per FR-011). What follows are the in-memory
shapes that flow between the extension host (`src/diagrammPanel.ts`) and the
webview (`src/webview/diagram/*.js`), extending the existing node/edge model
described in the plan's research.

## Entities

### BodyItem (existing, extended)

The requirement node a user explicitly added to the canvas. Already modeled
by vis-network's node + the extension's `NodeMeta`. **Extended** in this
feature to also carry its `header`.

| Field | Type | Notes |
|---|---|---|
| `id` | string | Requirement UID; unchanged |
| `fileUri` | string | Workspace-relative path; unchanged, persisted |
| `title` | string | Item header; unchanged, persisted |
| `x`, `y` | number | Canvas position; unchanged, persisted |
| `header` | string \| null | **New.** Same value as `title` today; added explicitly to `NodeMeta` so ghost and body items share one shape, and so the heading-display toggle (FR-009/FR-010) has something to show/hide |
| `documentPrefix`, `active`, `normative`, `derived`, `reviewed`, `cleared`, `links` | (existing `NodeMeta` fields) | Unchanged |
| `physicsFixed` | boolean (client-only, not sent over the wire) | **New.** `true` while Ghost Preview is on; drives the per-node `physics: false` vis-network option from research.md §3 |

### GhostItem (new)

A related-but-not-added item, shown only while Ghost Preview is on. Never
persisted (FR-011); recomputed every time Ghost Preview is turned on
(Assumptions in spec.md).

| Field | Type | Notes |
|---|---|---|
| `uid` | string | Requirement UID |
| `fileUri` | string | Absolute path (resolved server-side data, not yet workspace-relativized since it's never saved) |
| `header` | string \| null | For identifier-vs-heading label toggle (FR-009/FR-010) |
| `documentPrefix` | string | Drives the lightened document color (FR-003) |
| `tethers` | `{ bodyUid: string, ghostIsParent: boolean }[]` | One entry per on-canvas body item this ghost is directly linked to (FR-006: one ghost, possibly multiple tethers), each recording which way the doorstop link runs — `ghostIsParent: true` means the body item links up to the ghost. Drives the rendered edge's direction (FR-017) |
| `active`, `normative`, `derived`, `reviewed`, `cleared` | booleans | Same badge-driving flags as body items, reused as-is for visual consistency |

Rendering derivation (not stored, computed at render time): size = smaller
than body node; color = `colorForDocument(documentPrefix)` at reduced alpha
(lightened); label = same identifier/heading rule as body items, per the
shared heading-display toggle (FR-010).

### GhostEdge (new)

The physics tether between a ghost item and each body item in its
`tethers`. Rendered as a vis-network edge, visually distinguished (e.g.
dashed) from a persisted body-to-body edge so users don't mistake it for a
real, saved link — this distinction is an implementation choice, not a new
functional requirement.

| Field | Type | Notes |
|---|---|---|
| `from` | string | The child end of the link — the ghost when it's a child of the body item, otherwise the body item (FR-017) |
| `to` | string | The parent end of the link, where the arrowhead lands (FR-017) |
| `ephemeral` | boolean | Always `true`; flags this edge as ghost-only so it's excluded from `diagramChanged`/persistence |

### DocumentColor (existing, unchanged)

Already implemented (`colorForDocument` in `render.js`). Reused as-is;
Ghost Items apply the same base color at reduced visual intensity rather
than introducing a second palette.

## Client-side webview state additions (`state.js`)

| Field | Type | Notes |
|---|---|---|
| `ghostPreviewEnabled` | boolean | Mirrors the new toggle; mutually exclusive with `hierarchical` (FR-014) |
| `headingDisplayEnabled` | boolean | New toggle (FR-009); applies to both body and ghost labels (FR-010) |
| `ghostMeta` | `Map<uid, GhostItem>` | **Implementation correction from the original plan**: vis-network's `Network` renders exactly one bound nodes/edges `DataSet` pair, so a second `visGhostNodes`/`visGhostEdges` DataSet (as originally planned above) would never actually render. Ghost nodes/edges live in the same `visNodes`/`visEdges` DataSets the network is already bound to; `ghostMeta` (keyed by uid) is what marks an entry as a ghost, and every ghost edge additionally carries `ephemeral: true`. `getDiagramData()`/`saveGraphState()` filter both out by these markers, preserving FR-011/FR-005's persistence guarantee |
| `physicsToggleSuspended` | boolean | Tracks whether `#physics-toggle` was force-disabled by Ghost Preview, so it can be restored to its true prior state on exit (research.md §4) |

## State transitions

- **Ghost Preview OFF → ON**: webview sends `requestGhostPreview {enabled: true, bodyUids}` → extension computes ghosts from cached `/tree` data → webview receives `ghostPreviewData {nodes, edges, incomplete?}` → renders `visGhostNodes`/`visGhostEdges`, sets body nodes' `physics: false`, forces network physics on, disables `#physics-toggle` and `#layout-toggle`.
- **Ghost Preview ON → OFF**: webview clears `visGhostNodes`/`visGhostEdges` locally, restores body nodes' `physics` to the prior Auto-Arrange setting, re-enables `#physics-toggle` and `#layout-toggle`. No extension round-trip needed (nothing was persisted).
- **Ghost → Body promotion**: webview sends `promoteGhost {uid, fileUri, pointer}` → extension runs the existing `handleDroppedData` path → extension posts `addNode` (existing message) → webview adds the real body node/edges, removes the matching entry from `visGhostNodes`/`visGhostEdges`, opens the file in the editor (FR-015).
- **Tree-fetch failure while enabling Ghost Preview**: extension returns `ghostPreviewData {nodes: [], edges: [], incomplete: true}` → webview shows an inline "preview incomplete" indicator, leaves body items untouched (FR-012), and does not enter the fixed/physics-split state for the failed attempt.
