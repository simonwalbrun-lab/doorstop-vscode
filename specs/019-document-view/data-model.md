# Data Model: Document View

**Feature**: 019-document-view | **Date**: 2026-09-12

All entities are in-memory on the extension side unless stated otherwise.
Item files on disk are owned and written exclusively by Doorstop through the
server; the extension holds only the server's `/tree` snapshot and the text
of the view.

## Entities

### DocumentViewState (one per open prefix — `documentViewProvider.ts`)

| Field | Type | Notes |
| --- | --- | --- |
| `prefix` | `string` | Document prefix, e.g. `SYS`. Key of the provider's map. |
| `uri` | `vscode.Uri` | `doorstop-document:/<PREFIX> (document)`. |
| `folder` | `string` | `dirname(DocumentNode.markerPath)` — root of the file watcher. |
| `snapshot` | `DocumentNode` (from `TreeResponse`) | The server's last view of the document: items with uid, level, header, text, normative, active. Refreshed on open, on every regeneration and at save time. |
| `text` | `string` | The rendered text VS Code last read (`readFile`). |
| `mtime` | `number` | Monotonic per view; bumped only when `text` is replaced *and* VS Code should re-read (see transitions). |
| `blocks` | `RenderedBlock[]` | Separator texts + UIDs of the last accepted render; used by the separator-revert rule and by "Restore block structure". |
| `saveReason` | `TextDocumentSaveReason \| undefined` | Recorded by `onWillSaveTextDocument` immediately before `writeFile`. |
| `saving` | `boolean` | Suppresses watcher-triggered regeneration while a save is in flight. |
| `pendingDiskChange` | `Set<string>` (UIDs) | Files changed on disk while the view was dirty and the user chose "Keep my edits"; cleared on the next regeneration. |

Lifecycle: created by `doorstop.openDocumentView`; disposed when the last
`TextDocument` for the URI closes (`onDidCloseTextDocument`).

### RenderedBlock (output of `render`)

| Field | Type | Notes |
| --- | --- | --- |
| `kind` | `'document' \| 'item'` | The document marker is block 0. |
| `uid` | `string` | Item UID (kind `item`). |
| `level` | `string` | As reported by the server, e.g. `1.1`. |
| `separator` | `string` | Exact separator line text (contract: document-view-format.md). |
| `headerLine` | `string` | `#{depth} <header or UID>` (kind `item`). |
| `textLines` | `string[]` | Item text split on `\n`; empty for heading items and items without text. |
| `startLine` / `endLine` | `number` | 0-based line span in the rendered text (separator through last text line). |

### ParsedBlock (output of `parse`, i.e. what the user's text says)

| Field | Type | Notes |
| --- | --- | --- |
| `kind` | `'document' \| 'item' \| 'placeholder' \| 'orphan'` | `orphan` = text before the first separator (error). |
| `uid` | `string \| undefined` | From the separator; `undefined` for placeholder/orphan. |
| `separatorLine` | `number` | 0-based line of the separator (or first line for `orphan`). |
| `separatorText` | `string` | Verbatim, for the changed-separator check. |
| `headerText` | `string \| undefined` | Heading text with `#`s stripped; `undefined` when the line after the separator is not a heading. |
| `headerLineIsHeading` | `boolean` | Whether the line after the separator matches `/^#{1,6}\s+/`. |
| `text` | `string` | Normalised body: lines after the header line, right-trimmed, trailing blank lines removed. |
| `endLine` | `number` | Last line of the block. |

### StructuralIssue (output of `checkStructure`)

| `code` | Severity | Anchored at | Meaning / quick fix |
| --- | --- | --- | --- |
| `text-before-first-separator` | Error | first orphan line | Text precedes the first item separator (typically the first block's separator or the document marker was deleted). Fix: re-insert the document marker at line 1 if missing, then insert the separator of the first snapshot item that has no separator in the text directly above the orphan text (so the orphan text becomes that item's block again); if every item still has its separator, the orphan text is left for the user and the message names the line. Save refused. |
| `separator-duplicated` | Error | second occurrence | Same UID separator twice. Fix: remove the duplicate separator line (its following text becomes part of the previous block). Save refused. |
| `separator-unknown` | Error | that line | UID not in this document (computed at save time only, needs the tree). Save refused. |
| `separator-lookalike` | Error | that line | A text line inside an item on disk parses as a separator. Save refused; fix in the item file. |
| `separator-changed` | Warning | that line | Separator text differs from the rendered one but still names the UID. Fix: restore the separator text. |
| `missing-header` | Warning | line after separator | Line after a separator is empty or not a heading. Fix: re-insert `#{depth} <header or UID>` from the snapshot. |
| `placeholder-empty-heading` | Warning | placeholder heading line | Placeholder with an empty heading line. Fix: remove the placeholder block (equivalent to Cancel). |

