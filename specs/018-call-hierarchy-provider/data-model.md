# Data Model: Requirement Call Hierarchy

**Feature**: `018-call-hierarchy-provider` | **Date**: 2026-09-11

No new persisted data. This feature is a read-only projection of the
existing `DoorstopIndex` (built from `GET /tree`) onto VS Code's
`CallHierarchyItem` model. The entities below describe that projection and
the rules it must obey.

## Source entities (existing, reused as-is)

| Entity | Where | Fields used |
| --- | --- | --- |
| `IndexedItem` | `src/doorstopIndex.ts` | `uid`, `header?`, `path`, `links: LinkInfo[]`, `documentPrefix` |
| `LinkInfo` | `src/doorstopTypes.ts` | `uid` (target of an upstream link); `suspect` is **not** used (clarification Q5) |
| `DoorstopIndex` | `src/doorstopIndex.ts` | `getItem(uid)`, `getLinkers(uid)`, `getUri(uid)`, `has(uid)` |

## Hierarchy Entry → `vscode.CallHierarchyItem`

One entry per requirement shown in the peek. Built by a single
`toCallHierarchyItem(item: IndexedItem, headerLocation)` helper so every
code path (prepare, incoming, outgoing) produces identical labels (FR-004,
SC-004).

| `CallHierarchyItem` field | Value | Rule |
| --- | --- | --- |
| `name` | `"${uid}: ${header}"` | `header` trimmed; when empty/absent → `uid` alone, no colon (FR-004) |
| `detail` | `documentPrefix` | e.g. `REQ`, `ARCH`, `MD` (clarification Q1) |
| `kind` | `SymbolKind.Object` | fixed; neutral glyph |
| `uri` | `Uri.file(item.path)` | the item's own file |
| `range` | header line | from `findHeaderLocation(uri)` — `header:` line for `.yml`, first `#` heading for `.md`; falls back to `0:0` if not found |
| `selectionRange` | same as `range` | what the widget reveals on select (FR-006) |

## Unresolved Entry → `vscode.CallHierarchyItem`

Produced only in the outgoing direction, when `item.links[i].uid` is not in
the index (FR-010; fixture case `REQ-009 → REQ-999`).

| Field | Value |
| --- | --- |
| `name` | the dangling `uid` alone |
| `detail` | `"unresolved"` |
| `kind` | `SymbolKind.Null` (distinct glyph so it reads as "not a real item") |
| `uri` | the **referencing** item's file (the one whose `links:` names the UID) |
| `range` / `selectionRange` | the `links:` line naming the UID (`findReferenceLocation(referencingUri, uid)`) |

Expanding an unresolved entry in either direction yields `[]` by
construction: `index.getItem(uid)` is `undefined` (no outgoing) and no item
can list a linker for a UID that does not exist as an item (no incoming).

## Direction mapping

| VS Code call | Doorstop relationship | Source | Spec term |
| --- | --- | --- | --- |
| `provideCallHierarchyOutgoingCalls(item)` | items `item` links **to** (parents) | `index.getItem(uid).links[].uid` | **outgoing = upstream** |
| `provideCallHierarchyIncomingCalls(item)` | items that link **to** `item` (children) | `index.getLinkers(uid)` | **incoming = downstream** |

`CallHierarchyOutgoingCall.fromRanges` = the `links:` line in the **root's**
file naming the target; `CallHierarchyIncomingCall.fromRanges` = the
`links:` line in the **linker's** file naming the root.

## Identity

The `uid` is carried on the `CallHierarchyItem` so `provideIncoming` /
`provideOutgoing` can look it up without re-parsing `name`. Implementation
choice: subclass `vscode.CallHierarchyItem` as `RequirementHierarchyItem`
with `readonly uid: string` and `readonly unresolved: boolean` (the sample
uses the same subclass pattern). VS Code passes the same object instance
back to the provider, so the extra fields survive.

## Root resolution (`prepareCallHierarchy`)

```text
word at cursor matches UID_REGEX AND index.has(word)  → root = that item
else getDocumentUid(document, index) is defined       → root = the file's own item
else                                                  → undefined (no hierarchy)
```

## Lifecycle / state

Stateless. Every provider call does `loadDoorstopIndex(server)` (FR-012:
reflects links added/removed since last open). No caching between calls;
the widget's own lazy expansion means at most one `GET /tree` per user
expansion, well within SC-003 for a local server.

## Validation rules

- `name` never contains a trailing `: ` when the header is empty.
- `detail` is never empty for a resolved entry (every item belongs to a
  document with a prefix in `GET /tree`).
- Every returned `uri` is a `file:` URI inside the workspace that the index
  reported — never synthesised.
- Provider methods never throw: index load failure → `undefined` (prepare)
  or `[]` (expansion) with a logged error, plus the FR-011 warning from
  `prepare` only.
