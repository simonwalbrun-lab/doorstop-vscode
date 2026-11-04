---

description: "Task list for 035 Test Report Authoring"
---

# Tasks: Test Report Authoring

**Input**: Design documents from `specs/035-test-report-authoring/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/user-interface.md](contracts/user-interface.md)

**Tests**: Required. Constitution VI/VIII: every FR has a vscode-test case
with a `// Spec 035 FR-…` trace comment directly above the test.

**Organization**: by user story; each story phase is shippable alone.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different files, no dependency on an unfinished task
- **[Story]**: US1 toggle, US2 attach into repo, US3 object storage

---

## Phase 1: Setup

- [X] T001 Confirm the earliest VS Code release where `languages.registerDocumentPasteEditProvider`, `DocumentPasteEditProvider.resolveDocumentPasteEdit` and `DocumentDropEditProvider.resolveDocumentDropEdit` are all stable (check `@types/vscode` tags / release notes; expected 1.97). Set `engines.vscode` and devDependency `@types/vscode` in package.json to `^<that version>.0`, run `npm install`, and run `npm run check-types`. If `resolveDocumentDropEdit` is not stable at a release ≥ the paste one, do the drop storing in `provideDocumentDropEdits` instead and note it in specs/035-test-report-authoring/research.md R3
- [X] T002 [P] Add two labels to .vscode-test.mjs, both without `workspaceFolder`, each with a one-line comment like the existing ones: `taskToggle` → `out/test/taskToggle.test.js`, `attachments` → `out/test/attachments.test.js` ("Spec 035: … temp fixture, no workspace, no server")

---

## Phase 2: Foundational (shared by US1 and US2)

- [X] T003 Add `textRange(lines: string[], isMarkdown: boolean): { start: number; end: number; indent: string } | undefined` to src/itemFile.ts (research R2). YAML: the `text:` key line must end in a block indicator (`|`, `|-`, `|+`, `>`, `>-`, `>+`). The range runs from the next line to the line before the next line that starts at column 0 with a non-space, non-`#` character, or to EOF. `indent` is the leading whitespace of the first non-blank line in the range, defaulting to two spaces. Any other `text:` form (e.g. `text: ''`) → undefined. Markdown: from `metadataRange(...).end + 1` to EOF, `indent` `''`; undefined when frontmatter is missing or unclosed. Keep the file's doc-comment style
- [X] T004 Add `itemBodyAt(blocks: ParsedBlock[], line: number): { uid: string } | undefined` to src/documentViewModel.ts: returns the UID of the `kind: 'item'` block whose body contains `line`. That means after `headerLine` (or after `separatorLine` when there is no header), up to the next block's `separatorLine`, and not inside the block's `fields` fence. Separator, header and placeholder lines → undefined
- [X] T005 [P] Tests in src/test/itemFile.test.ts for `textRange`: YAML `|` block with 2- and 4-space indent, `text: ''` → undefined, range stops at next column-0 key, markdown body after frontmatter, unclosed frontmatter → undefined. Trace `// Spec 035 FR-005, FR-009`
- [X] T006 [P] Tests in src/test/documentViewModel.test.ts for `itemBodyAt` on a rendered view: body line → UID; separator, header, fields-fence lines → undefined. Trace `// Spec 035 FR-004, FR-009`

**Checkpoint**: text-range helpers pass; story work can start.

---

## Phase 3: User Story 1 - Tick test steps with one click (P1) 🎯 MVP

**Goal**: one mouse click inside `[ ]`/`[x]`/`[X]` flips it in item files and the Document View.

**Independent Test**: item file with `  - [ ] step one`; click inside the brackets → `  - [x] step one`; click again → back.

### Tests for User Story 1

