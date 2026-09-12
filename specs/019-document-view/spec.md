# Feature Specification: Document View

**Feature Branch**: `019-document-view`

**Created**: 2026-09-11

**Status**: Draft

**Input**: User description: "I want a "Document View" that shows all items of one Doorstop document merged into a single editable markdown document, so that developers and non-technical users (project managers) can read and edit a whole document like one file instead of jumping between item files. Nothing may be lost by accident; the view must be safe for people who do not know the block structure." (full description with sections OPENING THE VIEW, CONTENT, MARKER LINES ARE READ-ONLY, VISUAL STRUCTURE, EDITING, NEW ITEMS, SAVE, STRUCTURAL DIAGNOSTICS WHILE TYPING, DOORSTOP VALIDATION IN THE VIEW, CONSISTENCY WITH DISK, OUT OF SCOPE — see the `/speckit-specify` invocation of 2026-09-11.)

## Clarifications

### Session 2026-09-12

- Q: How should a classic Doorstop heading item (non-normative, no `header:`, one-line `text:` such as "Introduction") be rendered and written back? → A: As any item without a header: the heading line shows the UID, the text appears as body text below; the heading line maps to `header:` and the body to `text:`. The view never treats `text:` as a title.
- Q: Which level does a new item get when created between two existing items on save? → A: A sibling of the block above (after 1.2 → 1.3); the document is automatically renumbered so following siblings shift (1.3 → 1.4 …). Other items change only in their level; a new item after the last block or in an empty document needs no renumbering.
- Q: What happens when one of several writes fails midway through a save? → A: The save continues with the remaining items, then reports all failures together in one message naming the items. Successfully written blocks are regenerated from disk; the failed blocks keep the user's edits, so the tab stays dirty until they are saved.
- Q: What does the marker show about links and review state (originally: what when an item is both unreviewed and has a suspect link)? → A (revised by the user): Nothing. The item marker is a static separator `<!-- SYS-0007 · 1.4 · item separator. keep this line -->` carrying only UID and level plus a fixed hint; links and review state are shown on the action line and in the Problems panel only. The marker text changes only when the item's level changes.
- Q: Should the document marker on line 1 use the same static style? → A: Yes: `<!-- doorstop document SYS · keep this line -->` — prefix only; document folder and parent prefix are dropped (available in the explorer and on hover).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read a whole document as one file (Priority: P1)

As a project manager or developer, I want to open a Doorstop document (for
example `SYS`) as one continuous markdown document that lists every active
item in level order, so that I can read the requirements top to bottom in a
normal editor tab instead of opening item files one by one.

**Why this priority**: This is the foundation of the feature and delivers
value on its own: even without editing, a merged, ordered, readable document
is what non-technical users currently lack. Every other story builds on the
document this story produces.

**Independent Test**: In a workspace with a Doorstop document containing at
least three active items on different levels (e.g. `1.0`, `1.1`, `1.1.1`),
open the document view from the explorer and confirm an editor tab titled
`SYS (document)` opens, in markdown mode, showing a document marker line
followed by one block per active item in level order, each block consisting
of a marker line, a heading of the right depth and the item's unchanged text.

**Acceptance Scenarios**:

1. **Given** the Doorstop explorer shows a document node, **When** the user
   picks "Open as document" from the node's context menu or clicks its inline
   "Open as document" icon, **Then** an editor tab titled `<PREFIX> (document)`
   opens in markdown language mode showing the merged document.
2. **Given** the command palette, **When** the user runs "Doorstop: Open
   Document View", **Then** the extension asks which document to open (listing
   the documents of the workspace) and opens the chosen one.
3. **Given** a document view for `SYS` is already open, **When** the user
   opens `SYS` as a document again (from any entry point), **Then** the
   existing tab is revealed and no second tab is created.
4. **Given** the view is open, **When** the user reads line 1, **Then** it is
   the document marker `<!-- doorstop document SYS · keep this line -->`
   (document prefix and a fixed hint; nothing else).
5. **Given** an active item `SYS-0006` on level `1.1` with header "Sensor
   input", one link to `REQ-0006` and no reported problems, **When** the view
   renders it, **Then** its block is exactly: the marker line
   `<!-- SYS-0006 · 1.1 · item separator. keep this line -->`, the header
   line `## Sensor input`, and the item's text as markdown, unchanged.
6. **Given** an item with no header, **When** the view renders it, **Then**
   the header line shows the item's UID (e.g. `## SYS-0009`).
