# Data Model: Filter Notebooks (MVP)

Nothing new is persisted by the server. The only new file is the notebook
itself ([contracts/notebook-file.md](contracts/notebook-file.md)).

## Filter notebook (file, extension side)

| Field | Type | Rules |
|-------|------|-------|
| `cells` | list of Cell | Order preserved; may be empty |

**Cell**

| Field | Type | Rules |
|-------|------|-------|
| `kind` | `"markdown"` \| `"filter"` | Markdown cells are never executed |
| `value` | string | Raw source |

Outputs are runtime-only (`vscode.NotebookCellOutput`) and are never written
to the file (FR-014).

## Filter expression (server side, in memory per request)

Parsed from the cell YAML, then evaluated per item. A tree of:

| Node | Children | Matches an item when |
|------|----------|----------------------|
| `And` | ≥1 nodes | every child matches |
| `Or` | ≥1 nodes | any child matches |
| `Not` | ≥1 nodes | no child matches |
| `HasChild` | 1 node | some item linking to this item matches the child |
| `HasParent` | 1 node | some item this item links to matches the child |
| `Compare` | — | `attribute OP literal` holds (see semantics in [contracts/filter-syntax.md](contracts/filter-syntax.md)) |
| `Method` | — | `attribute.contains(x)` / `.startsWith(x)` / `.isEmpty()` holds |

Validation happens once, before evaluation, so a malformed filter fails with
`INVALID_FILTER` even on an empty project.

Implementation note: the parsed tree can simply be nested Python closures
`item -> bool`. No node classes are needed.

## Item view (evaluation input)

Attribute lookup for one Doorstop `Item`:

| Name | Value |
|------|-------|
| `uid` | `str(item.uid)` |
| `document` | `str(item.document.prefix)` |
| `level` | `item.level` (Doorstop `Level`) |
| `header`, `text`, `ref` | `str(...)` or `""` |
| `active`, `normative`, `derived`, `reviewed` | `bool` |
| `links` | `[str(uid) for uid in item.links]` |
| other | `item.get(name)`; callables and missing → `None` |

Per-request indexes: `uid → Item` and `uid → [child Item]`, each built in one
pass over the tree.

## Filter result row (API output)

`FilterItem`: `uid`, `documentPrefix`, `level`, `header?`, `text?`, `path`,
`values` (one display string per column). `FilterResponse`: `columns` (the
cell's `order:` without `uid`, or `document`, `level`, `header`) and `items`.
See [contracts/filter-api.md](contracts/filter-api.md).
