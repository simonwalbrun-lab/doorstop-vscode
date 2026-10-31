# Research: Test Report Authoring

## R1 — One-click toggle mechanism

- **Decision**: React to `onDidChangeTextEditorSelection` events of kind
  `Mouse` with a single empty selection whose cursor sits strictly inside the
  `[ ]` / `[x]` / `[X]` brackets of a task line; replace the one character
  between the brackets via `editor.edit`.
- **Rationale**: The checkbox itself becomes the click target: one click, no
  extra UI, no per-line clutter. It is one event listener, no provider. A
  normal `editor.edit` gives undo for free (FR-003) and fails on read-only
  editors without side effects (edge case).
- **Alternatives considered**:
  - CodeLens per task line: one click too, but adds a lens row above every
    step, which doubles the height of a long test procedure.
  - DocumentLink with a command URI: needs Ctrl+Click, not one click.
  - Hover with a command link: two actions.
- **Notes**: A double click produces a mouse event with an empty selection
  first, then one with a word selection; only the first toggles. Drag
  selections are non-empty and ignored. Tests drive the handler function
  directly with a synthetic event, since vscode-test cannot produce a mouse
  selection kind.

## R2 — Where task lines and drop targets are valid

- **Decision**: Add `textRange(lines, isMarkdown)` to `src/itemFile.ts`:
  - YAML item: the lines of the `text:` block scalar (`|`, `|-`, `|+`, `>`
    variants), from the line after `text:` to the line before the next
    column-0 key. Its indent is that of the first non-blank line, default 2.
  - Markdown item: the lines after the closing frontmatter fence (reuses
    `metadataRange`).
  - Document View: the body lines of an item block from `parse()` in
    `documentViewModel.ts` (after the header line; not the separator, not the
    `doorstop-fields` fence).
  Fenced code blocks inside the range are excluded by a fence scan in the
  toggle code.
- **Rationale**: `itemFile.ts` already owns "text-level facts about item
  files"; the Document View model already knows its blocks. No new parser.
- **Shortcut**: an item whose text is a single-line scalar (`text: ''`) has no
  block to insert into; a drop there falls back to default editor behavior.
  Upgrade if testers start reports from empty items.

## R3 — Paste and drop API, and the minimum VS Code version

- **Decision**: `vscode.languages.registerDocumentDropEditProvider` and
  `registerDocumentPasteEditProvider` for selectors `{ scheme: 'file',
  language: 'yaml' }`, `{ scheme: 'file', language: 'markdown' }` and
  `{ scheme: DOCUMENT_VIEW_SCHEME }`. `provide*` only checks that the
  position is inside the text range and that the data transfer holds files
  (`text/uri-list` with `file:` URIs, or `DataTransferFile` entries). It
  returns an edit titled "Insert as Doorstop attachment". The actual storing
  happens in `resolve*`, which VS Code calls only for the edit the user
  applies. This way a "Paste as…" preview never copies or uploads anything.
- **Engine**: raise `engines.vscode` and `@types/vscode` to the first release
  where the paste provider and both `resolve*` methods are stable
  (1.97.0, confirmed in T001: 1.96 has neither the paste provider nor `resolveDocumentDropEdit`).
- **Rationale**: These are the platform's own hooks for this exact job; the
  built-in markdown extension uses them for its "copy files into workspace"
  feature.
- **Notes**:
  - VS Code opens a file dragged in from the OS file manager unless the user
    holds **Shift** while dropping. That is platform behavior; the
    quickstart and README say so.
  - Built-in markdown also offers a paste/drop edit in `.md` files and in the
    Document View (language `markdown`). Ours uses kind
    `markdown.link.doorstop` and the extension contributes
    `editor.pasteAs.preferences` / `editor.dropIntoEditor.preferences`
    defaults with that kind first, scoped to `[markdown]` and `[yaml]`
    (T014: VS Code accepts them; asserted in the attachments suite). This is harmless elsewhere because our
    provider returns nothing outside item text. T001 verifies these defaults
    are accepted under `configurationDefaults`. If they aren't, the user picks
    from the paste widget once, and VS Code remembers the choice.
  - A clipboard screenshot arrives as a `DataTransferFile` without a URI;
    `file.data()` gives the bytes; name `paste-YYYYMMDD-HHMMSS.png`.