7. **Given** items on levels `1.0`, `1.1` and `1.1.1`, **When** the view
   renders them, **Then** their header lines use `#`, `##` and `###`
   respectively, and the blocks appear in Doorstop level order separated by
   exactly one blank line.
8. **Given** a heading item (a non-normative item with a header and no text),
   **When** the view renders it, **Then** its block consists of the marker
   line and the heading line only.
9. **Given** an item whose text itself contains markdown headings, **When**
   the view renders it, **Then** those headings appear as ordinary text inside
   the item's block and do not start a new block.
10. **Given** an item that Doorstop reports as unreviewed, or one with a
    suspect link, or one with several links, **When** the view renders its
    marker, **Then** the marker line is identical in form to every other
    marker (`<!-- <UID> · <level> · item separator. keep this line -->`) and
    carries no link or review information; that information is visible on
    the action line above the block and in the Problems panel.
11. **Given** the view is open, **When** the user uses undo, find/replace,
    multi-cursor editing or opens the markdown preview side by side, **Then**
    these work exactly as for any markdown file.
12. **Given** a document has inactive items, **When** the view renders it,
    **Then** inactive items are not shown.

---

### User Story 2 - Edit headers and text and save back to the item files (Priority: P1)

As a project manager, I want to change an item's heading or text directly in
the document view and save, so that my edits land in the right item files
without me touching YAML or knowing which file an item lives in.

**Why this priority**: Editing is the core promise ("read and edit a whole
document like one file"). Without it the view is only a viewer.

**Independent Test**: Open the view, change the text of one item and the
header of another, save, and confirm that exactly those two item files were
modified, that only their header/text content changed, that all other item
files are untouched, and that the view re-renders from disk after the save.

**Acceptance Scenarios**:

1. **Given** the view is open, **When** the user edits the text below a
   block's header line and saves, **Then** that item's text is updated to the
   edited markdown exactly as written, and nothing else in that item file
   changes (level, links, review state, references and any other attribute
   stay byte-for-byte as before).
2. **Given** the view is open, **When** the user changes the heading text of
   a block and saves, **Then** that item's header is updated to the new
   heading text (without the leading `#` characters).
3. **Given** a block whose heading text equals the item's UID, **When** the
   user saves, **Then** the item's header stays empty (the UID is a display
   fallback, not a header).
4. **Given** the user changed the number of `#` characters on a header line
   (e.g. `##` to `####`), **When** the user saves, **Then** the line directly
   after the marker is still treated as the header, its depth is ignored, and
   after the save the view shows the heading with the depth that follows the
   item's level.
5. **Given** the view is open and only one of ten blocks was edited, **When**
   the user saves, **Then** only that one item is written; the other nine item
   files are not modified.
6. **Given** the user opened the view and made no changes, **When** the user
   saves, **Then** no item file is modified.
7. **Given** a save succeeded, **When** the view re-renders, **Then** the
   content is regenerated from disk (levels and marker lines are current,
   review states are current on the action lines), the tab is marked clean,
   and the Problems panel and the Doorstop explorer refresh as they do after
   any other Doorstop change.
8. **Given** a save cannot be completed at all (for example the Doorstop
   server is unavailable), **When** the user saves, **Then** an error message
   explains the failure, the tab stays dirty and none of the user's edits are
   lost.
9. **Given** a save writes five items and the write of the second one fails,
   **When** the save runs, **Then** the remaining three items are still
   written, one message afterwards lists every item that failed, the four
   written blocks are regenerated from disk, the failed block keeps the
   user's edits, and the tab stays dirty until that block is saved.

---

### User Story 3 - Be protected from losing items by accident (Priority: P1)

As a non-technical user who does not know the block structure, I want the
view to stop me from silently destroying items — by editing a marker,
deleting a heading line, or merging two blocks — so that I can work with
confidence that nothing is removed or corrupted without my explicit
confirmation.

**Why this priority**: "Nothing may be lost by accident" is an explicit,
non-negotiable goal of the feature. A view that can edit but not protect is
not safe to hand to project managers.

**Independent Test**: Open the view and (a) type into a marker line, (b)
delete an entire block including its marker, (c) delete a heading line and
(d) duplicate a marker line. Confirm (a) is reverted immediately with a hint,
(b) produces a deletion confirmation on save and keeps the item when "Keep"
is chosen, (c) is flagged while typing with a one-click restore and
confirmed on save, and (d) refuses the save with a message naming the line
and a "Restore block structure" fix.

**Acceptance Scenarios**:

