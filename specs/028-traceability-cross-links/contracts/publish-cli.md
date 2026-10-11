# Contract: Publish options

## Python API (server-internal)

```python
from doorstop_server.publish import publish_options

with publish_options(matrix="complete", child_links=True):
    publisher.publish(tree_or_document, path, ext=..., template=...)
```

- Item child links always use the tree-wide lookup (FR-005).
- `matrix="complete"`: the matrix includes cross-document rows (FR-001..FR-004,
  FR-007).
- `matrix="doorstop"`: the matrix is Doorstop's own (FR-011).
- `child_links=False`: Doorstop's `--no-child-links` behaviour (FR-012).
- On exit, normal or by exception, all originals are restored (FR-010).
- It is not re-entrant and not thread-safe. The server's request lock
  guarantees one publish at a time.

## HTTP

`POST /documents/{prefix}/publish` and `POST /publish` accept two new
optional body fields:

```json
{ "traceability": "complete", "childLinks": true }
```

- The defaults are as shown. An invalid `traceability` value gets a 422.
- The response shape and error behaviour are unchanged.
- A single-document publish writes no matrix, so it ignores `traceability`.

## Extension → server

Every Publish request (single document, one file each, combined run, PDF)
sends:

- `traceability` = `doorstop.publish.traceability`
- `childLinks` = `!doorstop.publish.noChildLinks`

## Command line (CI)

```text
python -m doorstop_server.publish [--traceability {complete,doorstop}] <same arguments as `doorstop publish`>
```

Examples:

```text
python -m doorstop_server.publish all out --html
python -m doorstop_server.publish --traceability doorstop all out --html --no-child-links
```

- `--traceability` defaults to `complete`.
- All other arguments, including `--no-child-links` and `--template`, go to
  Doorstop's own CLI unchanged.
- Exit code, logging and the files written are Doorstop's own.
- Requires the `doorstop-vscode-server` package. Run it from the project
  folder, the same as `doorstop publish`.
