# Data Model: 005 (retroactive)

- **DeriveCommandContext** `{ sourceUid: string; sourceUri: Uri }`: from the lens argument or a `RequirementTreeItem` (not the Doorstop root).
- **DoorstopDocumentInfo** `{ prefix, parentPrefix?, itemUids }`: from `GET /tree`.
- **DeriveTarget** `{ prefix, relationship }`; relationship is one of child, grandchild, sibling, nephew, cousin, related. Ordered by relationship then prefix. Excludes the source document and shallower documents.
- **recentlyViewedUids** `string[]`: in-memory, most recent first, unique; fed by the active editor for `.yml`/`.md`.
- **Completion item**: label `UID - title`, detail = path, insert `UID: null`, `sortText = rank(6 digits)_UID`.