1. **Given** the view is open, **When** the user types into, deletes from or
   pastes over a marker line, **Then** the edit is reverted immediately and a
   hint is shown: "This line is managed by Doorstop - use the actions above
   it".
2. **Given** the view is open, **When** the user reads the marker lines,
   **Then** they are rendered dimmed, distinguishing them from editable text.
3. **Given** the user deleted or merged away the block of `SYS-0007` (its
   marker is no longer present), **When** the user saves, **Then** the save
   asks "SYS-0007 would be deleted - Delete / Keep / Cancel"; "Delete"
   removes the item, "Keep" restores the block from disk and continues the
   save, "Cancel" aborts the save with nothing written.
4. **Given** the markers of several items are missing, **When** the user
   saves, **Then** all affected UIDs are listed in a single dialog with the
   same Delete / Keep / Cancel choices, and no item is deleted without the
   user choosing Delete.
5. **Given** the same marker appears twice, a marker names a UID that does
   not belong to this document, or there is text before the first item
   marker, **When** the user saves, **Then** the save is refused with an
   error message naming the offending line and offering the quick fix
   "Restore block structure", and no item file is modified.
6. **Given** the user is typing, **When** any of the following structural
   problems exists — the line after a marker is not a heading or is empty, a
   marker line was changed, a marker is duplicated, text precedes the first
   marker, or a placeholder's heading is empty — **Then** the extension
   reports its own warning on the affected line (separate from Doorstop's
   validation) within a short delay, each with a quick fix "Restore block
   structure of SYS-0007" that restores the marker and/or header line from
   disk.
7. **Given** the header line of `SYS-0006` changed from "A" to "B" while its
   text did not change, **When** the user saves, **Then** the save asks
   "Header of SYS-0006 changed from 'A' to 'B' - Apply / Keep"; "Apply"
   writes the new header, "Keep" restores the header from disk and continues
   the save.
8. **Given** the view has unsaved edits, **When** the user closes the tab,
   **Then** the standard Save / Don't Save / Cancel dialog appears and
   behaves as for any file.

---

### User Story 4 - Add new items in place (Priority: P2)

As an author reading the document top to bottom, I want to insert a new item
exactly where it belongs in the reading order, so that adding a requirement
does not require leaving the document or working out levels by hand.

**Why this priority**: Creating items is the most common structural change
after editing text, but the view is already valuable (read, edit, protect)
without it.

**Independent Test**: Open the view, use "+ New item below" on a block, type
a heading and a paragraph into the placeholder, save, and confirm a new item
was created immediately after that block with the typed header and text, and
that the view now shows it with a real marker.

**Acceptance Scenarios**:

1. **Given** the view is open, **When** the user activates "+ New item below"
   on a block's action line or runs "Doorstop: Insert Item Here" with the
   cursor inside a block, **Then** a placeholder block — the line
   `<!-- new item -->`, an empty heading line and an empty paragraph — is
   inserted directly after that block, separated by one blank line, with the
   cursor placed on the heading line.
2. **Given** a placeholder block with a heading and/or text after the block
   of `SYS-0002` (level `1.2`), followed by `SYS-0003` (level `1.3`), **When**
   the user saves, **Then** a new item is created in this document at level
   `1.3` as a sibling of `SYS-0002`, `SYS-0003` and its following siblings
   are renumbered (`1.3` → `1.4`, …) with no other change to their files,
   the new item has the placeholder's heading as header and its paragraph as
   text, and after the save the view shows it between `SYS-0002` and
   `SYS-0003` with its assigned UID, level and a real marker line.
3. **Given** a placeholder block whose heading and text are both empty,
   **When** the user saves, **Then** the placeholder is ignored (no item is
   created) and it disappears when the view re-renders.
4. **Given** a placeholder block exists, **When** the user picks "Cancel" on
   its action line, **Then** the placeholder block is removed from the view.
5. **Given** the user types a markdown heading inside an existing block
   without inserting a placeholder, **When** the user saves, **Then** the
   heading is saved as part of that item's text and no new item is created.
6. **Given** several placeholders were inserted at different positions,
   **When** the user saves, **Then** each becomes an item after the block
   above it, in document order.

---

### User Story 5 - Use item actions and see Doorstop problems inside the view (Priority: P2)

As a developer working in the document view, I want the item actions and
validation results I already have in item files — open item, review, derive,
link, clear suspect links, problem squiggles, hover, go to definition,
references, call hierarchy — to be available on each block, so that I do not
have to switch to the item file for routine actions.

