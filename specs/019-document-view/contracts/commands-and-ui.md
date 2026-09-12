# Contract: Commands, Menus and Editor UI

**Feature**: 019-document-view | **Base**: `package.json` `contributes`, `src/documentViewProvider.ts`, `src/documentViewLanguage.ts`.

## Scheme and URI

- Scheme: `doorstop-document` (constant `DOCUMENT_VIEW_SCHEME` in `documentViewModel.ts`).
- URI: `Uri.from({ scheme, path: '/' + prefix + ' (document)' })` → tab title `SYS (document)`.
- Language: `markdown` (set via `languages.setTextDocumentLanguage`).

## Commands (`contributes.commands`)

| Id | Title | Argument | Behaviour |
| --- | --- | --- | --- |
| `doorstop.openDocumentView` | Doorstop: Open Document View | none (palette) | `choosePrefix(tree)` quick pick, then the shared open handler: loads `/tree`; unknown prefix or server down → `showErrorMessage`, no tab; opens/reveals the view (`preview: false`). |
| `doorstop.openAsDocument` | Open as document | `RequirementTreeItem` (root node) | Tree inline icon + context entry; prefix from `itemData.prefix`, then the shared open handler. Hidden from the palette. |
| `doorstop.insertItemHere` | Doorstop: Insert Item Here | none (active editor) | Active editor must be a document view, else information message. Inserts a placeholder after the block containing the cursor (after the document marker when the cursor is on it / above the first block). |
| `doorstop.documentView.newItemBelow` | + New item below | `{ uri: string, line: number }` (CodeLens) | Inserts a placeholder after the block whose separator is at `line`. Not in the palette (`menus.commandPalette` `when: false`). |
| `doorstop.documentView.cancelPlaceholder` | Cancel | `{ uri: string, line: number }` | Removes the placeholder block starting at `line`. Not in the palette. |
| `doorstop.documentView.restoreBlock` | Restore block structure | `{ uri: string, code: string, line: number, uid?: string }` | The quick-fix command behind every structural diagnostic (data-model.md, StructuralIssue table). Not in the palette. |
| `doorstop.documentView.openItem` | (lens only) | `{ uid: string, path: string }` | Opens the item file at its header line (`findHeaderLocation` resolved on click, so the lens itself needs no file read). Registered by the language layer; not contributed to the manifest. |

Existing commands reused from the view (argument shapes unchanged unless noted):

| Id | Argument from the view | Note |
| --- | --- | --- |
| `doorstop.documentView.openItem` | `{ uid, path }` | "Open item" and the UID lens (see above) |
| `doorstop.doReview` | `{ uid, documentUri: <view uri> }` (`ReviewLensContext`) | "Review" / "Do Review"; prompts to save the dirty view first (existing `ensureSavedOrConfirm`) |
| `doorstop.clearAllSuspicions` | `{ uid, documentUri }` | "Clear suspect link" lens; also the "Clear All Suspect Links" quick fix |
| `doorstop.deriveRequirement` | `{ sourceUid, sourceUri: <item file uri> }` (`DeriveCommandContext`) | "Derive" |
| `doorstop.link` | **new form** `{ childUid: string }` — asks for the parent UID, posts `/items/{childUid}/links` | "Link..." (`doorstopCommands.ts` gains this branch; tree-item and no-argument forms unchanged) |
| `doorstop.showCallHierarchy` | `{ resourceUri: <item file uri>, itemData: { uid } }` (tree-item-like) | "N links" / "no links" |

## Menus

```jsonc
"view/item/context": [
  { "command": "doorstop.openAsDocument", "when": "view == doorstop.treeView && viewItem == doorstop.root", "group": "inline@2" },
  { "command": "doorstop.openAsDocument", "when": "view == doorstop.treeView && viewItem == doorstop.root", "group": "1_requirement@0" }
],
"commandPalette": [
  { "command": "doorstop.openAsDocument", "when": "false" },
  { "command": "doorstop.documentView.newItemBelow", "when": "false" },
  { "command": "doorstop.documentView.cancelPlaceholder", "when": "false" },
  { "command": "doorstop.documentView.restoreBlock", "when": "false" },
  { "command": "doorstop.insertItemHere", "when": "resourceScheme == doorstop-document" }
]
```

