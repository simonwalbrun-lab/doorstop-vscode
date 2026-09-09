# Contract: Diagram Webview Message Protocol Additions

**Feature**: `011-ghost-items-preview` | **Date**: 2026-09-09

This project has no external HTTP/CLI surface for this feature (no server
changes — see `research.md` §1/§2). The only interface this feature adds is
between the extension host (`src/diagrammPanel.ts`) and the diagram webview
(`src/webview/diagram/main.js`), via `postMessage`. This document is the
contract for those additions, following the existing protocol's shape and
naming conventions (see the existing `addNode`/`loadDiagram`/`addLink`
messages this extends).

## Extended existing messages

### `addNode` (extension → webview) — extended payload

Adds one optional field to the existing `node` object; additive and
backward-compatible with any code that ignores it. *(An earlier draft of
this contract also added a `text` field, for a hover content preview that
was cut from scope after implementation — see `research.md` §2. `header` is
kept, since the heading-display toggle (FR-009/FR-010) still needs it.)*

```jsonc
{
  "command": "addNode",
  "node": {
    "uid": "REQ-001",
    "fileUri": "...",
    "title": "...",
    "links": [ /* existing */ ],
    "pointer": { "x": 0, "y": 0 },
    "documentPrefix": "REQ",
    "active": true, "normative": true, "derived": false, "reviewed": true, "cleared": true,
    "header": "Some heading"   // NEW — same value as title today, forwarded explicitly
  }
}
```

### `loadDiagram` (extension → webview) — extended `meta` entries

Each `meta[uid]` entry (the existing `NodeMeta` shape) gains the same new
field:

```jsonc
{
  "command": "loadDiagram",
  "diagram": { "nodes": [ /* existing */ ], "edges": [ /* existing */ ] },
  "meta": {
    "REQ-001": {
      "documentPrefix": "REQ", "active": true, "normative": true,
      "derived": false, "reviewed": true, "cleared": true,
      "links": [ { "uid": "SYS-001", "suspect": false } ],
      "header": "Some heading"     // NEW
    }
  },
  "documents": { /* existing, unchanged */ }
}
```

## New messages

### `requestGhostPreview` (webview → extension)

Sent when the user toggles the new Ghost Preview button.

```jsonc
// Turning on:
{ "command": "requestGhostPreview", "enabled": true, "bodyUids": ["REQ-001", "REQ-002"] }

// Turning off (informational only — webview clears its own ghost DataSets
// immediately without waiting for a reply; sent so the extension can drop
// any per-request state it may be tracking):
{ "command": "requestGhostPreview", "enabled": false }
```

### `ghostPreviewData` (extension → webview)

Reply to `requestGhostPreview {enabled: true, ...}`. Computed from the
already-cached `/tree` response per `research.md` §1 — no new server call
on the happy path (a stale/missing cache triggers one `GET /tree` refetch
before replying).

```jsonc
{
  "command": "ghostPreviewData",
  "nodes": [
    {
      "uid": "REQ-010",
      "fileUri": "/abs/path/REQ-010.yml",
      "header": "Ghost item heading",
      "documentPrefix": "REQ",
      "tethers": [ { "bodyUid": "REQ-001", "ghostIsParent": true } ],
      "active": true, "normative": true, "derived": false, "reviewed": true, "cleared": true
    }
  ],
  "edges": [ { "from": "REQ-001", "to": "REQ-010", "ephemeral": true } ],
  "incomplete": false
}
```

- Each `tethers` entry records one connection to a body item on the canvas,
  and which way the underlying doorstop link runs: `ghostIsParent: true`
  means the body item links up to the ghost. The extension turns each tether
  into an edge oriented child → parent — the same orientation body-to-body
  edges already use — so the arrowhead lands on the parent regardless of
  which side of the link the ghost sits on (FR-017).
- `incomplete: true` (with `nodes: []`) signals the FR-012 failure path: the
  extension could not refresh `/tree` (e.g., server unreachable). The
  webview MUST leave existing body items untouched and show an inline
  indicator, per FR-012 / the Edge Cases section of `spec.md`.

### `promoteGhost` (webview → extension)

Sent when the user chooses "Add to Diagram" from a ghost item's context
menu (FR-013).

```jsonc
{ "command": "promoteGhost", "uid": "REQ-010", "fileUri": "/abs/path/REQ-010.yml", "pointer": { "x": 120, "y": 45 } }
```

The extension handles this exactly like `handleDroppedData` (reused, not
duplicated — see `research.md` §5): it resolves the item, replies with the
existing `addNode` message (now carrying `header` per the extended contract
above), and additionally opens the file in the diagram's secondary editor
column (`getOrCreateSideColumn()` — the same place clicking any other node
already opens its file), satisfying FR-015. No new reply message type is
needed — the webview's existing `addNode` handler already adds the node as
a real body item; it additionally removes the matching ghost entry from
`state.ghostMeta` and the shared node/edge DataSets (see `data-model.md`'s
implementation-correction note — there is no separate ghost DataSet).

## Non-goals for this contract

- No changes to the persisted `*.doorstop.json` diagram file format (Ghost
  Items are never persisted — FR-011).
- No changes to any FastAPI server endpoint or response schema (confirmed
  in `research.md` §1/§2 — `header`/`links` already exist in `GET /tree`'s
  response today).
