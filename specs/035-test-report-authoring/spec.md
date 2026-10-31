# Feature Specification: Test Report Authoring

**Feature Branch**: `035-test-report-authoring`

**Created**: 2026-10-31

**Status**: Draft

**Input**: User description: "as a tester how is doing testreports I want to have handy and fast way to make testreports. The assution is that a testreport is one item which needs to be filled with data for each testspec which is some other linked item. So now as a tester I want to have be able to check and uncheck tasks from tasklists with one klick, I also want to be able to copy paste and drag and drop files from the windows explorer into the testreport. This should result into storing the data into a in the settings configure able datastorage. this could be 1. simplty a asset folder, or a object storage which gives back a link. For the object storage it should also be possible to configure a threshold in filesize to decide if the file is stored into the object storage or the git repo itself."

## Clarifications

### Session 2026-10-31

- Q: Which object storage must be supported? → A: S3-compatible only; MinIO
  is the target for now (FR-016).
- Q: Should the feature pre-fill a report from its linked test specs? → A:
  No, out of scope for this feature; testers write or copy the report text
  as today (see Assumptions).
- Q: When a file is uploaded to Garage (or MinIO), what address should the
  inserted link use so that report readers can open it? → A: An optional
  public base URL setting; links are `{publicUrl}/{key}` when it is set
  (e.g. Garage's website endpoint), else `{endpoint}/{bucket}/{key}` as
  before, so MinIO setups are unchanged. Garage is a second reference
  target next to MinIO (FR-015, FR-016).

## User Scenarios & Testing *(mandatory)*

A test report is a normal Doorstop item whose text holds, for each linked
test specification item, a task list of steps (`- [ ]` / `- [x]`) plus
evidence such as screenshots and log files. Nothing in this feature is
limited to items flagged as "test report": the checkbox toggle and file
attachment work in the text of any item, so no new item type or marker is
needed.

### User Story 1 - Tick test steps with one click (Priority: P1)

As a tester working through a test report, I want to check or uncheck a task
in the report's task list with a single click, so that I can record step
results while executing the test without hand-editing `[ ]` into `[x]`.

**Why this priority**: Ticking steps is the most frequent action while
testing. It is small, needs no configuration, and delivers value on its own.

**Independent Test**: Open an item file whose text contains `- [ ] step one`,
click inside its `[ ]` brackets, and confirm the line reads
`- [x] step one`; click again and confirm it reads `- [ ] step one`.

**Acceptance Scenarios**:

1. **Given** an item open in the editor whose text contains an unchecked
   task `- [ ] Login works`, **When** the tester clicks inside its brackets,
   **Then** the line becomes `- [x] Login works` and nothing else in the file
   changes.
2. **Given** a checked task `- [x] Login works`, **When** the tester clicks
   inside its brackets, **Then** the line becomes `- [ ] Login works`.
3. **Given** a toggle was just clicked, **When** the tester presses undo,
   **Then** the task returns to its previous state.
4. **Given** the same item is open in the Document View, **When** the tester
   clicks inside a task's brackets there, **Then** the task flips in the view and is
   written to the item file on the next save, like any other edit in the
   view.
5. **Given** a task list nested under another task, **When** the tester
   toggles the nested task, **Then** only that nested task changes; parent
   and sibling tasks are untouched.

---

### User Story 2 - Attach evidence by paste or drag and drop into the repository (Priority: P1)

As a tester, I want to copy files in Windows Explorer and paste them into the
test report, or drag them from Explorer onto the report, so that the files
are stored next to the requirements and a link to each file appears at the
cursor, without me copying files into folders and typing paths by hand.

**Why this priority**: Evidence (screenshots, logs, measurement files) is what
makes a test report a report. Storing it in the repository needs no external
service, so this works for every user with default settings.

**Independent Test**: With default settings, drag a `.png` and a `.log` file
from Explorer into an item's text, then confirm both files exist in the
configured asset folder and the text contains an image embed for the `.png`
and a plain link for the `.log`, both resolving to the stored files.

**Acceptance Scenarios**:

1. **Given** default storage settings, **When** the tester drops an image file
   from Explorer into an item's text, **Then** the file is copied into the
   asset folder of that item's document and an image embed pointing to the
   copy is inserted at the drop position.
2. **Given** default storage settings, **When** the tester copies a non-image
   file in Explorer and pastes it into an item's text, **Then** the file is
   copied into the asset folder and a link named after the file is inserted
   at the cursor.
3. **Given** the tester drops three files at once, **When** the drop
   completes, **Then** all three are stored and three links are inserted, one
   per line, in the order they were dropped.
4. **Given** a file with the same name already exists in the asset folder
   with different content, **When** a new file with that name is attached,
   **Then** the existing file is kept unchanged and the new one is stored
   under a distinct name, and the inserted link points to the new file.
5. **Given** the tester pastes a screenshot from the clipboard (image data,
   no file), **When** the paste completes, **Then** it is stored like a
   dropped image under a generated, timestamped file name.
6. **Given** the tester pastes plain text, **When** the paste completes,
   **Then** the text is inserted as usual and nothing is stored.

---

### User Story 3 - Store large files in an object storage with a size threshold (Priority: P2)

As a tester or project maintainer, I want to configure an object storage and
a file size threshold, so that files above the threshold are uploaded to the
object storage and linked by the URL it returns, while smaller files still go
into the repository, keeping the repository small without losing evidence.

**Why this priority**: Only needed once evidence files grow large (videos,
traces, dumps). Story 2 already covers the default case, so this builds on it.

**Independent Test**: Configure object storage with a 1 MB threshold against
a test storage endpoint, drop a 100 KB file and a 5 MB file, then confirm the
small file is in the asset folder, the large file is in the object storage,
and the text links the large file by the URL the storage returned.

**Acceptance Scenarios**:

1. **Given** object storage is configured with a threshold of 10 MB, **When**
   the tester drops a 2 MB file, **Then** the file is stored in the asset
   folder as in Story 2.
2. **Given** the same configuration, **When** the tester drops a 50 MB file,
   **Then** the file is uploaded to the object storage, nothing is written to
   the repository, and a link to the uploaded object is inserted.
3. **Given** the threshold is set to 0, **When** any file is attached,
   **Then** every file goes to the object storage.
4. **Given** an upload takes longer than one second, **When** it is running,
   **Then** a progress notification names the file being uploaded and offers
   cancel; cancelling inserts no link.
5. **Given** the object storage is unreachable or rejects the credentials,
   **When** a file above the threshold is attached, **Then** no link is
   inserted, nothing is written to the repository, and an error names the
   file and the reason.
6. **Given** a public base URL is configured (e.g. a Garage bucket's website
   address), **When** a file above the threshold is uploaded, **Then** the
   inserted link is that base URL followed by the object key, and it opens
   in a browser without credentials.

---

### Edge Cases

- A task line inside a fenced code block is not a task and does not toggle.
- Task markers written as `* [ ]`, `+ [ ]`, `1. [ ]`, and `[X]` (capital X)
  are recognized; toggling an `[X]` task produces `[ ]`.
- The item file was changed on disk while open: the toggle edits the open
  text like a keystroke; the normal editor conflict handling applies on save.
- The item is open read-only (for example a diff view): clicks do not toggle.
- The asset folder does not exist yet: it is created on the first attachment.
- A dropped folder (not a file) is rejected with a message; nothing is stored.
- A file name contains spaces or non-ASCII characters: the inserted link
  still resolves (characters that break links are encoded).
- A drop or paste lands in the YAML header of an item file instead of its
  text: the file is not stored and the default editor behavior applies.
- One of several dropped files fails to store: the files that succeeded are
  linked, the failed one is named in an error, and no half-written file is
  left behind.
- Object storage is selected but not fully configured (missing endpoint or
  credentials): attaching a file above the threshold shows an error that
  points to the missing setting; files below the threshold still work.

## Requirements *(mandatory)*

### Functional Requirements

#### Task toggle

- **FR-001**: The checkbox of every task list entry (`- [ ]`, `- [x]`,
  `- [X]`, also with `*`, `+`, or a numbered list marker, at any indentation)
  in the text of an item file MUST act as the toggle: a single mouse click
  inside its brackets flips it. Clicks elsewhere on the line, keyboard cursor
  moves, and drag selections MUST NOT toggle.
- **FR-002**: Toggling MUST flip only the checkbox characters of
  that line between checked and unchecked; no other character in the file may
  change.
- **FR-003**: A toggle MUST be a normal, undoable edit of the open text; it
  MUST NOT save the file on its own.
- **FR-004**: The same toggle MUST be available in the Document View; the
  change reaches the item file through the view's normal save.
- **FR-005**: Lines inside fenced code blocks and lines in an item file's
  metadata (outside the `text` field or markdown body) MUST NOT toggle.

#### Attaching files

- **FR-006**: Dropping one or more files from the operating system's file
  manager onto an item's text, in an item file or in the Document View, MUST
  store each file and insert one link per file at the drop position.
- **FR-007**: Pasting one or more files copied in the file manager, or image
  data from the clipboard, into an item's text MUST behave as FR-006 at the
  cursor position. Image data without a file name MUST get a generated,
  timestamped name.
- **FR-008**: Image files MUST be inserted as an image embed; all other files
  as a link whose label is the file name.
- **FR-009**: Pasted or dropped plain text, and drops onto the YAML header,
  MUST keep the editor's default behavior and store nothing.
- **FR-010**: Dropping a folder MUST be rejected with a message naming it;
  nothing is stored for it.

#### Storage

- **FR-011**: A setting MUST select the storage mode: `assets` (default) or
  `objectStorage`.
- **FR-012**: In `assets` mode each file MUST be copied into the `assets`
  folder of the item's document (the folder Doorstop copies when publishing;
  not configurable), creating the folder if missing, and the
  inserted link MUST be relative to the item so it resolves in the editor
  preview and in published output.