Two command ids share one handler so each surface shows the spec's wording: the palette command `doorstop.openDocumentView` ("Doorstop: Open Document View", asks for the document) and the tree command `doorstop.openAsDocument` ("Open as document", icon `$(book)`, hidden from the palette, receives the root node). The menu entries above therefore reference `doorstop.openAsDocument`.

## Colour (`contributes.colors`)

```jsonc
{
  "id": "doorstop.documentView.altBlockBackground",
  "description": "Background tint of every second item block in a Doorstop document view.",
  "defaults": { "dark": "#ffffff0a", "light": "#0000000a", "highContrast": "#ffffff1f", "highContrastLight": "#0000001f" }
}
```

## CodeLens (per separator line, in this order)

| Item block | Placeholder block | Document marker |
| --- | --- | --- |
| `SYS-0006` · `Open item` · `Review`/`Do Review` · `Derive` · `Link...` · `no links`/`1 link`/`N links` · [`Clear suspect link`] · `+ New item below` | `new item` (no command) · `Cancel` | `+ New item below` |

- `Do Review` replaces the `Review` label when a projected `doorstop` diagnostic with code in `{needs_initial_review, unreviewed_changes}` exists for the UID; `Clear suspect link` appears only when a projected diagnostic with code `suspect_link` exists.
- Lenses are recomputed by the 300 ms debounced scan; `onDidChangeCodeLenses` fires after each scan and after each problems refresh.

## Decorations

| Type | Target | Style |
| --- | --- | --- |
| `separator` | every managed line (document marker, item separators, placeholder markers) | `opacity: '0.55'`, `fontStyle: 'italic'` |
| `altBlock` | every second item block, separator line through the line before the next managed line (whole line) | `isWholeLine: true`, `backgroundColor: ThemeColor('doorstop.documentView.altBlockBackground')` |

Applied to every visible editor of the view URI; refreshed by the debounced scan and on `onDidChangeVisibleTextEditors`.

## Diagnostics

- Collection name: `doorstop-document` (one collection, both sources).
- Structural: `source: 'doorstop-document'`, `code` per data-model.md, range = whole anchored line.
- Doorstop validation projection: `source: 'doorstop'`, `code: issue.check`, `message: issue.message`, severity mapped as in `problemsProvider.ts`, range = the block's separator line. One diagnostic per (issue, uid) for UIDs of the open document.
- Cleared when the view closes.

## Code actions (`CodeActionProvider`, kind `QuickFix`, selector `{ scheme: 'doorstop-document' }`)

| On diagnostic | Action title | Command |
| --- | --- | --- |
| structural (any code) | `Restore block structure of <UID>` / `Restore block structure` | `doorstop.documentView.restoreBlock` (preferred) |
| `doorstop` with code in review checks | `Do Review` | `doorstop.doReview` |
| `doorstop` with code `suspect_link` | `Clear Suspect Link` | `doorstop.clearAllSuspicions` |
| `doorstop` with ≥ 2 `suspect_link` diagnostics on the same separator | `Clear All Suspect Links` | `doorstop.clearAllSuspicions` |

## Notifications and dialogs (exact wording)

| Situation | Text | Buttons |
| --- | --- | --- |
| Separator edited | `This line is managed by Doorstop - use the actions above it` | status bar, 5 s |
| Deletion(s) on save (modal) | `SYS-0007 would be deleted - Delete / Keep / Cancel` — for several: `SYS-0007, SYS-0008 would be deleted - Delete / Keep / Cancel` | `Delete`, `Keep`, `Cancel` |
| Header-only change (modal) | `Header of SYS-0006 changed from 'A' to 'B' - Apply / Keep` | `Apply`, `Keep` |
| Refused save | `Failed to save 'SYS (document)': <reason> (line N) - use the quick fix "Restore block structure"` (VS Code prefixes the first part) | — |
| Partial failure | `Doorstop: 2 of 5 changes could not be saved: SYS-0006 (…), SYS-0009 (…). The failed blocks keep your edits.` | — |
| Disk change while dirty | `SYS-0006 changed on disk` (or `SYS changed on disk` when > 3 files) | `Reload`, `Keep my edits` |
| Auto-save needs confirmation | `Doorstop: SYS (document) has changes that need confirmation - save manually (Ctrl+S)` | — |

## Test surface exported from `activate()`

`{ treeProvider, problemsProvider, documentView }` where `documentView` exposes `prompts` (replaceable, data-model.md) and `getState(prefix)` (read-only snapshot for assertions).
