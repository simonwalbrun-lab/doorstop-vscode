# Data Model: Item Lifecycle Commands

- **Item**: Doorstop item (`uid`, `level`, `reviewed`, `links[]`); created by add, mutated by review/link/clear.
- **Link**: child -> parent UID with a stamp; `suspect` when parent changed since the stamp. New link has no stamp (starts suspect). `POST /clear` (re)stamps; `parents` restricts which links.
- **ReviewClearRequest**: `{scope: "item"|"document"|"all", target?: string, parents?: string[]}`; target required unless scope is `all` (else 422).
- **Review status**: `reviewed` flag on the tree node.
