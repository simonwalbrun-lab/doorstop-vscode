# Data Model: Diagram Hot-Exit Backup Recovery

This fix introduces no new persisted entity and no change to the on-disk
diagram JSON schema (already documented in spec 007's Key Entities: **Diagram**,
with **Canvas Node** / **Canvas Edge** from spec 008). It adds one resolved,
never-persisted value to the diagram-open flow:

## Diagram Open Source (resolved value, not persisted)

The file `openCustomDocument` actually reads from when a diagram is opened.
Resolved once per open; never written anywhere itself.

| Field | Type | Description |
|---|---|---|
| `source` | `'backup' \| 'original'` | Which file `document.diagram` was populated from for this open |
| `uri` | `vscode.Uri` | The diagram file's own location — always the identity of the opened `CustomDocument`, regardless of `source` |
| `backupId` | `string \| undefined` | `openContext.backupId`, when VS Code supplies one (a pending hot-exit backup exists) |

**Resolution rule**:

1. If `backupId` is present, try `readDiagram(vscode.Uri.file(backupId))`.
   - Success → `source = 'backup'`, `document.diagram` = the backup's parsed
     content.
   - Failure (missing/unreadable/invalid) → fall through to step 2.
2. `readDiagram(uri)` (today's existing, unchanged behavior) →
   `source = 'original'`.

No validation rules beyond what `readDiagram` already enforces (must parse as
JSON with `nodes`/`edges` arrays — see spec 007) apply to the backup file,
since it's written by `serializeDiagram` using the identical format.

No lifecycle/state-transition model applies — this is a single resolution
made once when the custom document is opened, not a value that changes over
the document's lifetime.
