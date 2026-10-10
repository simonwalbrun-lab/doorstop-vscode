# Contract: Document Utility Endpoints

| Method + path | Body | Success | Errors |
| --- | --- | --- | --- |
| POST `/documents/{prefix}/reorder` | `{mode}` | 200 `{prefix, mode}` | 409 `NO_REORDER_INDEX` (manual, no index); 422 invalid mode; 400 `DOORSTOP_ERROR` |
| POST `/documents/{prefix}/reorder/index` | none | 200 `{prefix, indexPath}` | 400 `DOORSTOP_ERROR` |
| DELETE `/documents/{prefix}/reorder/index` | none | 204 | none |
| POST `/documents/{prefix}/import` | `{sourcePath}` | 200 `{prefix, path}` | 400 `DOORSTOP_ERROR` |
| POST `/documents/{prefix}/export` | `{format, destinationPath}` | 200 `{path}` | 400/422 |
| POST `/documents/{prefix}/publish` | `{format, destinationPath, ...}` | 200 `{path}` | 400 `DOORSTOP_ERROR` |

VS Code commands: `doorstop.reorder`, `doorstop.import`, `doorstop.export`, `doorstop.publish`.
