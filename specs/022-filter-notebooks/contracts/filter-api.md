# Contract: `POST /filter`

Evaluates one filter cell against the current Doorstop tree. Read-only; it goes
through the existing request-serialization middleware like every other route.

## Request

```json
{ "query": "and:\n  - document == \"REQ\"\n  - reviewed == false\n" }
```

| Field | Type | Rules |
|-------|------|-------|
| `query` | string | The cell text, unchanged. Must not be blank. Syntax per [filter-syntax.md](filter-syntax.md). |

## Response 200

```json
{
  "columns": ["document", "level", "header"],
  "items": [
    {
      "uid": "REQ-001",
      "documentPrefix": "REQ",
      "level": "1.1",
      "header": "Login",
      "text": "The system shall …",
      "path": "C:/proj/reqs/REQ/REQ-001.yml",
      "values": ["REQ", "1.1", "Login"]
    }
  ]
}
```

| Field | Type | Notes |
|-------|------|-------|
| `uid` | string | |
| `documentPrefix` | string | |
| `level` | string | Doorstop's string form |
| `header` | string \| null | |
| `text` | string \| null | |
| `path` | string | Absolute path of the item file; opened when the UID is clicked |
| `values` | string[] | One display value per `columns` entry: missing → `""`, lists comma-separated, cut to 80 characters; in default mode an empty `header` falls back to the text start |

`columns` (string[]) is the cell's `order:` without `uid`, or
`["document", "level", "header"]` when the cell has no `order:`.

Order: documents in tree order, then items in Doorstop order (level, then
UID), the same order `GET /tree` uses. Inactive items are included. An empty
`items` list is a valid result.

## Errors

All errors use the existing envelope `{"error": {"code": …, "message": …}}`.

| Status | Code | When | Message contains |
|--------|------|------|------------------|
| 400 | `INVALID_FILTER` | Blank query, YAML syntax error, wrong structure (unknown key, several keys, empty group, `order:` not a list of names), or a rejected expression | The problem; the line number for YAML errors; the offending expression text for expression errors |
| 400 | `DOORSTOP_ERROR` | Doorstop fails to load the tree | Doorstop's message (existing handler) |
| 500 | `INTERNAL_ERROR` | Unexpected | Existing handler |