**Why this priority**: These actions already exist; exposing them in the
view removes the last reasons to leave it. The view is usable without them.

**Independent Test**: With a document that has one unreviewed item and one
item with a suspect link, open the view and confirm the action line above
each block shows the UID and the applicable actions, that the Problems panel
lists Doorstop's problems anchored to the marker lines with the same quick
fixes as in item files, and that hovering / go-to-definition on a UID inside
a marker line works.

**Acceptance Scenarios**:

1. **Given** the view is open, **When** the user looks above any item block,
   **Then** an action line shows `SYS-0006 | Open item | Review | Derive |
   Link... | 1 link | + New item below` (the link entry reads "no links" when
   there are none and "N links" otherwise).
2. **Given** Doorstop reports an item as unreviewed, **When** the view shows
   its action line, **Then** it additionally offers "Do Review"; **Given**
   Doorstop reports a suspect link, **Then** it additionally offers "Clear
   suspect link"; neither appears when Doorstop reports no such problem.
3. **Given** the user activates "Open item", "Review", "Derive", "Link...",
   "Do Review" or "Clear suspect link" on a block, **Then** the existing
   corresponding command runs for that item, and the view refreshes
   afterwards to show the result (for example "Do Review" disappears from the action line).
4. **Given** Doorstop reports problems for an item (unreviewed changes,
   suspect links, missing links, etc.), **When** the view is open, **Then**
   each problem appears on that item's marker line in the view with the same
   severity and the same quick fixes (Do Review, Clear Suspect Link, Clear
   All Suspect Links) as in the item file.
5. **Given** the UID inside a marker line,
   **When** the user hovers it, uses go to definition, find references or
   the call hierarchy, **Then** these behave as they do on a UID in an item
   file.
6. **Given** the user edits text, **When** blocks move up or down, **Then**
   action lines stay attached to their blocks and are recomputed shortly
   after typing stops.

---

### User Story 6 - Stay consistent with changes on disk (Priority: P3)

As a developer who also edits item files directly, runs Doorstop commands or
switches git branches, I want the document view to reflect changes made
outside it and to warn me before my unsaved edits would collide with them,
so that the view never shows or writes stale content.

**Why this priority**: Important for correctness in mixed workflows, but the
primary flows work without it as long as one editing path is used at a time.

**Independent Test**: With the view open and clean, change an item's text in
its own file and save it; confirm the view updates. Then make an unsaved edit
in the view, change another item file on disk, and confirm the notification
with Reload / Keep my edits appears and behaves as described.

**Acceptance Scenarios**:

1. **Given** the view is open with no unsaved edits, **When** an item file of
   this document changes on disk (edited in its own tab, changed by a Doorstop
   command, or replaced by a git checkout), **Then** the view refreshes to
   show the new content.
2. **Given** the view has unsaved edits, **When** `SYS-0006` changes on disk,
   **Then** a notification "SYS-0006 changed on disk" offers "Reload" and
   "Keep my edits"; "Reload" regenerates the view from disk and discards the
   view's edits; "Keep my edits" leaves the view as is.
3. **Given** the user chose "Keep my edits" and later saves, **When** the
   save runs, **Then** each block is compared against the item's current
   content on disk, so items the user did not touch in the view are not
   overwritten with stale content.
4. **Given** items are added to or removed from the document on disk while
   the view is open and clean, **When** the view refreshes, **Then** the new
   set of active items is shown in level order.

---

### User Story 7 - See block boundaries at a glance (Priority: P3)

As a non-technical reader, I want to see where one item ends and the next
begins without reading the marker lines, so that long documents stay
scannable.

**Why this priority**: A readability aid; the structure is already visible
through markers and headings.

**Independent Test**: Open a document with at least four items and confirm
that consecutive blocks are alternately tinted with a subtle whole-line
background, that the tint moves with the text while editing, and that the
colour can be overridden via the theme colour
`doorstop.documentView.altBlockBackground`.

**Acceptance Scenarios**:

1. **Given** the view is open, **When** the user scrolls through it, **Then**
   every second item block (from its marker line to the line before the next
   marker) has a subtle background tint across the whole line width.
2. **Given** the user inserts or deletes lines inside a block, **When** typing
   stops, **Then** the tinted regions are recomputed so each still covers
   exactly one block.
3. **Given** a light, dark or high-contrast theme, **When** the view is
   shown, **Then** a suitable default tint is used for that theme kind, and a
   user-defined `doorstop.documentView.altBlockBackground` colour overrides
   it.

