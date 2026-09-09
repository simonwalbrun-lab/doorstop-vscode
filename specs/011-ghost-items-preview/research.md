# Research: Diagram Ghost Items & Content Preview

**Feature**: `011-ghost-items-preview` | **Date**: 2026-09-09

This phase resolves implementation-level unknowns that the spec intentionally
left open (it describes behavior, not mechanism). Each item below is a
decision, not a requirement change — nothing here contradicts `spec.md`.

## 1. How is ghost-item adjacency computed without violating Constitution Principle I?

**Decision**: Compute "every item directly linked to a body item" entirely
client-side in `src/diagrammPanel.ts`, over the data already returned by the
existing `GET /tree` endpoint (already fetched wholesale by `fetchTreeMeta()`
and cached in `this._itemMeta`). No new server endpoint is added for this.

**Rationale**: Constitution Principle I forbids re-implementing Doorstop file
parsing, numbering, or link/suspect computation on the client. It does not
forbid filtering an already-fully-computed, already-server-sourced dataset in
memory — that's exactly what `requirementTree.ts`'s hierarchy build already
does today (Phase: tree-from-server spike, this same session) and was treated
as compliant. Ghost adjacency needs the same treatment: for on-canvas item
`X`, a ghost candidate is any `Y` in the flattened `/tree` item list where
`Y.uid` appears in `X.links[].uid` (X's parents) or `X.uid` appears in
`Y.links[].uid` (Y is a child linking up to X). This is a one-hop set lookup
over data Doorstop's server already computed — not rediscovery of it.

**Alternatives considered**:
- A new `GET /tree/related?uids=...` server endpoint. Rejected: the server
  already returns the full graph in one call; adding a second endpoint that
  recomputes a subset of the same data is exactly the kind of duplicated
  logic Principle II warns against, for no behavioral gain (the full tree is
  already cached client-side after the first load).

## 2. Where does hover-preview content (heading + body text) come from? *(superseded — see note below)*

> **Post-implementation update**: the hover content preview described in this section was cut from scope after implementation — it did not work reliably in practice and turned out not to be needed. The `text` field it required was removed from `NodeMeta`/`GhostNode` and the wire payloads; `header` was kept, since it's still used by the heading-display toggle (FR-009/FR-010) and ghost labels. The rest of this section is left as a historical record of the original decision.

**Decision**: Reuse the `header` and `text` fields already present in every
`/tree` item (`server/src/doorstop_server/routers/tree.py` /
`ItemNode.header` / `ItemNode.text`), which are fetched today but only
partially forwarded to the webview. Extend the extension-side `NodeMeta`
shape (`diagrammPanel.ts`) to carry `header`/`text`, and forward them to the
webview in the existing `addNode`/`loadDiagram` payloads and the new ghost
payload (see `contracts/diagram-message-protocol.md`). No new server
endpoint is needed — this data already exists in the response the extension
already fetches once per load.

**Alternatives considered**:
- A new `GET /items/{uid}` endpoint for on-demand content fetch. Rejected:
  would add a second way to read the same data `/tree` already returns in
  bulk, and would require a network round-trip on every hover (latency risk
  against SC-003's ~2-second target) instead of an in-memory lookup.

## 3. How does vis-network implement "body items fixed, ghost items physics-driven and tethered"?

**Decision**: When Ghost Preview is on, set each body node's vis-network
per-node option to `physics: false` (an unmoving anchor) while leaving the
network's overall `physics.enabled` forced to `true`. Ghost nodes are added
with `physics: true` (default) and a `visEdges` tether to each body item they
connect to. vis-network's springs pull physics-enabled nodes toward their
edge-connected neighbors regardless of whether those neighbors are
physics-enabled themselves, so a fixed body node still acts as an anchor for
its tethered ghost(s), and dragging a body node updates the anchor position
the spring simulation is pulling toward — satisfying FR-004's "ghost follows
when body item is moved" without any custom force math.

**Alternatives considered**:
- `fixed: {x: true, y: true}` on body nodes instead of `physics: false`.
  Rejected as the primary mechanism (though behaviorally similar) because
  `physics: false` is the same property already used elsewhere in this
  codebase's physics toggle (`PHYSICS_OFF` in `main.js`), keeping the two
  code paths consistent.

## 4. How does Ghost Preview interact with the "Disable Auto-Arrange" physics toggle (not the Hierarchical Layout toggle, which is already resolved via `/speckit-clarify`)?

**Decision**: While Ghost Preview is active, the network's overall physics
engine is forced enabled (independent of the user's last "Auto-Arrange"
preference), because ghost positioning has no meaning without a running
simulation. The `#physics-toggle` button is disabled (inert) for the
duration of Ghost Preview, mirroring the existing precedent where
`#layout-toggle` already disables `#physics-toggle` while Hierarchical
Layout is active (`main.js`'s `setupLayoutToggle`). Turning Ghost Preview off
restores whatever physics state the user had before (same restore pattern
already used by the Hierarchical Layout toggle, and already captured for
body items generally in `spec.md`'s Assumptions).

**Rationale**: This is a mechanical consequence of FR-004, not a new user
capability, so it doesn't require a spec clarification — but it does need an
explicit decision so the two "physics-adjacent" toggles (`#physics-toggle`
and Ghost Preview) don't produce contradictory states.

## 5. How does promoting a ghost to a body item reuse existing code?

**Decision**: Ghost promotion (FR-013/FR-015) reuses the exact same
`DoorstopDiagramPanel` code path already used for `doorstop.addToDiagram`
and drag-and-drop: `handleDroppedData(fileUri, pointer)`, which already
resolves the file, reads its metadata, and posts an `addNode` message back
to the webview. The only addition is (a) the webview removing the
now-redundant ghost node/edges for that UID from the ghost dataset once the
real `addNode` arrives, and (b) opening the file in the editor afterward
(`vscode.window.showTextDocument`), matching this session's established
"jump to new items" convention (already applied to `add`/`derive` commands).

**Alternatives considered**: A separate, parallel "promote" code path.
Rejected — would duplicate the file-resolution/metadata-fetch logic
`handleDroppedData` already provides, against Principle II's spirit (one
implementation per behavior) even though that principle is written about
Doorstop specifically; the same discipline applies here for consistency.

## Summary of resolved unknowns

| Unknown | Resolution |
|---|---|
| Ghost adjacency source | Client-side filter over already-cached `/tree` data; no new server endpoint |
| Hover content source | Existing `/tree` `header`/`text` fields, forwarded through extended `NodeMeta` |
| Fixed-body / physics-ghost mechanism | Per-node `physics: false` on body nodes, network physics forced on, vis-network springs do the rest |
| Ghost Preview vs. Auto-Arrange toggle | Ghost Preview forces physics on and disables `#physics-toggle` for its duration, restoring prior state on exit |
| Ghost promotion implementation | Reuse `handleDroppedData`, add file-open + ghost-dataset cleanup |

No `NEEDS CLARIFICATION` markers remain — all Technical Context unknowns are resolved above.
