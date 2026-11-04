# Data Model: Batch Edit Items

Nothing new is persisted except the cell text in the `.doorstop-filter`
notebook (already stored) and the item files themselves.

## Edit section (cell YAML)

The optional `edit:` key of a filter cell mapping. Syntax:
[contracts/batch-edit.md](contracts/batch-edit.md#edit-section).

| Field | Type | Rule |
| --- | --- | --- |
| `edit` | non-empty list of operations | only next to `filters:` (and optional `order:`) |
| operation | single-key mapping | key is one of the six operation names |

Validation (server, `compile_edit`, at cell run and again at apply):

- Unknown operation key, empty list, wrong value shape → `INVALID_EDIT`.
- Field name not matching `[A-Za-z_][\w-]*` → `INVALID_EDIT`.
- Value not a quoted string, number, true/false or date → `INVALID_EDIT`;
  unquoted text and a `level` that is not a quoted string → `INVALID_EDIT`
  (FR-021). Exception: `[]` for a custom field under `set` / `add` (FR-004,
  FR-005).
- `generateChildren` together with any other operation → `INVALID_EDIT`
  (FR-003, clarification 2).
- Forbidden field (FR-012) → `PROTECTED_FIELD`; a settable standard field
  under anything but `set` → `PROTECTED_FIELD`.

## Batch operation

| Operation | Parameters | Applies when | Skip reason otherwise |
| --- | --- | --- | --- |
| `set` | field → value (one or more) | field present (standard fields always are) | `field missing` |
| `add` | field → value (one or more) | field absent | `field exists` |
| `remove` | field name or list of names | field present | `field missing` |
| `appendEntry` | field → entry (one or more) | field absent (→ `[entry]`) or list without entry | `entry exists`, `not a list` |
| `removeEntry` | field → entry (one or more) | field is a list holding the entry (all occurrences removed) | `field missing`, `not a list`, `entry missing` |
| `generateChildren` | `document?`, `force?`, `blank?` | see below | `UID exists` |

Several field operations run in listed order on one in-memory copy of the
item's data; the item is saved once. An item counts as `changed` when at
least one operation applied.

## Generate children

- Source document: the document of all ticked items (must be one).
- Target: `document` if given (must be a child of the source), else the only
  child document.
- Target UID: source number with the target's prefix, separator, digits;
  with `blank`, the target's next free number, in request order.
- `force`: an existing target item is removed (no reorder) and created anew.

## Batch request / result

See [contracts/batch-edit.md](contracts/batch-edit.md#post-batch).

Per-item outcome, one per UID in the request:

| Status | Meaning |
| --- | --- |
| `changed` | field operations applied and saved |
| `created` | child item created and linked (`created` = new UID) |
| `overwritten` | existing child replaced (`force`) |
| `skipped` | nothing written; `reason` per FR-004..FR-008, FR-018, `item not found` |
| `failed` | write failed; `reason` is the error message; other items continue |

In a dry run the same statuses describe what *would* happen; nothing is
written.

## Selection (renderer only)

Ticked rows of one rendered output, kept in the renderer's DOM. Reset to "all
ticked" whenever the output is rendered again (cell re-run).