Structural diagnostics use `source: 'doorstop-document'` and `code` as above.

### ChangeSet (output of `planSave(parsed, snapshot)`)

| Field | Type | Notes |
| --- | --- | --- |
| `errors` | `StructuralIssue[]` | Any entry with severity Error refuses the save. |
| `updates` | `{ uid, header?: string, text?: string, headerOnly: boolean }[]` | Blocks whose normalised header or text differs from the snapshot. `header` is `''` when the heading equals the UID. `headerOnly` = header differs, text identical → triggers the Apply / Keep dialog. |
| `creations` | `{ afterUid?: string, header: string, text: string, line: number }[]` | Placeholders with non-empty header or text, in document order. `afterUid` = UID of the nearest preceding item block; `undefined` when none (first item). |
| `deletions` | `string[]` | Active UIDs of the snapshot with no separator in the text. |
| `unchanged` | `string[]` | Informational (tests). |

Validation rules:
- A UID may appear at most once (else `separator-duplicated`).
- Every separator UID must be an active item of the snapshot (else `separator-unknown`).
- The first non-empty line must be the document marker; anything before the first item separator that is not the document marker is `orphan`.
- Placeholders with empty header **and** empty text are dropped silently (FR-032).

### SaveOutcome

| Field | Type | Notes |
| --- | --- | --- |
| `written` | `string[]` | UIDs updated/created/deleted successfully (created UIDs as returned by the server). |
| `failed` | `{ uid?: string, line: number, message: string }[]` | Per-item failures; non-empty → one summary error message and `writeFile` throws. |

### Prompts (injectable, `documentViewProvider.ts`)

| Function | Default | Returns |
| --- | --- | --- |
| `confirmDeletions(uids)` | modal `showWarningMessage` | `'delete' \| 'keep' \| 'cancel'` |
| `confirmHeaderChange(uid, oldHeader, newHeader)` | modal `showWarningMessage` | `'apply' \| 'keep'` |
| `notifyDiskChange(label)` | `showWarningMessage` | `'reload' \| 'keep'` |
| `reportError(message)` | `showErrorMessage` | void |
| `reportHint(message)` | `setStatusBarMessage(…, 5000)` | void |

Exposed on the handle returned from `activate()` so extension-host tests can
replace them (the same override pattern as `reportFailure` in
`problemsProvider.ts`).

## Server-side shapes (see contracts/server-api.md)

| Schema | Fields |
| --- | --- |
| `AddItemRequest` | `level?: str`, **`after?: str`**, **`header?: str`**, **`text?: str`** (`after` xor `level`) |
| `UpdateItemRequest` (new) | `header?: str`, `text?: str` — at least one required |
| `ItemResponse` | unchanged: `uid`, `path`, `level` |
| `TreeResponse` | unchanged shape; `items` now in Doorstop sort order |

## State transitions

```text
                 openDocumentView
   (none) ─────────────────────────▶ CLEAN(text=T0, mtime=m0)
                                       │
          user edits (VS Code dirty)   │◀──────────────────────────┐
                                       ▼                           │
                                     DIRTY                          │ regenerate: text=T', mtime++ ,
                                       │                           │ fire Changed → VS Code reloads
       ┌── Ctrl+S → writeFile(content) ┤                           │
       │                               │  disk change (watcher)    │
       │   errors ──▶ throw ───────────┤  ──▶ notifyDiskChange     │
       │   cancel ──▶ throw ───────────┤       reload → revert ────┘
       │   all writes ok ──────────────┴──▶ regenerate ──▶ CLEAN
       │   some writes failed ──▶ regenerate + splice failed blocks, throw ──▶ DIRTY
       │
       └── watcher while CLEAN ──▶ regenerate ──▶ CLEAN
```

Invariants:
1. `mtime` is bumped only when VS Code must re-read; never while the model is
   dirty and the user chose "Keep my edits" (otherwise VS Code's own
   conflict check blocks the next save).
2. The separator-revert rule only fires for single-line changes on a
   separator line of the last accepted `blocks` (research §5).
3. Nothing is deleted unless `confirmDeletions` returned `'delete'`.
4. No item file is written unless its block differs from the fresh snapshot
   taken at the start of `writeFile`.

## Text normalisation (shared by render, parse and diff)

- Lines split on `\r?\n`; the view is written with `\n`.
- Header: `line.replace(/^#{1,6}\s+/, '').trim()`; equal to the UID → `''`.
- Text: right-trim each line; drop trailing blank lines; drop leading blank
  lines (Doorstop's `Text.load_text`).
- Snapshot `text` from the server is already normalised (no trailing newline).