- **FR-013**: If a file with the same name but different content already
  exists in the asset folder, the new file MUST be stored under a distinct
  name; an existing file MUST never be overwritten. A file with identical name
  and content MUST be reused without a second copy.
- **FR-014**: In `objectStorage` mode a size threshold setting MUST decide
  where each file goes: files larger than the threshold are uploaded to the
  object storage, files at or below it are stored as in FR-012. A threshold of
  0 sends every file to the object storage.
- **FR-015**: An uploaded file MUST be linked by `{publicUrl}/{key}` when the
  optional public base URL setting is set, and by its object URL
  `{endpoint}/{bucket}/{key}` otherwise. A trailing `/` on the public base
  URL MUST NOT produce a double slash.
- **FR-016**: The object storage MUST be any S3-compatible service; MinIO and
  Garage are the reference targets the feature is verified against. Settings
  MUST cover endpoint URL, bucket, signing region, an optional key prefix,
  and an optional public base URL.
- **FR-017**: Object storage credentials MUST NOT be stored in settings files
  or in the repository; they MUST be kept in the editor's secret storage and
  entered through a command.

#### Feedback and failures

- **FR-018**: Storing or uploading that takes longer than one second MUST
  show a progress notification naming the file(s), with cancel. Cancelling
  MUST leave no link and no partially written file.
