# Contract: Skip API

## `GET /tree` (extended)

Response adds `skippedDocuments: [{ "prefix": "REQ", "markerPath": "<abs>/reqs/REQ/.doorstop.yml" }]` (empty list when none). `documents` never contains a skipped document.

## `POST /documents/skip`

Request: `{ "markerPath": "<abs path of .doorstop.yml>", "skip": true | false }`

- `skip: true` ensures `<folder>/.doorstop.skip` exists; `skip: false` ensures it does not.
- `skip: true` also disables every descendant document (children, grandchildren, ...); already-disabled descendants are left as they are. `skip: false` changes only the given document.
- 200: `{ "markerPath": "...", "skipped": true | false, "affected": ["<markerPath of every document whose marker was created or removed>"] }`.
- 409 `PARENT_DISABLED` when enabling a document whose parent is disabled (nothing changes).
- 404 typed error when the folder is not a Doorstop document inside the project.
- OS failures (permissions) return the server's structured error response.

## Tree view UI contract

- Inline action `doorstop.skipDocument` on `viewItem == doorstop.root`; `doorstop.enableDocument` on `viewItem == doorstop.root.skipped`; both only when `view == doorstop.treeView`; neither in the command palette.