- [X] T007 [P] [US1] Create src/test/taskToggle.test.ts (mocha `suite`/`test` like src/test/headerFolding.test.ts; temp folder per test with an item `TR-001.yml` whose `text: |` block holds tasks). Cases, each with its trace comment:
  - `taskBoxAt` finds the box for `- [ ]`, `* [x]`, `+ [X]`, `1. [ ]`, `2) [ ]`, nested `    - [ ]`, using the regex `^(\s*)([-*+]|\d+[.)])\s+\[( |x|X)\](\s|$)`. It returns undefined for `- [y]`, `-[ ]` and a plain line. `// Spec 035 FR-001`
  - Toggling `' '`→`x` and `x`/`X`→`' '` changes exactly one character (compare full document text before and after). `// Spec 035 FR-002`
  - `handleSelectionChange` with kind `Mouse`, one empty selection at column `boxStart+1` or `boxStart+2` → toggles. At `boxStart` or `boxStart+3`, on the task text, with kind `Keyboard`/`Command`/undefined, with a non-empty selection, or with two selections → no change. `// Spec 035 FR-001`
  - After a toggle the document is dirty, not saved, and `undo` restores the original text. `// Spec 035 FR-003`
  - `toggleTargetAt(lines, line, character, 'view')` on the lines of a `render()`ed Document View returns the box range for a body task. A task-looking line in the `doorstop-fields` fence, on a separator line, or on a header line → undefined. `// Spec 035 FR-004`
  - Inside a fenced code block (```` ``` ```` and `~~~`) inside the text → no toggle. A `- [ ]` line outside the `text:` block of a YAML item → no toggle. `// Spec 035 FR-005`

### Implementation for User Story 1

- [X] T008 [US1] Create src/taskToggle.ts:
  - `taskBoxAt(lineText: string): number | undefined` returns the column of `[`, using the regex above.
  - `inFence(lines, start, line): boolean` scans from range start, flipping state on lines whose trimmed text starts with ```` ``` ```` or `~~~`.
  - `toggleTargetAt(lines, line, character, kind: 'yaml' | 'markdown' | 'view'): vscode.Range | undefined` is pure. The line must be in `textRange(...)` (yaml/markdown) or `itemBodyAt(parse(lines.join('\n')), line)` (view), and not in a fence. `taskBoxAt` must hit with `character` at `box+1` or `box+2`. It returns the one-character range at `box+1`.
  - `handleSelectionChange(event: vscode.TextEditorSelectionChangeEvent): Promise<void>` acts only when `event.kind === Mouse`, there is exactly one selection, it is empty, and the document is an item file (`uidFromItemPath(document.fileName)` with scheme `file`; kind from the extension) or a view (`isViewUri`). It gets the range from `toggleTargetAt`, then calls `editor.edit(b => b.replace(range of char box+1, next))`, where next is `' '`→`x`, else `' '`. A failed edit (read-only) is ignored silently, per the spec's read-only edge case.
  - `registerTaskToggle(context)` subscribes to `vscode.window.onDidChangeTextEditorSelection`.

  Read the editor from `event.textEditor`. Do not save
- [X] T009 [US1] Call `registerTaskToggle(context)` in `activate` in src/extension.ts next to `registerHeaderFolding`

**Checkpoint**: `npx vscode-test --label taskToggle` green; quickstart §1 passes.

---

## Phase 4: User Story 2 - Attach evidence into the repository (P1)

**Goal**: paste/drop of files (and clipboard images) into item text stores them in the document's `assets` folder and inserts links.

**Independent Test**: drop a `.png` and a `.log` into a YAML item's text → both in `<doc>/assets/`, lines `![a.png](assets/a.png)` and `[b.log](assets/b.log)` inserted, indented.

### Tests for User Story 2

- [X] T010 [P] [US2] Create src/test/attachments.test.ts. Each test gets a temp folder holding a document (`.doorstop.yml` plus `TR-001.yml` with a `text: |` block). It calls the providers' `provide*`/`resolve*` directly with a real `vscode.DataTransfer`, and injects `documentFolderFor = async uid => tempDocFolder`. Cases, each with its trace comment:
  - A drop with `text/uri-list` of a `.png` and a `.log` → both files in `assets/` (folder created). The edit text is `![a.png](assets/a.png)` then `[b.log](assets/b.log)` in transfer order, and the second line is prefixed with the block indent. `// Spec 035 FR-006, FR-008, FR-012`
  - A paste with a uri-list → same at the cursor. A paste with a `DataTransferFile` image without URI → `assets/paste-YYYYMMDD-HHMMSS.png` holding those bytes. `// Spec 035 FR-007`
  - A plain-text-only transfer → `provide*` returns undefined. A file transfer at a position on the `links:` line → undefined. `// Spec 035 FR-009`
  - A folder URI → warning `"<name>" is a folder; only files can be attached.` and nothing stored; other files in the same drop are still stored. `// Spec 035 FR-010`
  - An existing `assets/a.png` with the same bytes → reused, no `a-1.png`. With different bytes → stored as `a-1.png`, original byte-identical, and a second collision → `a-2.png`. `// Spec 035 FR-013`
  - A file name with a space and `ä` → link segment percent-encoded (`encodeURIComponent`), the file on disk keeps its real name. `// Spec 035 FR-012`
  - With `setProgressForTest` capturing calls and a slow copy (inject a delay > 1 s or stub the timer), progress is shown with title `Storing attachments…` and `cancellable: true`. Cancelling → no link text, no `.partial` file left. `// Spec 035 FR-018`
  - Make one of two sources unreadable (path deleted after the transfer was built) → the other is linked, no `.partial` remains, and one error message names the failed file. `// Spec 035 FR-019`

### Implementation for User Story 2

- [X] T011 [US2] Create src/attachments.ts, part 1 (repository storage), following data-model.md:
  - `collectSources(dataTransfer)` reads `text/uri-list` with `file:` URIs (stat; a directory is rejected) and `DataTransferFile` entries without a URI (name `paste-YYYYMMDD-HHMMSS.<ext from mime, default png>`).
  - `storeInAssets(source, assetsFolder, token)` creates the folder recursively. It resolves the name: candidate missing → write; same size and bytes → reuse; else `stem-N.ext`, N = 1, 2, …. It writes to `assets/.<candidate>.partial` and then renames. On error or cancel it unlinks the partial. Add the comment `// shortcut: identical-content check reads both files into memory, switch to a streamed hash if huge files land in assets`.
  - `linkFor(itemFolder, storedPath)` gives a relative path with `/` and `encodeURIComponent` per segment.
  - `formatLinks(stored, indent)` gives `![name](link)` for `png jpg jpeg gif svg webp bmp` (case-insensitive) and `[name](link)` otherwise, joined with `\n` + indent.
- [X] T012 [US2] In src/attachments.ts, part 2 (providers): one class implementing `DocumentDropEditProvider` and `DocumentPasteEditProvider`.
  - `provide*` only checks the position (item: `textRange`; view: `itemBodyAt(parse(...))`) and that the transfer has a file. It returns one edit with kind `DocumentDropOrPasteEditKind.Empty.append('markdown', 'link', 'doorstop')`, title `Insert as Doorstop attachment`, and empty insert text. It never writes to disk.
  - `resolve*` runs the attach inside `withDelayedProgress('Storing attachments…', …, { cancellable: true })` from src/progress.ts. It stores each source and collects failures, then sets `insertText` to `formatLinks` of the successes. When the line before the position is whitespace-only and shorter than the YAML indent, it prefixes the missing indent. It shows one `showErrorMessage('Could not attach: "<n>" (<reason>), …')` for failures.
  - `documentFolderFor(uid)` defaults to `loadDoorstopIndex(server)` → `getItem(uid).documentPrefix` → `getDocument(prefix).markerPath` dirname. On `undefined` it shows `Cannot attach files: the Doorstop server is not reachable.` and inserts nothing. The item folder for the link is `dirname(index.getPath(uid))`.
- [X] T013 [US2] Add `registerAttachments(context, { server })` in src/attachments.ts. It registers the provider with `registerDocumentDropEditProvider` and `registerDocumentPasteEditProvider` for selectors `{ scheme: 'file', language: 'yaml' }`, `{ scheme: 'file', language: 'markdown' }` and `{ scheme: DOCUMENT_VIEW_SCHEME }`. The metadata declares `providedDropEditKinds`/`providedPasteEditKinds` with the kind above, `dropMimeTypes`/`pasteMimeTypes` `['text/uri-list', 'files']`. Call it from `activate` in src/extension.ts, passing the existing `doorstopServer`
- [X] T014 [US2] Add to `contributes.configurationDefaults` in package.json: `"editor.pasteAs.preferences": ["markdown.link.doorstop"]` and `"editor.dropIntoEditor.preferences": ["markdown.link.doorstop"]`. Launch the Extension Development Host and confirm that a paste into a `.md` item file picks the Doorstop edit without a widget choice. If VS Code rejects or ignores these defaults, remove them and note in research.md R3 that the user picks once from the paste widget

**Checkpoint**: `npx vscode-test --label attachments` green for US2 cases; quickstart §2 passes.

---

## Phase 5: User Story 3 - Object storage with size threshold (P2)

**Goal**: files above `thresholdMB` go to MinIO/S3 and are linked by object URL; the rest go to `assets`.

**Independent Test**: mode `objectStorage`, threshold 1 MB, against a local fake S3 server. A 100 KB file lands in `assets/`; a 2 MB file is received by the server and linked as `{endpoint}/{bucket}/{key}`.

### Tests for User Story 3

- [X] T015 [P] [US3] Add to src/test/attachments.test.ts an `objectStorage` suite with a local `node:http` server on port 0 that records method, path, headers and body length, and answers per test. Cases, each with its trace comment:
  - `signV4` reproduces AWS's published SigV4 "PUT Object" example from the AWS docs page "Signature Calculations for the Authorization Header: Transferring Payload in a Single Chunk". Copy its access key `AKIAIOSFODNN7EXAMPLE`, secret `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`, region `us-east-1`, date `20130524T000000Z`, headers and payload hash verbatim from that page, and assert its signature `98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd`. `// Spec 035 FR-016`
  - `putObject` against the fake server answering 200: a `PUT /{bucket}/{prefix}TR-001/{timestamp}-{name}` with `x-amz-content-sha256: UNSIGNED-PAYLOAD`, `Authorization: AWS4-HMAC-SHA256 Credential=…` and full body length. The returned link equals `{endpoint}/{bucket}/{encoded key}`. `// Spec 035 FR-015, FR-016`
  - The fake server answering 403 with `<Error><Code>AccessDenied</Code></Error>` → error text contains `403 AccessDenied`. No link is inserted and nothing is in `assets/`. `// Spec 035 FR-019`
  - With mode `assets` → every file goes to `assets/` regardless of size. With mode `objectStorage`, threshold 1 MB → 100 KB to `assets/` and 2 MB to the server. Threshold 0 → 100 KB also to the server. Set settings via `vscode.workspace.getConfiguration('doorstop').update(..., Global)` and reset after. `// Spec 035 FR-011, FR-014`
  - The credentials command with a fake `SecretStorage` and stubbed `showInputBox` (returns two values, `password: true` asserted) stores both keys. Esc (undefined) on the second box → nothing stored. Settings are unchanged. `// Spec 035 FR-017`
  - A fake server that delays its response: progress title `Uploading "<name>"…` with `cancellable: true`. Cancel → the request is aborted (server sees the connection close), no link is inserted. `// Spec 035 FR-018`
  - An empty bucket setting → error `Cannot upload "<name>": set doorstop.attachments.objectStorage.bucket first.` Missing secrets → `… run "Doorstop: Set Object Storage Credentials" first.` A file below the threshold in the same drop is still stored in `assets/`. `// Spec 035 FR-020`

### Implementation for User Story 3

- [X] T016 [P] [US3] Create src/objectStorage.ts:
  - `signV4({ method, path, query, headers, payloadHash, accessKey, secretKey, region, amzDate }): string` is pure, using `node:crypto`. It builds the canonical request with sorted lowercase signed headers and the string to sign for `AWS4-HMAC-SHA256`/`s3`, and returns the `Authorization` header value.
  - `putObject({ endpoint, bucket, key, region, accessKey, secretKey, filePath | bytes, size }, token): Promise<string>` sends a path-style URL with `node:http` or `node:https` by endpoint scheme. Headers are `host`, `content-length`, `x-amz-date` and `x-amz-content-sha256: UNSIGNED-PAYLOAD`, signed. The body is a `fs.createReadStream` or the bytes. `token.onCancellationRequested` → `request.destroy()` and reject with a cancellation. On 2xx it resolves the object URL. Otherwise it rejects with `"<status> <Code from XML body>"`.
  - Add the comment `// shortcut: single PUT caps objects at 5 GiB, switch to multipart upload if evidence files get that big`
- [X] T017 [US3] Add to package.json `contributes.configuration`, scope `resource`, the exact keys, types and defaults from contracts/user-interface.md#settings:
  - `doorstop.attachments.storage` enum `["assets","objectStorage"]`, default `"assets"`
  - `doorstop.attachments.objectStorage.thresholdMB` number, `minimum: 0`, default `10`
  - `.endpoint`, `.bucket`, `.prefix` strings, default `""`
  - `.region` string, default `"us-east-1"`

  Also add the command `doorstop.setObjectStorageCredentials` with title `Doorstop: Set Object Storage Credentials`
- [X] T018 [US3] Extend src/attachments.ts:
  - Target rule from data-model.md: `assets` mode → assets. `objectStorage` mode → objectStorage when `size > thresholdMB*1024*1024`, or when `thresholdMB == 0`; else assets.
  - For objectStorage targets, check `endpoint`, `bucket` and both secrets first. A missing one fails that file with the FR-020 message.
  - The key is `{prefix}{UID}/{YYYYMMDD-HHMMSS}-{name}`. Call `putObject` inside the progress with title `Uploading "<name>"…`.
  - Register the `doorstop.setObjectStorageCredentials` command: two `showInputBox({ password: true, ignoreFocusOut: true })` prompts. Store to `context.secrets` keys `doorstop.objectStorage.accessKey`/`secretKey` only if both are given. Read secrets at upload time only

**Checkpoint**: full `attachments` suite green; quickstart §3 passes against a local MinIO.

---

## Phase 6: Polish

- [X] T019 [P] Add a "Test reports: checkboxes and attachments" section to README.md: click inside `[ ]` to toggle; paste or **Shift**+drag files from Explorer; the `assets` folder is included by `doorstop publish`; object storage settings, the credentials command, and the bucket-must-be-readable note
- [X] T020 [P] Add an entry for spec 035 to CHANGELOG.md in the style of the existing entries
- [X] T021 Verify FR trace coverage: `grep -rhoE "Spec 035 FR-[0-9]{3}(, FR-[0-9]{3})*" src/test` must mention every FR-001…FR-020 at least once; add missing tests
- [X] T022 Run `npm run compile` and `npm test`; all labels, old and new, must pass
- [ ] T023 Walk through specs/035-test-report-authoring/quickstart.md §1–§3 manually in the Extension Development Host on Windows, including a real Explorer copy/paste and a Win+Shift+S screenshot paste

---

## Dependencies & Execution Order

- T001 → everything (API types). T002 any time before the first test run.
- T003, T004 → US1 and US2. T005/T006 alongside them.
- **US1** (T007–T009) needs only Phase 2.
- **US2** (T010–T014) needs only Phase 2; independent of US1.
- **US3** (T015–T018) needs US2's src/attachments.ts (T011–T013). T016 and T017 can start any time after T001.
- Polish after the stories it documents.

### Parallel Opportunities

- T002 ∥ T003 ∥ T004 (different files); T005 ∥ T006.
- After Phase 2: US1 (src/taskToggle.ts) ∥ US2 (src/attachments.ts).
- T016 (src/objectStorage.ts) ∥ T017 (package.json) ∥ US2 work.
- T019 ∥ T020.

## Parallel Example: after Phase 2

```text
Task: "T007 [US1] taskToggle tests in src/test/taskToggle.test.ts"
Task: "T008 [US1] src/taskToggle.ts"
Task: "T010 [US2] attachments tests in src/test/attachments.test.ts"
Task: "T016 [US3] signV4 + putObject in src/objectStorage.ts"
```

## Implementation Strategy

1. **MVP**: Phase 1 + 2 + US1, which delivers one-click checkboxes and needs no settings.
2. **+US2**: evidence in the repo, which is all most teams need.
3. **+US3**: MinIO for large files.
4. Each step leaves `npm test` green and is releasable.

## Notes

- Tests first within each story; they fail until the implementation task lands.
- No server (Python) change in this feature.
- Commit after each phase.

---

## Phase 7: Convergence

- [X] T024 Offer the paste/drop edit only in files that belong to a Doorstop document per FR-009 and plan: design notes (contradicts). Add `inDoorstopDocument(fsPath: string): boolean` to src/itemFile.ts: walk up from `path.dirname(fsPath)` to the filesystem root and return true as soon as a folder holds `.doorstop.yml`. In `placeAt` in src/attachments.ts, require it for `file:` documents (the Document View branch is unchanged). Keep the "server is not reachable" error in `resolve*`, which now only fires for real item files. Tests: in src/test/itemFile.test.ts, `inDoorstopDocument` is true for a file in a temp document folder and in a subfolder of it, and false for a sibling folder with no marker (`// Spec 035 FR-009`). In src/test/attachments.test.ts, a `post.md` with closed frontmatter outside any document folder → `provideDocumentDropEdits` and `provideDocumentPasteEdits` return undefined (`// Spec 035 FR-009`). Re-run `npx vscode-test --label itemFile` and `--label attachments`
- [X] T025 Add a pytest case to server/tests proving published HTML resolves an attachment link per FR-012 and SC-003 (partial). Follow an existing publish test there to see how the temp Doorstop project and publish are set up: a document with `assets/shot.png` and an item whose text is `![shot.png](assets/shot.png)`. Publish to HTML through the server's publish endpoint, then assert that the `src="assets/shot.png"` in the item's HTML file resolves, relative to that HTML file, to an existing copied `shot.png`. Trace comment `# Spec 035 FR-012`. No server code change is expected; if the link does not resolve, record the actual output layout in specs/035-test-report-authoring/research.md R4 and stop for a decision
- [X] T026 Limit the checkbox toggle to item files inside a Doorstop document per plan: design notes "ordinary markdown files are untouched" (contradicts). In `textKind` in src/taskToggle.ts, require `inDoorstopDocument(document.fileName)` (from T024) for `file:` documents. Test in src/test/taskToggle.test.ts: a click inside `[ ]` in `notes.md` with closed frontmatter in a folder without `.doorstop.yml` changes nothing (`// Spec 035 FR-001`). The existing toggle tests must give their temp folder a `.doorstop.yml`
- [X] T027 Remove the `export` keyword from `ATTACHMENT_KIND` and `linkFor` in src/attachments.ts, `objectUrl` in src/objectStorage.ts, and `TextKind` in src/taskToggle.ts per ponytail review #2 (unrequested); first grep `src/` to confirm nothing imports them. Run `npm run compile`

---

## Phase 8: Convergence

- [X] T028 Add the optional public base URL for upload links per FR-015 and US3/AC6 (missing). In package.json, add `doorstop.attachments.objectStorage.publicUrl` (string, default `""`, scope `resource`) to the Attachments section, described as "Base address readers open uploaded files from, e.g. a Garage bucket's website endpoint `http://reports.web.garage.localhost:3902`. Links become `{publicUrl}/{key}`; empty uses `{endpoint}/{bucket}/{key}`." In src/attachments.ts `upload`, after `putObject` resolves, return `${publicUrl.replace(/\/+$/, '')}/${encoded key}` when the setting is set, encoding each key segment the way `objectUrl` in src/objectStorage.ts does (reuse that encoding; export it if needed). Otherwise return `putObject`'s URL unchanged. The upload itself always goes to `{endpoint}/{bucket}/{key}`. Test in src/test/attachments.test.ts (`// Spec 035 FR-015`): with `objectStorage.publicUrl` set to `http://public.example/` the inserted link is `http://public.example/runs/TR-001/<timestamp>-big%20run.bin`, with no double slash, while the fake server still receives `PUT /reports/runs/…`. Add `objectStorage.publicUrl` to `STORAGE_KEYS` so teardown resets it. Add the row to the settings table in specs/035-test-report-authoring/contracts/user-interface.md and to README.md
- [X] T029 Document Garage as the second reference target per FR-016 and spec Assumptions (partial). In the README.md "Test Reports" section, state that MinIO and Garage both work. For Garage, `doorstop.attachments.objectStorage.region` must equal Garage's `s3_region` (commonly `garage`), the endpoint is the S3 API port (default `:3900`), and `publicUrl` points at the bucket's website endpoint after `garage bucket website --allow <bucket>`. Add "§4 Garage" to specs/035-test-report-authoring/quickstart.md: settings with endpoint `http://localhost:3900`, region `garage`, bucket, and `publicUrl` `http://<bucket>.web.garage.localhost:3902`; credentials from `garage key create`; then drop a file above the threshold, and the link opens in a browser. Extend T023's manual walkthrough to cover §4 when a Garage instance is available
- [X] T030 Offer the paste/drop edit only for items the Doorstop server knows per FR-009 (partial). With a `.doorstop.yml` in the repository root, `inDoorstopDocument` is true for every file and non-item markdown with frontmatter is still captured. In `AttachmentProvider.request` in src/attachments.ts, call `this.options.locate(place.uid)` and return undefined when it gives nothing. Keep the location on the `Request` and use it in `attach` instead of a second `locate` call, and drop the "server is not reachable" branch from `attach`. Keep `inDoorstopDocument` in `placeAt` as the cheap first filter, and keep it in src/taskToggle.ts unchanged. Tests in src/test/attachments.test.ts (`// Spec 035 FR-009`): a fixture whose `locate` returns undefined makes `provideDocumentDropEdits` and `provideDocumentPasteEdits` return undefined. Replace the offline case at the end of the FR-019 test with this. Update the "Server unreachable" row in contracts/user-interface.md to "no edit offered; the editor's default paste/drop applies"
