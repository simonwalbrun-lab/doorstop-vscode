# Phase 1 Data Model: Diagram Context Menu Actions & Static Layouts

**Feature**: `015-diagram-context-menu-layouts` | **Date**: 2026-09-10

This feature introduces no persisted schema change and no server-side entity. What
follows is the in-memory webview state it adds, changes, and removes, plus the
unchanged on-disk shape it must keep writing.

---

## 1. On-disk diagram document — UNCHANGED

`*.doorstop.json`, read and written by `DiagramPanel` through the custom editor.

| Field | Type | Notes |
| --- | --- | --- |
| `nodes[]` | array | One entry per **body item**. Ghost items are never persisted. |
| `nodes[].id` | string | Doorstop UID. |
| `nodes[].fileUri` | string | Workspace-relative path to the requirement file. |
| `nodes[].title` | string | Cached header text. |
| `nodes[].x`, `nodes[].y` | number | Canvas coordinates. |
| `edges[]` | array | Persisted (non-`ephemeral`) edges between body items. |

**What this feature changes about it**: nothing structural. Removal deletes an entry
from `nodes[]` and every `edges[]` entry referencing it (FR-002, FR-004). Layout
commands rewrite `x`/`y` on existing entries (FR-022). Both go through the existing
`getDiagramData()` → `diagramChanged` → custom-editor-save path, so Save / Save As /
Revert / hot-exit backup keep working unmodified.

---

## 2. Webview state (`state.js`) — ADDED

| Name | Type | Lifetime | Purpose |
| --- | --- | --- | --- |
| `pendingLinkSource` | `string \| null` | Cleared on completion, cancel, Escape, empty-canvas click, or removal of the source node | UID of the node whose context menu started "Add Link to…". While non-null, the canvas is in target-selection mode and the click handler consumes clicks as target picks (FR-006, FR-008). |

**Invariants**

- `pendingLinkSource` is non-null only while the status banner is visible; the two are
  set and cleared together.
- A node id in `pendingLinkSource` must be a body item — never a key of `ghostMeta`.
- Removing the node named by `pendingLinkSource` clears it (spec Edge Cases).

---

## 3. Webview state (`state.js`) — REMOVED

| Name | Why it goes |
| --- | --- |
| `physicsEnabled` | Auto-arrange is no longer a user preference; body items are always static (FR-013, FR-017). |
| `physicsToggleSuspended` | Existed only to remember that Ghost Preview had force-disabled the auto-arrange button. No button, no state. |
| `hierarchical` | The hierarchical layout is a one-shot command, not a mode, so there is no "currently hierarchical" condition to branch on (FR-021). Every current reader — `interactions.js`'s `dragEnd` guard, `main.js`'s `exitGhostPreview` and physics-toggle branches — becomes unconditional. |
| `manualPositions` | Was the snapshot taken before entering hierarchical mode so it could be restored on exit. With no mode to exit, there is nothing to restore. |

**Consequence to verify during implementation**: `interactions.js` currently only
persists a drag when `!state.hierarchical`. After removal that guard disappears and
every drag persists — which is the correct behaviour for FR-021 and was previously
suppressed while hierarchical mode was active.

---

## 4. Webview state — UNCHANGED

`visNodes`, `visEdges`, `nodeMap`, `nodeMeta`, `ghostMeta`, `ghostPreviewEnabled`,
`headingDisplayEnabled`, and the `getDiagramData` / `saveGraphState` / `clearGhosts`
helpers all keep their current meaning. In particular `ghostMeta` remains the sole
discriminator between a body item and a ghost item, and every filter that reads
`!ghostMeta.has(id)` keeps working.

---

## 5. Node physics property — CHANGED SEMANTICS

| Node kind | Before | After |
| --- | --- | --- |
| Body item | `physics: false` only while Ghost Preview is on; reset to `true` on exit | `physics: false` **always**, from insertion onward (FR-013, FR-014) |
| Ghost item | physics-driven, tethered to its body items | unchanged (FR-016) |
| Network-level `physics.enabled` | followed the user's auto-arrange preference, forced on during Ghost Preview | `true` only while Ghost Preview is on, `false` otherwise |

---

## 6. Layout module contract (`layout.js`) — NEW

Pure functions, no DOM and no `vis` reference; the caller supplies measurements. This
is what the CI test exercises (Constitution VI).

### `gridPositions({ ids, cellWidth, cellHeight, center })`

| Input | Type | Meaning |
| --- | --- | --- |
| `ids` | `string[]` | Body-item UIDs to place. |
| `cellWidth`, `cellHeight` | number | Pitch per cell: widest/tallest node extent plus a fixed gap. |
| `center` | `{x, y}` | Point the finished grid is centred on. |

Returns `Array<{ id, x, y }>`.

**Rules** (FR-018, FR-023)

- `ids.length === 0` → returns `[]`. No error, no side effect.
- `cols = ceil(sqrt(n))`, `rows = ceil(n / cols)`; `|cols - rows| <= 1` for all n ≥ 1.
- Placement is row-major over `ids` sorted ascending; the same input always yields the
  same output.
- Adjacent cell centres are exactly `cellWidth` / `cellHeight` apart, so no two nodes
  overlap as long as the caller derived the pitch from the largest node extent.
- The bounding box of the returned points is centred on `center`.

### `findFreeSlot({ occupied, width, height, center })`

| Input | Type | Meaning |
| --- | --- | --- |
| `occupied` | `Array<{x, y, width, height}>` | Bounding boxes of nodes already on canvas. |
| `width`, `height` | number | Extents of the node being placed. |
| `center` | `{x, y}` | Search origin. |

Returns `{ x, y }` — the first position on an outward spiral from `center` whose box
overlaps nothing in `occupied` (FR-015). With `occupied` empty it returns `center`.

---

## 7. Context menu contents — CHANGED

| Right-clicked target | Before | After |
| --- | --- | --- |
| Body item | "Add Linked Item…" | "Add Linked Item…", **"Add Link to…"**, **"Remove from Diagram"** |
| Ghost item | "Add to Diagram" | unchanged (FR-012) |
| Edge | "Remove Link" | unchanged (FR-012) |
| Empty canvas | none | none (clicking here cancels a pending link selection) |

---

## 8. Toolbar controls — CHANGED

| Control | Before | After |
| --- | --- | --- |
| `#layout-toggle` | Mode toggle, label flips to "Manual Layout", disables `#physics-toggle` and `#ghost-preview-toggle` while active | One-shot command labelled "Hierarchical Layout"; disables nothing (FR-019, FR-024) |
| `#grid-layout` | — | **NEW** one-shot command "Grid Layout" (FR-018) |
| `#physics-toggle` | Auto-arrange enable/disable | **REMOVED** (FR-017) |
| `#ghost-preview-toggle` | Disabled while hierarchical mode active | Never disabled (FR-024); behaviour otherwise unchanged |
| `#heading-toggle` | — | unchanged |
| `#diagram-status` | — | **NEW** banner for transient canvas messages (link-target prompt, self-link rejection). Sibling of the existing `#ghost-preview-status`, which keeps its own separate role. |
