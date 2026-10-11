# Data Model: Traceability Cross-Document Links

No new persisted project data. Item files are only read.

## Settings (VS Code, `contributes.configuration` → "Publish")

| Key | Type | Default | Effect |
| --- | ---- | ------- | ------ |
| `doorstop.publish.traceability` | enum `"complete"` \| `"doorstop"` | `"complete"` | Matrix and CSV only (FR-011) |
| `doorstop.publish.noChildLinks` | boolean | `false` | Checked: item pages have no child links, and the label reads "Links:" (FR-012) |

## PublishRequest (server schema, both publish endpoints)

Existing fields: `format`, `destinationPath`, `template`, `sharedTemplate`.

New fields:

- `traceability: "complete" | "doorstop"`, default `"complete"`. Any other
  value gets a 422.
- `childLinks: bool`, default `true`. The extension sends
  `!doorstop.publish.noChildLinks`.

## Declared link

- Source: the `links` list in an item's YAML (`Item.links`).
- Resolves to an `Item`, or to an `UnknownItem` when the UID is missing.

## Reverse-link index (per publish, in memory)

- `dict[str, list[Item | UnknownItem]]`: UID → items in any document whose
  `links` contain that UID.
- Inactive linking items are stored as `UnknownItem(uid)`.
- Lifetime: built on the first child lookup inside `publish_options()` and
  discarded on exit.

## Traceability row

- A tuple with one slot per document in `tree.documents` order. Each slot
  holds `Item` or `None`.
- Invariants in "complete" mode:
  - at most one item per column;
  - no duplicate rows;
  - Doorstop's `by_uid` sort order;
  - normative items only.
- "doorstop" mode: whatever Doorstop's own `get_traceability` returns.
