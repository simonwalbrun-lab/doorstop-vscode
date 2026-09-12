# Contract: Server API changes

**Feature**: 019-document-view | **Base**: `server/src/doorstop_server/` (FastAPI). All routes stay behind `SerializeRequestsMiddleware`; errors use the existing `{"error": {"code", "message"}}` envelope (`DoorstopError` → 400 `DOORSTOP_ERROR`, `DoorstopApiError` as coded, anything else → 500 `INTERNAL_ERROR`).

## PATCH /items/{uid} — update header and/or text (new)

Request body (`UpdateItemRequest`):

```json
{ "header": "Sensor input", "text": "The system shall …\nSecond paragraph." }
```

- Both fields optional; **at least one required** → otherwise 422 `INVALID_REQUEST` ("header or text is required").
- `header: ""` clears the header; `text: ""` clears the text.
- Strings are passed to Doorstop's `Item.header` / `Item.text` setters unchanged (Doorstop's `Text` normalises trailing whitespace and blank lines).
- Implementation: `item = tree.find_item(uid)`; `item.auto = False`; assign the given fields; `item.save()` — one file write regardless of how many fields.

Response 200 (`ItemResponse`): `{ "uid": "SYS-0006", "path": "/abs/path/SYS-0006.yml", "level": "1.1" }`

Errors: unknown UID → 400 `DOORSTOP_ERROR` (Doorstop's "no item with UID" message).

Side effects (Doorstop's own): the file is rewritten in Doorstop's canonical form for its item format (YAML or markdown); a changed `text` makes the item's `reviewed` stamp stale, so `/validate` then reports `unreviewed_changes`.

## DELETE /items/{uid} — delete an item (new)

- Implementation: `item = tree.find_item(uid)`; `item.document.remove_item(item.uid)` (Doorstop default `reorder=True`: remaining items are renumbered exactly as `doorstop remove` does).
- Response: 204, no body.
- Errors: unknown UID → 400 `DOORSTOP_ERROR`.

## POST /documents/{prefix}/items — extended

Request body (`AddItemRequest`):

```json
{ "after": "SYS-0002", "header": "New requirement", "text": "The system shall …" }
```

| Field | Type | Rule |
| --- | --- | --- |
| `level` | `str?` | existing behaviour (explicit level, Doorstop reorders with `keep=item`) |
| `after` | `str?` | UID of an item **of this document**; the new level is `after.level >> 1` with `heading=False` when `after.level.heading` (e.g. `1.0` → `1.1`), else `after.level + 1` (e.g. `1.2` → `1.3`); then `document.add_item(level=…)` renumbers duplicates/gaps with `keep=item` |
| `header` | `str?` | set on the new item before the response |
| `text` | `str?` | set on the new item before the response |

- `after` **and** `level` together → 422 `INVALID_REQUEST` ("after and level are mutually exclusive").
- `after` naming an item of another document → 400 `DOORSTOP_ERROR` ("… is not an item of document …").
- Unknown `after` → 400 `DOORSTOP_ERROR`.
- Neither `after` nor `level` → existing behaviour (append at Doorstop's default next level).
- header/text are set with `item.auto = False` … `item.save()` after `add_item` returns, so the file is written at most twice (create + attributes) — acceptable; a single write is a nice-to-have.

Response 200 (`ItemResponse`) — `level` is the level **after** reordering.

## GET /tree — item order (changed)

`DocumentNode.items` is now produced by `for item in sorted(document)` — Doorstop's `Item.__lt__` (level, then UID). Inactive items stay included (unlike `document.items`, which filters them). No field changes. Consumers that sort themselves (the explorer tree) are unaffected.

## Extension client

`DoorstopServer.request(method, …)` accepts `'PATCH'` in addition to `'GET' | 'POST' | 'DELETE'`.

## Tests (server/tests)

| File | Cases |
| --- | --- |
| `test_items.py` | PATCH header only / text only / both on a YAML item and on a markdown-format item (document created with `itemFormat: "markdown"`), file re-read through `/tree` shows the new values and other attributes unchanged; PATCH with empty body → 422; PATCH unknown UID → 400; DELETE removes the file and renumbers followers; DELETE unknown → 400 |
| `test_documents.py` | POST with `after` on a normal item → sibling level and followers shifted; POST with `after` on a heading item (`level: 1.0`, `normative: false` set via Doorstop API) → `1.1`; POST with `after` from another document → 400; `after` + `level` → 422; header/text on create land in the file |
| `test_tree.py` | items created out of level order are returned sorted by level |
