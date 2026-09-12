# Research: Document View

**Feature**: 019-document-view | **Date**: 2026-09-12

Every "NEEDS CLARIFICATION" candidate from the Technical Context was resolved
by reading the existing code (`src/`, `server/src/doorstop_server/`), the
installed Doorstop 3.2 sources (`.venv/Lib/site-packages/doorstop/`), and the
VS Code API. Findings are recorded as decisions below.

## 1. How to host the view: FileSystemProvider on a custom scheme

**Decision**: Register a `vscode.FileSystemProvider` for the scheme
`doorstop-document` (`isReadonly: false`, `isCaseSensitive: true`). A
document is addressed as `doorstop-document:/<PREFIX> (document)` — the last
path segment is what VS Code shows as the tab title, so the title reads
`SYS (document)` exactly as the spec asks. The provider keeps one in-memory
entry per open prefix (`{ text, mtime, blocks }`); `readFile` returns the
rendered text, `stat` returns its size and `mtime`, `writeFile` is the save
hook (§3), `watch` is a no-op, and `onDidChangeFile` is fired to make VS Code
re-read the document (§4).

**Rationale**: It is the only VS Code mechanism that gives a *normal,
editable* text editor tab (undo, find/replace, multi-cursor, markdown
preview, Save / Don't Save / Cancel on close) while letting the extension own
both what is read and what happens on save. It also satisfies the
constitution's "Additional Constraints" spirit — participate in standard
save/revert flows rather than a bespoke persistence mechanism.

**Alternatives considered**:
- `TextDocumentContentProvider` — read-only by design; no save hook.
- `CustomTextEditorProvider` / webview — a WYSIWYG editor is explicitly out of
  scope, and it would forfeit every standard editor feature.
- Writing a real `.md` scratch file into the workspace — pollutes the
  repository, and save could not be intercepted before the file is written.

## 2. Language mode and reuse of the existing tab

**Decision**: After `openTextDocument(uri)` the command calls
`vscode.languages.setTextDocumentLanguage(document, 'markdown')` when the
language is not already `markdown`, then `showTextDocument(document,
{ preview: false })`. An `onDidOpenTextDocument` listener does the same for
any `doorstop-document:` document (covers a tab restored after a window
reload once the extension has activated). Reopening the same prefix reuses
the existing editor because VS Code de-duplicates editors by resource URI.

**Rationale**: Contributing `filenamePatterns` for the built-in `markdown`
language would also capture real files named `* (document)`; the API call is
scoped to our documents only.

**Alternatives considered**: `contributes.languages` with `filenamePatterns`
(rejected above); appending `.md` to the URI path (title would read
`SYS (document).md`, contradicting the spec).

## 3. Save hook, refusal and cancellation

**Decision**: All save logic lives in `FileSystemProvider.writeFile(uri,
content)`:

1. Parse `content` with the pure model (contracts/document-view-format.md).
   Structural **errors** (duplicated separator, separator whose UID is not
   an item of this document per a fresh `GET /tree`, text before the first
   separator) → throw `vscode.FileSystemError.Unavailable(message)` naming
   the 1-based line. VS Code then shows "Failed to save 'SYS (document)':
   <message>", the tab stays dirty and nothing is written (FR-025). The
   quick fix "Restore block structure" is already offered on the structural
   diagnostic at that line (§9).
2. Build the change set against the fresh tree (data-model.md): updates,
   creations (placeholders), deletions (UIDs of the document missing from
   the text), header-only changes.
3. Dialogs, in this order: deletions (one modal warning listing all UIDs
   with Delete / Keep / Cancel; "Keep" re-inserts the blocks from the tree
   into the text that will be regenerated anyway, "Cancel" throws
   `FileSystemError('Save cancelled')`), then header-only changes (one modal
   per item, Apply / Keep). Modal dialogs are allowed inside `writeFile`
   because it returns a `Thenable`; VS Code only shows a progress
   notification for a long-running save.
4. Writes, in document order: `PATCH /items/{uid}` for updates,
   `POST /documents/{prefix}/items` with `after`/`header`/`text` for
   placeholders, `DELETE /items/{uid}` for confirmed deletions. Each request
   is awaited individually; a failure is recorded and the loop continues
   (spec FR-021a).
5. If every write succeeded: regenerate (§4) and resolve. If some failed:
   regenerate from the tree but splice the failed blocks' edited text back
   in, show one error message naming the failed items, and **throw** so the
   tab stays dirty — VS Code keeps the user's buffer, which now equals the
   spliced text after the subsequent reload.

**Rationale**: Throwing from `writeFile` is the only way to keep a document
dirty after a save attempt; returning normally always marks it clean. The
notification wording ("Failed to save … : SYS-0007 would be deleted …") is
VS Code's, with our message embedded, which is acceptable and consistent.

**Auto-save**: `writeFile` cannot see the save reason, but
`workspace.onWillSaveTextDocument` can (`TextDocumentSaveReason`). The
provider records the reason per URI right before `writeFile` runs. For
`AfterDelay` / `FocusOut` saves the change set is applied only when it
contains nothing that needs a dialog (plain text or header+text updates);
otherwise the save is refused once with the message "changes need
confirmation — save manually (Ctrl+S)" and the message is not repeated
until the document changes again. Recorded in the spec's Assumptions during
tasks if the user confirms; the spec itself describes manual saves.

**Alternatives considered**: `onWillSaveTextDocument` alone — cannot cancel a
save or replace the write. A custom "Doorstop: Save Document View" command —
breaks the "works like any markdown file" promise (Ctrl+S must work).

## 4. Regenerating after save and reacting to disk changes

**Decision**:
- After a successful save, `writeFile` first stores the user's content with
  `mtime = t1` (so VS Code's post-save `stat` agrees with what it wrote),
  then regenerates from `GET /tree`, stores the new text with `mtime = t2 >
  t1`, and fires `onDidChangeFile([{ type: Changed, uri }])`. VS Code reloads
  non-dirty text models whose `mtime`/etag changed, applying the new content
  as a diff so cursor and scroll position are kept.
- A `FileSystemWatcher` on `<document folder>/**/*.{yml,md}` (folder =
  `dirname(markerPath)` from `/tree`) triggers the same regeneration when
  the view is **clean**. Our own server writes also trip the watcher; the
  provider ignores events while a save is in flight and, afterwards,
  regeneration is idempotent (same text → no change event).
- When the view is **dirty**, the watcher instead shows the notification
  "`<UID>` changed on disk" (UIDs = basenames of the changed files; when more
  than three, "`<PREFIX>` changed on disk") with **Reload** / **Keep my
  edits**. Reload = regenerate, bump `mtime`, then run
  `workbench.action.files.revert` on that editor (VS Code does not auto-reload
  dirty models). Keep = remember the new tree snapshot only; the view's
  `mtime` is **not** bumped, because a bumped `mtime` would make VS Code's
  own save-time conflict check ("The content of the file is newer") fire on
  the next save. The diff at save time always uses a fresh `/tree`, so items
  the user did not touch are never overwritten with stale content (FR-042,
  US6 scenario 3).
- Commands run from the view's CodeLens (Review, Derive, …) change files
  through the server → the watcher path above refreshes the view; no
  separate hook is needed.

**Rationale**: One refresh mechanism for every source of change (own save,
other editor tab, Doorstop command, git checkout), and VS Code's built-in
conflict detection is kept honest instead of being fought.

**Alternatives considered**: Re-reading on `onDidChangeActiveTextEditor` only
(misses changes while the view is focused); polling `/tree` (wasteful);
replacing text with a `WorkspaceEdit` after save (would re-dirty the document
and pollute undo).

## 5. Read-only separator lines

**Decision**: An `onDidChangeTextDocument` listener for the scheme inspects
each content change. If a change's range starts **and** ends on the same
line and that line was a separator (document marker, item separator or
placeholder marker) in the last accepted text, the listener restores the
line to its known text with a single `WorkspaceEdit` and shows the hint
"This line is managed by Doorstop - use the actions above it" as a status-bar
message (5 s) plus a `Warning` structural diagnostic until the next scan
confirms the line is intact. Changes that span several lines (a block
deleted or merged, a separator cut and pasted) are **not** reverted: they
are legitimate structural edits handled by the structural diagnostics (§9)
and the save-time deletion dialog. The restore edit touches only that line,
so other unsaved edits are untouched (FR-013). Re-entrancy is guarded with a
"restoring" flag so the revert's own change event is ignored.

**Rationale**: Reverting only single-line edits is what makes the rule
predictable: typing on a separator is always undone; deleting a whole block
is a deliberate act that gets a confirmation dialog instead. VS Code has no
API for read-only ranges inside an editable document.

**Alternatives considered**: `editor.readOnly` (whole document);
`TextEditorDecorationType` alone (visual only); reverting every change that
intersects a separator (would fight the user during block deletion and make
"merge two blocks" impossible to express).

## 6. Server API additions (and why the client does not write files)

**Decision**: Four thin server changes, each a direct Doorstop call:

| Change | Doorstop call | Notes |
| --- | --- | --- |
| `PATCH /items/{uid}` `{ header?, text? }` → `ItemResponse` | `item = tree.find_item(uid)`; `item.auto = False`; set `item.header` / `item.text`; `item.save()` | One file write per request; YAML and markdown item formats handled by Doorstop's own `save()`. Absent fields untouched. |
| `DELETE /items/{uid}` → 204 | `item.document.remove_item(item.uid)` | Doorstop's default `reorder=True` — the same renumbering `doorstop remove` performs. |
| `POST /documents/{prefix}/items` gains `after?`, `header?`, `text?` | level from `after` (see §7), `document.add_item(level=…)` (Doorstop reorders with `keep=item`), then header/text set as above | `after` and `level` are mutually exclusive → 422 `INVALID_REQUEST`; unknown `after` → 400 via `DoorstopError`. |
| `GET /tree` item order | `for item in sorted(document)` | `Item.__lt__` orders by level, then UID. Today's order is file-load order. Inactive items keep being included (`document.items` would drop them). |

`DoorstopServer.request` gains `'PATCH'` in its method union.

**Rationale**: Constitution I/II. Writing `header:`/`text:` from the
extension would mean re-implementing Doorstop's YAML and markdown item
serialisation; Doorstop's `Item.save()` already rewrites the file in its
canonical form (the same thing every review/clear/link command already
does). Deletion and level placement likewise belong to Doorstop.

**Consequences to note**:
- Doorstop's `save()` rewrites the whole item file in canonical form. For
  files Doorstop itself created (every fixture file, every file the
  extension's commands touched) that is byte-identical outside header/text;
  a hand-formatted file is normalised on its first write. Unchanged items are
  never written, so SC-002 holds exactly.
- Changing `text` makes the item's `reviewed` stamp stale → Doorstop reports
  "unreviewed changes" after the save, and the view's action line shows "Do
  Review". Expected, not a bug.
- `Text` (Doorstop 3.2) strips leading/trailing blank lines and trailing
  whitespace per line and never re-wraps, so "markdown preserved as written"
  holds modulo that normalisation (§11).

**Alternatives considered**: Client-side YAML editing (rejected by
constitution I/II); a single "bulk save" endpoint (atomic on paper, but
Doorstop writes files one by one anyway, and per-item requests give the
per-item failure report spec FR-021a requires).

## 7. Level of a new item created "after" a block

**Decision**: The server computes the level from the `after` item exactly
as `Document.add_item` does for "append after the last item":

- `after` is a heading level (`x.0`): `level = after.level >> 1` with
  `heading = False` → `1.0` → `1.1` (first child, i.e. the next line in
  reading order);
- otherwise `level = after.level + 1` → `1.2` → `1.3` (next sibling).

Then `Document.add_item(level=level)` runs Doorstop's automatic reorder with
`keep=item`, which shifts the existing `1.3` and its followers (`1.3 → 1.4`,
…) and also compresses any gaps the document already had. A placeholder with
no block above (empty document, or right after the document marker) sends no
`after`: Doorstop appends at the document's default next level.

**Rationale**: Clarification Q2 asked for "sibling of the block above,
renumber the rest". For a heading `1.0`, `+1` would give `2.0` — after all
of the heading's children, not "below" it. Doorstop's own append rule
(`level >> 1` after a heading) is the interpretation that keeps "reading
order = level order after the save", and it is what the tree's "Add Item"
already does client-side via `nextLevel()`. **Flagged for the user in the
plan report** as a refinement of FR-031a's example.

**Alternatives considered**: `level + 1` unconditionally (wrong after
headings); `reorder=False` with a child level (clarification rejected).

## 8. Deletion and renumbering

**Decision**: `DELETE /items/{uid}` uses `Document.remove_item(uid)` with
Doorstop's default `reorder=True`: after deleting `1.3`, the former `1.4`
becomes `1.3`, etc. Level changes are the only side effect, and only levels
are touched (Doorstop rewrites each affected file). Items in other documents
that linked to the deleted item are left to Doorstop's existing validation
(dangling link → suspect/unknown, already shown by the Problems panel).

**Rationale**: Same behaviour as the `doorstop remove` CLI (constitution II);
symmetric with insertion (§7). Spec FR-044 constrains *moving* blocks, not
deleting them.

## 9. Diagnostics, quick fixes and the validation projection

**Decision**: Two separate sources on the view URI, one `DiagnosticCollection`
(`doorstop-document`):

- **Structural** (`source: 'doorstop-document'`, codes
  `missing-header`, `separator-changed`, `separator-duplicated`,
  `text-before-first-separator`, `placeholder-empty-heading`,
  `separator-lookalike`): computed by the pure model on every text change,
  debounced 300 ms (same constant as `problemsProvider.ts`). Severity
  `Warning`, except `separator-duplicated`, `text-before-first-separator`
  and `separator-lookalike` which are `Error` because they refuse the save.
- **Doorstop validation** (`source: 'doorstop'`, `code = issue.check`, same
  severity mapping as `problemsProvider.ts`): `ProblemsProvider` gains an
  `onDidRefresh` event carrying its last `(validation, tree)` pair; the
  language layer maps every issue whose UID belongs to the open document to
  that block's separator line. The projection is re-applied when the view's
  text changes (separator lines move) and when problems refresh.
- **Code actions** (`CodeActionProvider` for the scheme): "Restore block
  structure of `<UID>`" on structural diagnostics (re-inserts the separator
  and/or header line from the last tree snapshot — for a placeholder it
  restores the empty heading line or removes the placeholder), and — on
  `doorstop` diagnostics anchored to a separator — "Do Review"
  (`doorstop.doReview`), "Clear Suspect Link" (`doorstop.clearAllSuspicions`
  when one suspect link, same command for many) and "Clear All Suspect Links"
  (when ≥ 2), passing the existing `ReviewLensContext` / `ClearAllLensContext`
  argument shapes with `documentUri` = the view's URI. Those commands already
  call `ensureSavedOrConfirm(documentUri)`, so a dirty view prompts to save
  first — correct, since the server rewrites the file.

**Rationale**: Mirrors the split the codebase already has (`problemsProvider`
publishes, `reviewCodeActionProvider` offers fixes over what is published)
without letting the view's provider become "a second opinion" on review
state. Keeping the projection in a separate collection means
`problemsProvider`'s `collection.clear()` per pass cannot wipe it.

**Alternatives considered**: Reusing `reviewCodeActionProvider` directly —
its `scanRequirementDocument` expects a `reviewed:`/`links:` YAML layout and
a UID-named file, neither of which the view has.

## 10. Existing providers on the new scheme

**Decision**:
- `hoverProvider.ts`: selector becomes `[{ scheme: 'file' },
  { scheme: 'doorstop-document' }]`.
- `definitionProvider.ts`, `callHierarchyProvider.ts`,
  `reviewCodeActionProvider.ts`, `deriveProvider.ts` (CodeLens): selectors
  are language-based (`yaml` / `markdown`) and therefore already match the
  view. `resolveDefinitionAt` and `resolveRootItem` work on the UID under
  the cursor. The derive CodeLens provider returns nothing for the view
  (no `header:`/`links:` lines), which is the desired outcome — the view has
  its own action line.
- `definitionProvider.ts` reference provider: today it answers only on
  `derived:` lines; it additionally answers on a document-view separator
  whose UID is known (linkers of that UID), so "Find References" on a
  separator works (FR-037).
- `getDocumentUid()` returns `undefined` for the view (no `.yml`/`.md`
  extension), so the "own item" fallbacks are simply inactive there.

## 11. Text normalisation and change detection

**Decision**: A block's text is the lines after the header line, with
trailing blank lines removed and each line right-trimmed — the same
normalisation Doorstop's `Text.load_text` applies — compared to the tree's
`text` (already normalised by Doorstop, no trailing newline). The header is
the heading text with the leading `#`s and surrounding whitespace removed;
a header equal to the UID means "empty header" (FR-016). A block is
"changed" iff normalised header or text differs from the tree. The blank
separator line between blocks is never part of the text.

**Rationale**: Prevents phantom writes (SC-002) and makes the header-only
confirmation (FR-028) trigger only when the header really differs.

## 12. Rendering rules

**Decision** (full grammar in contracts/document-view-format.md):
- Line 1: `<!-- doorstop document <PREFIX> · keep this line -->`.
- Per active item, in the server's order: blank line, separator
  `<!-- <UID> · <level> · item separator. keep this line -->`, heading
  `#{depth} <header | UID>` with `depth = levelDepth(level)` (the exported
  tree helper: number of segments once a trailing `.0` is dropped, min 1,
  capped at 6 for markdown), then the text lines when the item has text.
  A non-normative item with a header and empty text renders no text line
  (heading item); a non-normative item with text renders it like any other
  (clarification Q1, edge case "heading item with hidden text").
- Inactive items are skipped (FR-045).
- If an item's text contains a line that would parse as a separator, that
  line is rendered unchanged and flagged `separator-lookalike` on open;
  saving is refused with the line named until the item is fixed in its own
  file (spec edge case).

## 13. Decorations, CodeLens and debounce

**Decision**:
- Separator lines: decoration type `{ opacity: '0.55', fontStyle: 'italic' }`.
- Alternating tint: `{ isWholeLine: true, backgroundColor:
  new ThemeColor('doorstop.documentView.altBlockBackground') }` applied to
  every second item block (separator line through the line before the next
  separator). `contributes.colors` declares the id with defaults
  `dark #ffffff0a`, `light #0000000a`, `highContrast #ffffff1f`,
  `highContrastLight #0000001f`.
- CodeLens per block on the separator line: `<UID>` (opens the item),
  `Open item`, `Review` (`doorstop.doReview` with `{ uid, documentUri }` —
  Doorstop's idempotent `item.review()`; the entry is **labelled** `Do
  Review` while the projected diagnostics report a review problem for that
  UID, matching the mockup `doc/document-view-mockup.html` — one entry, not
  two; flagged for the user because spec FR-034 says "additionally"), `Derive`
  (`doorstop.deriveRequirement` with `{ sourceUid, sourceUri }`), `Link...`
  (`doorstop.link` with `{ childUid }` — new argument form), `<N> links` /
  `no links` (`doorstop.showCallHierarchy` with a tree-item-like argument),
  `+ New item below` (`doorstop.documentView.newItemBelow`); plus `Do Review`
  / `Clear suspect link` only when the projected `doorstop` diagnostics for
  that UID contain a review check / `suspect_link`. Placeholder blocks get
  `new item` and `Cancel`. The document marker gets `+ New item below` only
  (empty document / insert at the top).
- All of lenses, decorations and structural diagnostics are recomputed from
  one debounced (300 ms) scan of the document text; `onDidChangeCodeLenses`
  is fired after each scan.

## 14. CI and test strategy

**Decision**:
- `.github/workflows/ci.yml`: the `extension-integration-tests` job runs
  `pip install -e "./server[dev]"` instead of `pip install
  doorstop-vscode-server[dev]`, so the extension tests exercise the server
  in the same commit; a `server-tests` job (`pip install -e "./server[dev]"`,
  `pytest server/tests`) is added — the constitution already lists it, but
  the root workflow at HEAD does not have it. `server/` is a git submodule
  (its own repository `doorstop-vscode-server`, whose own workflow runs
  pytest on every push there); the root job pins the tests to the submodule
  commit the extension is built against, and both checkouts need
  `submodules: true`. Server changes are committed in the submodule and the
  pointer is bumped in this repository.
- Extension host tests against `testdata/regression` (10 REQ items, all
  `header: ''` except REQ-004, plus the markdown-format `MD` document and the
  empty `EMPTY` document): open `REQ` as a document and assert the exact
  first lines; edit REQ-002's text and REQ-004's header, save, assert only
  those two files changed and only in `text:`/`header:`; insert a placeholder
  after REQ-003, save, assert a new item at `1.3` with REQ-004 now `1.4`;
  delete REQ-010's block, save with an injected "Keep" answer → file still
  present, then with "Delete" → file gone; duplicate a separator → save
  rejected; change REQ-001 on disk while clean → view text updates. Every
  test wraps the whole fixture directory in a snapshot/restore helper
  (`withRestoredFixture`) because reorder rewrites several files and
  `isRegressionFixtureTree` requires exactly 10 REQ items afterwards.
  Dialog answers are injected through the view handle exported from
  `activate()` (`documentView.prompts`), following the existing
  `reportFailure` / `reportBrokenReference` override pattern.
- Pure model tests in the `unit` config (no workspace): render → parse
  round trip, heading depth, heading-only blocks, header == UID, lookalike
  separator, structural issue detection, change-set computation incl.
  deletions, placeholders and header-only changes.
- Server pytest: PATCH header/text on YAML and markdown items (create the
  markdown document with `itemFormat: markdown`), PATCH unknown UID → 400,
  DELETE + renumbering, POST with `after` after a normal item and after a
  heading item, `after` + `level` → 422, `/tree` order after creating items
  out of order.

**Rationale**: Constitution VI. Without the CI change the primary-path test
would fail in CI on a 404 until a server release is published.

## 15. Open points deferred to implementation (not blocking)

- Whether `workbench.action.files.revert` needs the editor to be active
  (it acts on the active editor): the Reload path shows the view first,
  then reverts. Verified pattern in the diagram editor's manual reorder code
  (`doorstopCommands.ts` saves/closes tabs by iterating `tabGroups`).
- Exact wording of the refused-save `FileSystemError` is asserted by tests;
  the message must name the 1-based line and the UID where known.
