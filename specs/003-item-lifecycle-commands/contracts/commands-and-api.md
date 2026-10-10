# Contracts

## VS Code commands
| Command | Argument | Behaviour |
|---------|----------|-----------|
| `doorstop.add` | tree item / document root / none | root->that document; item->same document, level = nextLevel(item.level); none->pick document + optional level. Opens created file. |
| `doorstop.link` | tree item (parent) / `{childUid}` / none | parent from item or prompt; child from `childUid`, active editor UID, or prompt. |
| `doorstop.review` / `doorstop.clear` | tree item / root / none | item->scope item; root->scope document; none->quick pick (documents + `all`). |

## Server API
- `POST /documents/{prefix}/items` body `{level?}` -> 200 `{uid, path, level}`; unknown prefix 400.
- `POST /items/{uid}/links` body `{parentUid}` -> 200 `{child, parent}`; self/unknown 400.
- `POST /review`, `POST /clear` body ReviewClearRequest -> 204; missing target 422; unknown target/parent 400.