---

### Edge Cases

- **Empty document**: a document with no active items shows only the
  document marker; "Doorstop: Insert Item Here" (or "+ New item below" on the
  document marker's action line) inserts a placeholder that becomes the
  document's first item on save.
- **Placeholder with no block above**: a placeholder inserted directly after
  the document marker becomes the first item of the document.
- **Heading item with hidden text**: a non-normative item that has both a
  header and text renders like a normal block (heading plus text) so that no
  text is hidden from the reader or silently overwritten on save; only
  non-normative items with an empty text render as heading line only.
- **Classic heading item (title in `text:`)**: a non-normative item with no
  header and a one-line text (e.g. `text: Introduction`) renders like any
  item without a header — `# SYS-0001` followed by "Introduction" as body
  text. The heading line still maps to `header:` and the body to `text:`;
  the view never promotes `text:` to a title.
- **Header deleted entirely**: if the line after a marker is blank or is not
  a heading, the block is flagged while typing (quick fix restores the header
  from disk); on save the line after the marker is still used as the header
  and the header-change confirmation catches the accidental case.
- **Marker moved**: a marker line that was cut and pasted elsewhere is
  treated as a changed block position; block order is informational, so the
  item keeps its level, and only its header/text are compared and written.
  A marker moved out of level order is not an error.
- **Text that looks like a marker**: if an item's text on disk contains a
  line that would be recognised as an item marker, that line is flagged with
  a warning in the view and a save that would split at it is refused with
  the line named (the same rule as a duplicated marker); the user is told to
  edit that item in its own file. Nothing is written.
- **Trailing whitespace and blank lines**: the blank separator line between
  blocks is not part of the item's text; differences consisting only of
  trailing blank lines are not treated as changes.
- **External deletion**: if an item was removed on disk while its block is
  still in the view, a save treats the block as unknown to this document
  (refused with the line named) unless the view was reloaded first; the
  disk-change notification gives the user the chance to reload.
- **Partial save failure**: when some item writes fail, the rest of the
  save still completes, all failures are reported together, written blocks
  are refreshed from disk and failed blocks keep their edits (FR-021a).
- **Save while Doorstop reports errors**: Doorstop validation problems
  (unreviewed, suspect links, etc.) do not block a save; only the extension's
  structural errors (duplicate/foreign marker, text before first marker) do.
- **Concurrent views**: document views of different documents can be open at
  the same time; each maps only to its own document's items.
- **Undo after marker revert**: reverting an edit to a marker line must not
  discard the user's other unsaved edits.
- **Very large documents**: rendering and re-analysis after typing must not
  make the editor unresponsive for documents with several hundred items;
  recomputation is deferred until typing pauses.

## Requirements *(mandatory)*

### Functional Requirements

**Opening the view**

- **FR-001**: The Doorstop explorer MUST offer "Open as document" on every
  document node, both as a context-menu entry and as an inline icon.
- **FR-002**: The command "Doorstop: Open Document View" MUST be available
  from the command palette and MUST ask the user to pick a document when not
  invoked on a specific document.
- **FR-003**: The view MUST open as a normal text editor tab titled
  `<PREFIX> (document)` in markdown language mode, backed by a virtual
  document (not a file on disk) that the extension generates from the
  document's items.
- **FR-004**: Opening a document that already has a document view MUST reveal
  the existing tab instead of creating a second one.
- **FR-005**: Standard editor features (undo/redo, find/replace,
  multi-cursor, markdown preview side by side, Save / Don't Save / Cancel on
  close) MUST work as for any markdown file.

**Content**

- **FR-006**: The first line MUST be the document marker
  `<!-- doorstop document <PREFIX> · keep this line -->`; like item markers
  it is static, read-only and rendered dimmed (FR-012, FR-013 apply).
- **FR-007**: The view MUST list only the document's active items, in
  Doorstop level order, one block per item, blocks separated by exactly one
  blank line.
- **FR-008**: Each item block MUST consist of, in order: (1) a marker line
  `<!-- <UID> · <level> · item separator. keep this line -->`,
  (2) a header line that is a markdown heading whose depth follows the level
  depth (`1.0` → `#`, `1.1` → `##`, `1.1.1` → `###`, …) and whose text is the
  item's header or, when the item has no header, its UID, (3) the item's
  text as markdown, unchanged.
- **FR-009**: The marker line MUST be static: it carries only the UID, the
  level and the fixed hint `item separator. keep this line`, and MUST NOT
  contain link or review information. Links and review state are shown on
  the action line ("N links", "Do Review", "Clear suspect link") and in the
  Problems panel. A marker's text changes only when the item's level
  changes.
- **FR-010**: A heading item (non-normative, with a header, empty text) MUST
  render as marker line plus heading line only.
- **FR-011**: Blocks MUST be delimited only by marker lines; markdown
  headings inside an item's text MUST be treated as ordinary text, and the
  line directly after a marker MUST always be treated as the block's header
  line.

**Marker lines**

- **FR-012**: Marker lines MUST be rendered dimmed.
- **FR-013**: Any user edit to a marker line MUST be reverted immediately
  and a hint "This line is managed by Doorstop - use the actions above it"
  MUST be shown; the revert MUST NOT discard other unsaved edits.
- **FR-014**: The level shown in a marker is informational; level, links
  and review state MUST change only through the existing Doorstop commands,
  never through text edits in the view.

**Editing and saving**

- **FR-015**: Users MUST be able to edit the header line and the text below
  it; on save the header line's text (without `#` characters) MUST be written
  as the item's header and the text below MUST be written as the item's text
  with its markdown preserved as written.
- **FR-016**: On save, if the header line's text equals the item's UID, the
  item's header MUST be left empty.
- **FR-017**: The heading depth on a header line MUST NOT be trusted: on save
  the line directly after the marker is the header regardless of depth, and
  after the save the view MUST re-render it with the depth that follows the
  item's level.
- **FR-018**: On save the view MUST be split at the marker lines; each block
  with a UID MUST be compared against the item's current content on disk and
  only items whose header or text changed MUST be written.
- **FR-019**: Writing an item MUST change only its header and text; every
  other attribute of the item file MUST remain unchanged, and the item file's
  existing format MUST be preserved.
- **FR-020**: After every successful save the view MUST be regenerated from
  disk so that levels, marker lines and the review state on the action
  lines are current, the tab MUST become clean, and the Problems panel and the Doorstop explorer MUST
  refresh as after other Doorstop changes.
- **FR-021**: If a save cannot be started (for example the server is
  unavailable), the user MUST see an error message, the tab MUST remain
  dirty and the user's edits MUST be preserved.
- **FR-021a**: If individual writes fail during a save, the save MUST
  continue with the remaining items and afterwards report all failures in
  one message naming the affected items. Blocks written successfully MUST be
  regenerated from disk; failed blocks MUST keep the user's edits, and the
  tab MUST stay dirty until they are saved. A failed write MUST never leave
  an item file partially changed.

**Deletion protection**

- **FR-022**: A UID of this document whose marker is missing from the view
  at save time MUST be treated as a requested deletion; the save MUST ask
  "<UID> would be deleted - Delete / Keep / Cancel". "Delete" deletes the
  item, "Keep" restores the block from disk and continues the save, "Cancel"
  aborts the save with nothing written.
- **FR-023**: When several items would be deleted, all their UIDs MUST be
  listed in one dialog with the same choices.
- **FR-024**: No item MUST ever be deleted without the user explicitly
  choosing "Delete".

**Structural integrity**

- **FR-025**: A save MUST be refused — with an error message naming the
  offending line and a quick fix "Restore block structure" — and no item
  MUST be written when: a marker is duplicated, a marker names a UID that
  does not belong to this document, or there is text before the first item
  marker.
- **FR-026**: While the user types, the extension MUST report its own
  warnings (separate from Doorstop's validation) for: a block whose line
  after the marker is not a heading or is empty; a changed marker line; a
  duplicated marker; text before the first marker; a placeholder whose
  heading is empty.
- **FR-027**: Every structural warning MUST offer a quick fix "Restore block
  structure of <UID>" that restores that block's marker and/or header line
  from disk (for a placeholder, the fix removes or completes the placeholder
  structure).
- **FR-028**: When a block's header changed but its text did not, the save
  MUST ask "Header of <UID> changed from '<old>' to '<new>' - Apply / Keep";
  "Apply" writes the new header, "Keep" restores the header from disk and
  continues the save.

**New items**

- **FR-029**: Text without a marker MUST always belong to the item block
  above it; a typed heading MUST never create a new item.
- **FR-030**: "+ New item below" on a block's action line and the command
  "Doorstop: Insert Item Here" (acting on the block containing the cursor)
  MUST insert a placeholder block — `<!-- new item -->`, an empty heading
  line and an empty paragraph — directly after that block, and place the
  cursor on the heading line.
- **FR-031**: On save each placeholder block with a non-empty heading or
  text MUST become a new item of this document created after the item of the
  block above it, with the placeholder's heading as header and its paragraph
  as text; after the save the view MUST show the new item with its UID and
  a real marker.
- **FR-031a**: The new item MUST be a sibling of the block above it (the
  next level number at the same depth, e.g. after `1.2` → `1.3`); when that
  level is already taken, the document MUST be renumbered automatically so
  that the following siblings shift (`1.3` → `1.4`, …) and the view's
  reading order equals the level order after the save. Renumbering MUST
  change nothing but the level of the affected items. A new item after the
  last block, or in an empty document, takes the next free level without
  renumbering.
- **FR-032**: A placeholder with an empty heading and empty text MUST be
  ignored on save.
- **FR-033**: A placeholder's action line MUST offer "Cancel", which removes
  the placeholder block from the view.

**Item actions and Doorstop validation in the view**

- **FR-034**: Above every item block an action line MUST show the UID and the
  actions Open item, Review, Derive, Link..., the link count ("no links" /
  "1 link" / "N links") and "+ New item below"; "Do Review" and "Clear
  suspect link" MUST additionally appear only when Doorstop reports the
  corresponding problem for that item.
- **FR-035**: Each action MUST invoke the existing corresponding Doorstop
  command for that item, and the view MUST refresh afterwards.
- **FR-036**: Problems Doorstop reports for an item MUST be shown on the
  item's marker line in the view with the same severity and the same quick
  fixes (Do Review, Clear Suspect Link, Clear All Suspect Links) as in the
  item file.
- **FR-037**: Hover, go to definition, find references and the call
  hierarchy MUST work on the UID inside a marker line exactly as on UIDs in item
  files.
- **FR-038**: Action lines, tints and structural warnings MUST be recomputed
  after edits, deferred until typing pauses, and MUST stay attached to their
  blocks as text moves.

**Visual structure**

- **FR-039**: Consecutive item blocks MUST be alternately tinted with a
  subtle whole-line background so block boundaries are visible without
  reading marker lines; the tint MUST follow the text while editing.
- **FR-040**: The tint colour MUST be the theme colour
  `doorstop.documentView.altBlockBackground` with defaults for light, dark
  and high-contrast themes, overridable by the user.

**Consistency with disk**

- **FR-041**: When an item file of the shown document changes on disk (edited
  in its own tab, changed by a Doorstop command, replaced by a git checkout)
  and the view has no unsaved edits, the view MUST refresh.
- **FR-042**: When such a change happens while the view has unsaved edits, a
  notification "<UID> changed on disk" MUST offer "Reload" (regenerate from
  disk, discarding the view's edits) and "Keep my edits" (leave the view as
  is).

**Scope limits**

- **FR-043**: The view MUST NOT allow editing links, level, review state or
  any attribute other than header and text as text; those remain with the
  existing commands.
- **FR-044**: Moving blocks in the view MUST NOT change item levels or order
  on disk; block order is informational and levels change only via "Reorder
  Document".
- **FR-045**: The view MUST show exactly one document; inactive items, a
  WYSIWYG/notebook editor and re-levelling of headings inside item text are
  out of scope.

### Key Entities

- **Document view**: a virtual, editable markdown representation of one
  Doorstop document; identified by the document prefix; has a dirty state
  and is regenerated from disk after each successful save or reload.
- **Document marker**: the first line of the view; a static, read-only
  comment line carrying the document prefix and the fixed hint
  `keep this line`.
- **Item block**: the unit of mapping between the view and one item file;
  consists of an item marker, a header line and text; keyed by the UID in
  its marker.
- **Item marker**: a read-only, static comment line carrying UID, level
  and the fixed hint `item separator. keep this line`; the only delimiter
  between blocks.
- **Placeholder block**: a block whose marker is `<!-- new item -->`;
  represents an item to be created after the preceding block on save.
- **Change set**: the result of comparing the view with disk at save time —
  items to update (header/text), items to create (from placeholders), items
  whose deletion must be confirmed, and structural errors that refuse the
  save.
- **Structural warning**: an extension-reported problem about the view's
  block structure (not a Doorstop validation result), anchored to a line and
  carrying a "Restore block structure" fix.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can go from the Doorstop explorer to reading a document
  as one continuous markdown document in a single action, and a document of
  up to 500 active items is displayed within 2 seconds of opening.
- **SC-002**: Opening a document view and saving it without edits changes
  zero item files (all files byte-identical before and after).
- **SC-003**: Editing the text of one item and saving modifies exactly one
  item file, and in that file only the header/text content differs; a
  reviewer diffing the file sees no other change in 100% of cases.
- **SC-004**: 100% of item deletions initiated through the view are preceded
  by an explicit confirmation dialog; no item file is ever removed without
  the user choosing "Delete".
- **SC-005**: Every one of the five structural problems (non-heading/empty
  line after a marker, changed marker, duplicated marker, text before first
  marker, placeholder with empty heading) is flagged within 1 second of
  typing stopping, and each can be repaired with one quick-fix action.
- **SC-006**: An edit to a marker line is reverted before the next keystroke
  can land, and the reverted edit never removes any other unsaved change.
- **SC-007**: In a usability check, a user with no knowledge of Doorstop's
  file structure can edit a paragraph, change a heading, add a new item and
  save, with all three changes landing in the right item files and no item
  lost, on the first attempt.
- **SC-008**: Every Doorstop problem shown for an item in its own file is
  also shown on that item's marker line in the view, with the same severity
  and the same quick fixes (100% parity).
- **SC-009**: A change to an item file on disk is reflected in a clean
  document view within 2 seconds; when the view is dirty, the user is
  notified within the same time and can choose to reload or keep edits.
- **SC-010**: Hover, go to definition, references and call hierarchy on a
  UID inside a marker line succeed at the same rate as on a UID inside an
  item file.

## Assumptions

- **Users**: developers and project managers working in a workspace with a
  running Doorstop server; the view relies on the existing server-backed
  item index for content, levels, links and validation results.
- **Item file formats**: item files may exist in the YAML or the markdown
  item format; writing header/text back preserves the item file's existing
  format and every attribute other than header and text. Whether the write
  itself needs a new server capability is a planning decision; per the
  project constitution any such mutation goes through the server.
- **Deletion mechanism**: deleting an item confirmed through the view uses
  Doorstop's own item removal; downstream items that linked to the deleted
  item are reported by Doorstop's existing validation as today, with no
  extra handling in the view.
- **Heading items**: "heading item" means a non-normative item that has a
  header and no text. A non-normative item that has both header and text
  renders like a normal block so that nothing is hidden or overwritten. A
  non-normative item with no header renders like any header-less item (UID
  as heading, text as body); the mapping header line → `header:`, body →
  `text:` is the same for every item regardless of its normative flag.
- **Placeholder position and level**: a new item is created after the item
  of the nearest block above the placeholder as its sibling (FR-031a); when
  there is none (empty document, or placeholder right after the document
  marker) it becomes the first item at the first level. The automatic
  renumbering reuses the existing Reorder Document behaviour, so a save that
  creates items in the middle of a document may touch the level of several
  item files; this is the one exception to "only changed items are written"
  and is limited to the level attribute.
- **Link count entry**: the "N links" entry on the action line is
  informational; activating it opens the existing call hierarchy for the
  item.
- **"Insert Item Here"**: acts on the block containing the cursor and inserts
  the placeholder after that block; with the cursor on the document marker
  it inserts before the first item.
- **Text comparison**: the blank separator line between blocks is not part of
  an item's text, and differences consisting only of trailing blank lines do
  not count as a change.
- **Header-change confirmation**: intentionally accepted as a per-item
  question even for deliberate header edits, since the feature description
  prioritises catching an accidentally deleted header line.
- **Multiple disk changes**: when several items change on disk at once while
  the view is dirty, one notification lists the affected UIDs (or the
  document, when many changed) with the same Reload / Keep my edits choices.
- **Save when the server is unavailable**: the save fails with an error
  message and the user's edits stay in the view. When only some writes fail,
  the save is best-effort per item (FR-021a): item files are independent, so
  no rollback of already written items is attempted; the failure report and
  the still-dirty blocks are the recovery path.
- **Dependencies on existing features**: the item actions (Open item,
  Review, Do Review, Derive, Link..., Clear suspect link, Reorder Document),
  Doorstop validation diagnostics and their quick fixes, hover, go to
  definition, references, call hierarchy and the explorer refresh behaviour
  already exist and are reused; the existing providers must accept the
  view's virtual documents in addition to item files.
- **Testing**: per the project constitution the feature ships with at least
  one CI-runnable end-to-end test covering the primary path (open the view,
  edit text and header, add a placeholder, save, verify item files), plus
  coverage of the deletion-confirmation and refused-save paths since those
  failure behaviours are user-visible.
