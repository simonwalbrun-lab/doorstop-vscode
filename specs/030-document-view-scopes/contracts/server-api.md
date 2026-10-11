# Contract: Server API changes

## `GET /tree?fields=a,b`

Optional query parameter `fields` (comma-separated header field names). When
given, every `ItemNode` gains `fields: {name: string}` containing only those
requested names the item has with a scalar value (converted with `str`; lists
and mappings are omitted). Without the parameter the response is unchanged
(`fields` omitted) — existing callers are unaffected.

Protected names in `fields` are ignored by the server (never returned).

## `PATCH /items/{uid}`

`UpdateItemRequest` gains `fields: Optional[Dict[str, str]]`.

- Valid if at least one of `header`, `text`, `fields` is present (message
  becomes `header, text or fields is required`).
- Each field is applied with Doorstop's `Item.set(name, value)` inside the same
  `apply_prose` single-save.
- Protected name ⇒ `422 {"error": {"code": "PROTECTED_FIELD", "message": "<name> cannot be edited here"}}`; nothing is written.
- Item not found ⇒ unchanged `404`.

Protected set: `uid, level, active, normative, derived, reviewed, cleared,
links, header, text`.

## Tests (server/tests)

- tree with `fields=ref,status` returns present scalars only; without param no `fields` key.
- PATCH with `fields` persists via file reload; PATCH with protected name → 422 and file untouched.
- Markdown-format item file round-trips an extended attribute.
