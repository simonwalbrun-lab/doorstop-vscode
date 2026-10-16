# Data Model: Toggle Document Skip

- **Document (disabled)**: a folder with `.doorstop.yml` and `.doorstop.skip`. State = presence of the skip marker; nothing else is persisted.
- **SkippedDocument** (API): `prefix: str`, `markerPath: str` (path of the document's `.doorstop.yml`).
- **State transitions**: enabled --skip--> disabled (marker created); disabled --enable--> enabled (marker removed). Both are idempotent.
- **Tree view nodes**: enabled document = `doorstop.root` (expandable); disabled document = `doorstop.root.skipped` (greyed, no children, description shows "disabled").