## R4 — Locating the document's `assets` folder

- **Decision**: Item file → UID from file name → `loadDoorstopIndex` →
  `getItem(uid).documentPrefix` → `getDocument(prefix).markerPath` → its
  folder + `assets`. Document View → the item block's UID under the drop
  line → same lookup. If the server is unreachable, the attach fails with a
  message (FR-019); nothing is guessed.
- **Rationale**: Principle I: the server tells us where documents are.
  `assets` is Doorstop's own `Document.ASSETS` constant, and `doorstop
  publish` copies exactly that folder, so links survive publishing (FR-012).
  Not configurable, since any other folder would be dropped by publish.
- **Link path**: relative from the item file's folder, `/` separators, each
  segment `encodeURIComponent`-encoded (spaces, non-ASCII).

## R5 — Writing files without leaving partial results

- **Decision**: Copy to `assets/.<name>.partial`, then `rename` to the final
  name. On failure or cancellation, delete the partial file. Name collision:
  if `assets/<name>` exists with identical size and bytes, reuse it.
  Otherwise try `<stem>-1<ext>`, `<stem>-2<ext>`, … (FR-013).
- **Rationale**: Rename within one folder is atomic on all platforms; a
  half-copied file never carries the final name (FR-018, FR-019, SC-004).
- **Shortcut**: the identical-content check reads both files into memory.
  Fine for evidence files kept in git; switch to a streamed hash if
  multi-hundred-MB files land in `assets`.

## R6 — Object storage (MinIO, S3-compatible)

- **Decision**: Hand-written AWS Signature V4 for one `PUT` per object, in
  `src/objectStorage.ts`, using `node:crypto` and `node:http`/`node:https`.
  Path-style URLs (`{endpoint}/{bucket}/{key}`), which MinIO uses by default.
  The payload hash header is `UNSIGNED-PAYLOAD`, so large files stream
  without being read twice. Cancellation destroys the request. The object key
  is `{prefix}{UID}/{YYYYMMDD-HHMMSS}-{filename}`. The link is the object URL
  (spec FR-015, Assumptions: bucket readable by report readers).
- **Rationale (Principle IV, no new dependency)**: one signed PUT is about
  50 lines over Node built-ins. `@aws-sdk/client-s3` adds several MB and a
  deep dependency tree to the extension bundle; the `minio` npm package pulls
  in its own dependency set too. Both would serve one HTTP call.
- **Verification**: the signing function is pure and is tested against
  AWS's published SigV4 "PUT Object" example (fixed date, keys and
  signature). The upload is tested against a local `node:http` server on
  port 0 that records the request and answers 200 or 403 (Principle VI: no
  network, no MinIO in CI).
- **Shortcut**: single PUT is limited to 5 GiB per object; upgrade to
  multipart upload if evidence files ever exceed that.
- **Credentials**: `context.secrets` keys `doorstop.objectStorage.accessKey`
  and `doorstop.objectStorage.secretKey`, set by the command
  "Doorstop: Set Object Storage Credentials" (two password input boxes)
  (FR-017).

## R7 — Progress and failure reporting

- **Decision**: Wrap the whole store/upload of one drop or paste in the
  existing `withDelayedProgress` (`src/progress.ts`) with
  `cancellable: true`. The title is "Storing attachments…" (repo) or
  "Uploading <file>…" (object storage). Per-file failures are collected and
  shown in one `showErrorMessage` that names each file and its reason. Files
  that succeeded are still linked (FR-018 – FR-020).
- **Rationale**: Reuses the helper that already implements Principle VII's
  one-second rule.
