# Data Model: Diagram Core

**Diagram** (`*.doorstop.json`): `nodes[]`, `edges[]`.
- Node: `id` (item UID), `fileUri` (workspace-relative path), `title`, `x`, `y`.
- Edge: `from`, `to` (UIDs), `arrows: "to"`.

**Item metadata** (transient, from `GET /tree`, never saved): `path`, `documentPrefix`, `links[]`, `header`; plus `documents{prefix,parentPrefix}`.

Rules: paths relative; unknown-endpoint edges preserved; server edges authoritative for known nodes.