- **FR-019**: If storing or uploading a file fails, no link MUST be inserted
  for it, no partial file MUST remain, and an error MUST name the file and
  the reason. Other files of the same drop or paste are unaffected.
- **FR-020**: If `objectStorage` mode is selected but the storage is not
  fully configured, attaching a file above the threshold MUST fail per FR-019
  with a message pointing to the missing setting.

### Key Entities

- **Test report item**: A Doorstop item whose text records the results of
  executing one or more linked test specification items. Holds task lists
  and links to evidence. Not a separate item type.
- **Test specification item**: A Doorstop item, linked from the report,
  describing the steps to execute.
- **Task**: One task list line in an item's text; checked or unchecked.
- **Attachment**: A file the tester added; stored either in the document's
  asset folder (linked by relative path) or in the object storage (linked by
  returned URL).
- **Storage settings**: Mode (`assets` / `objectStorage`), size threshold,
  object storage connection details (endpoint, bucket, region, key prefix),
  and an optional public base URL for links. Credentials are kept
  separately in secret storage.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Recording the result of one test step takes one click, down
  from selecting and retyping the checkbox characters.
- **SC-002**: Attaching a file as evidence takes one drag or one paste, with
  no manual copying into folders and no typed paths.
- **SC-003**: 100% of links inserted by an attachment resolve to the stored
  file, both in the editor preview and in published output (repository
  storage) or in a browser (object storage).
- **SC-004**: No attachment, under any failure or cancellation, leaves a
  dangling link or a partially written file behind.
- **SC-005**: With object storage enabled, no file above the configured
  threshold is added to the repository.

## Assumptions

- Applies to any item's text; there is no special "test report" item type.
- Creating or pre-filling a report from its linked test specifications is
  out of scope; it can follow as a separate feature.
- Report readers can open uploaded files without credentials: either the
  bucket allows anonymous read (MinIO), or the public base URL points at an
  address that does (Garage's website endpoint after
  `garage bucket website --allow`, a proxy, or a CDN). Links are permanent,
  not expiring signed links.
- With Garage, the region setting must equal Garage's `s3_region` (commonly
  `garage`); MinIO accepts the default `us-east-1`.
- Writing attachment files into the asset folder is a plain file copy, not a
  Doorstop item mutation, so it does not go through the Doorstop server. Item
  text changes reach disk through the editor's normal save path.
- The default asset folder is the Doorstop `assets` folder inside the item's
  document folder, so published documents include the files without extra
  configuration.
- Storage settings are workspace settings, so a team shares one
  configuration; credentials are per user.
- Removing a link from the text does not delete the stored file; cleaning up
  unused attachments is out of scope.
- Works on every platform the extension supports; "Windows Explorer" in the
  request stands for the operating system's file manager.
- Files below the threshold are not checked for size limits beyond the
  threshold; very large files in `assets` mode are the user's choice.
