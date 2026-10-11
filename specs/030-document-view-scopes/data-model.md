# Data Model: Document View Scopes

All in-memory in the extension; the server owns persisted data.

## ViewScope

| Field | Type | Notes |
|---|---|---|
| `kind` | `'document' \| 'section' \| 'filter'` | |
| `key` | string | `doc:<PREFIX>` / `sec:<UID>` / `flt:<n>`; identity of a view (FR-005) |
| `label` | string | line-1 marker label and tab title stem: `SYS`, `SYS-0012 section`, `Filter 2` |
| `prefix` | string? | document kinds only: the document |
| `rootUid` | string? | section only: the node whose descendants are shown |
| `uids` | string[]? | filter only: UIDs at open time (snapshot, FR-012) |

Rules: two views are the same view iff keys are equal. A section's members are
recomputed from the fresh tree on every load (root + descendants, active only).
A filter's members are `uids ∩ fresh tree`, active only.

## ScopedSnapshot

`DocumentNode`-shaped (`prefix` = scope label, `markerPath`, `items`) with
`ItemNode.documentPrefix` added so creation and writes know the real document.
`items` order: `/tree` document order, then level order.

## ItemNode additions

| Field | Type | Notes |
|---|---|---|
| `documentPrefix` | string | filled client-side from the owning `DocumentNode` |
| `fields` | `Record<string,string>?` | only the configured fields the item has with a scalar value |

## DocumentViewState changes

| Field | Change |
|---|---|
| `prefix` | replaced by `scope: ViewScope` |
| `folder` | → `folders: Set<string>` |
| `blocks[].fields` | rendered field lines, for diffing |

## Displayed-fields list

Setting `doorstop.documentView.fields: string[]`, default `[]`. Normalised on
read: trimmed, de-duplicated (first wins), empty entries dropped, protected
names removed and reported.

## Validation rules

- Protected field names (never editable here): `uid, level, active, normative,
  derived, reviewed, cleared, links, header, text`.
- A field value is a single-line scalar; a value edited to multi-line is a
  structural error (`fields-multiline`) like other block-structure errors.
- Removing a field line from the block does not delete the attribute from the
  item (structural warning, line restored on save refusal) — fields are edited,
  not deleted, in this view.
