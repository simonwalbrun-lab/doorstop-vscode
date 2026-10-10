# Data Model: Hover Previews & Navigation (retroactive)

No persisted data. Read-only view over `DoorstopIndex`:

- **Item** (from `/tree`): `uid`, `header`, `level`, `text`, `ref`, `links[{uid}]`, file path.
- **Upstream Link**: `item.links` (this item -> parent).
- **Downstream Link**: `index.getLinkers(uid)` (items whose `links` contain uid).

Rendering rules: preview shows header/level only if non-empty; upstream links only when the hover is outside a `links:` block; reverse hover resolves the current doc UID via `getDocumentUid`.
