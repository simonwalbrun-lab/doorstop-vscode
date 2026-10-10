# Data Model: Document Utilities

- **Reorder Index**: `index.yml` beside the document's config; created by `POST /documents/{prefix}/reorder/index`, removed by Doorstop on apply or by `DELETE .../reorder/index`. Zero or one per document. States: absent -> present (generated) -> absent (applied or discarded).
- **ReorderRequest** `{mode: "auto"|"manual"}`; **ReorderResponse** `{prefix, mode}`; **ReorderIndexResponse** `{prefix, indexPath}`.
- **ImportRequest** `{sourcePath}` (format from suffix: yaml/yml/csv/tsv/xlsx) -> **DocumentResponse** `{prefix, path}`.
- **ExportRequest** `{format: yaml|csv|tsv|xlsx, destinationPath}` -> **ExportResponse** `{path}` (path actually written).
- **PublishRequest** `{format: markdown|html|latex, destinationPath, template?, sharedTemplate?}` -> **PublishResponse** `{path}` (path actually written). `template`/`sharedTemplate` belong to specs 020/024.

Source: `server/src/doorstop_server/schemas.py`.
