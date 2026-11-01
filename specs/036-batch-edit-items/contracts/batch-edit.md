# Contract: Batch Edit

## Edit section

A filter cell becomes editable by wrapping the filter in `filters:` and adding
`edit:`. `order:` stays optional.

```yaml
filters:
  and:
    - document == "TST"
    - status == "ready"
order: [testrun, testruns]
edit:
  - set: {testrun: "TR-2026-11", priority: 2}   # one or more field: value pairs
  - add: {result: "open", runs: []}              # [] creates an empty list field
  - remove: obsolete                              # field names, a name or a list of names
  - appendEntry: {testruns: "TR-2026-11"}
  - removeEntry: {testruns: "TR-2026-10"}
```

```yaml
filters: document == "REQ"
edit:
  - generateChildren: {document: "TST", force: false, blank: false}
```

- Operation names: `set`, `add`, `remove`, `appendEntry`, `removeEntry`,
  `generateChildren`. Block style (`set:\n    testrun: "TR-1"`) is equally valid.
- `generateChildren` takes a mapping (all keys optional) or nothing
  (`- generateChildren:`), and must be the only operation.
- Values are written like in filters (FR-021): text in double quotes (single
  quotes work too), including levels (`level: "1.10"`) and `document:`;
  numbers, `true`/`false` and dates like `2026-11-30` unquoted, keeping their
  YAML type. Unquoted text, and a level written as a number, is `INVALID_EDIT`.
- `set` and `add` also take an empty list `[]` for a custom field (FR-004,
  FR-005); filled lists are changed entry by entry.

## POST /filter (changed)

Request unchanged. Response gains:

| Field | Type | Meaning |
| --- | --- | --- |
| `editable` | bool | the cell has a valid `edit:` section |

An invalid `edit:` section fails the run with `400 INVALID_EDIT` or
`422 PROTECTED_FIELD`, shown as the cell error (no table).

## GET /filter/vocabulary (changed)

String entries of list-valued attributes are now included in that
attribute's values (for `appendEntry` / `removeEntry` suggestions).

## POST /batch

Request:

```json
{ "query": "<cell text as run>", "uids": ["TST-001", "TST-002"], "dryRun": true }
```

Response `200`:

```json
{
  "results": [
    { "uid": "TST-001", "status": "changed", "reason": null, "created": null },
    { "uid": "TST-002", "status": "skipped", "reason": "field missing: testrun", "created": null }
  ],
  "operations": ["set testrun"]
}
```

`operations` describes the edit in words for the confirmation (FR-010), e.g.
`appendEntry testruns` or `generateChildren into TST (force)`.

For `generateChildren`, `uid` is the parent, `created` the child UID.

Errors (nothing written):

| Status | Code | When |
| --- | --- | --- |
| 400 | `INVALID_EDIT` | no or invalid `edit:` section in `query`; empty `uids` |
| 422 | `PROTECTED_FIELD` | forbidden field (FR-012) |
| 409 | `MIXED_DOCUMENTS` | `generateChildren` with items from more than one document |
| 409 | `NO_CHILD_DOCUMENT` | source document has no child document |
| 409 | `CHILD_DOCUMENT_REQUIRED` | several child documents, `document` not given |
| 409 | `NOT_A_CHILD_DOCUMENT` | `document` is not a child of the source |

Unknown UIDs are `skipped` / `item not found`, not an error.

## Renderer ↔ extension messages

Payload of the results mime gains `query: string` and `editable: boolean`.

When `editable`:

- a checkbox column before UID, all ticked; a header checkbox ticks/unticks
  all;
- a button "Apply to selected" next to "Open as document".

Message posted on "Apply to selected":

```json
{ "type": "apply", "query": "<payload.query>", "uids": ["<ticked, table order>"] }
```

## User-facing flow (extension)

1. No UID ticked → information "Nothing selected." Stop.
2. Any open markdown/YAML text document with unsaved changes (not a notebook
   cell, not untitled) → error "Save or discard unsaved changes first:
   <up to three names>[, …]". Stop; no request, nothing written.
3. Dry run (progress toast after 1 s) → modal "Apply <operations> to N items?
   X will change, Y will be skipped[, Z existing items will be
   overwritten]." [Apply] / Cancel.
4. Real run (progress toast after 1 s).
5. Summary message "X changed, Y skipped, Z failed" (warning if Z > 0) with
   "Show details" → untitled markdown: one line per item with status, reason,
   created UID.
6. Tree and problems refresh.

Any `DoorstopApiError` in steps 3/4 → error message with the server's text.
