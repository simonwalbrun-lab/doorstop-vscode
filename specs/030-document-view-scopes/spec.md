# Feature Specification: Document View for Sections and Filter Results

**Feature Branch**: `030-document-view-scopes`

**Created**: 2026-10-11

**Status**: Draft

**Input**: User description: "As a user I want to be able to use the document view not only for a complete document but also for sections of documents. This means each node in the treeview which contains subelements shall offer an open as document button. If this section is already open within some other open document view the document view shall not open the document view and show the reason as error. As a user I also want to be able to use the document view for all elements which were found by a notebook filter. The document view called from the treeview and from a filter shall behave equal. It shall also be possible to adjust in the settings which fields of the yml header shall appear in the document view for editing. Therefore I can create a list in the settings with items to display."

## Clarifications

### Session 2026-10-11

- Q: May an item be shown in more than one open document view at the same time? → A: Yes. There is no one-view-per-item restriction; full, section and filter-result views may overlap freely. The overlap error and its user story are removed. Concurrent edits of one item in several views are handled by the existing consistency-with-disk behaviour of the document view.

- Q: What should a document view keep when its editor loses focus and is clicked again (reported bug: it jumps to the start)? → A: Cursor position, selection and scroll position stay exactly as they were, for every kind of view (document, section, filter result). The same holds whenever the view's text is refreshed from disk or after a save and the cursor's block still exists.

- Q: Where does a manual "reload from disk" button go and what happens to unsaved edits? → A: One CodeLens "Reload from disk" on the first line (the document marker line) of every document view, whatever its kind. A view without unsaved edits reloads at once; a view with unsaved edits first asks "Discard my edits / Keep", and Keep leaves the view untouched. "From dist" in the request is read as "from disk" (the item files, via the server).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open a section of a document as a document view (Priority: P1)

As a requirements engineer, I want to open just one section (a tree node and
everything below it) in the document view, so that I can read and edit a
focused part of a large document without scrolling through the whole thing.

**Why this priority**: This is the core request and is useful on its own,
independent of filters or settings.

**Independent Test**: In a workspace with a document containing a tree node
that has sub-items, trigger "Open as document" on that node and confirm a
document view opens containing exactly that node and its descendants.

**Acceptance Scenarios**:

1. **Given** a tree node that contains sub-elements, **When** the user looks
   at it in the explorer, **Then** it offers an "Open as document" action
   (inline button and context menu).
2. **Given** a tree node without sub-elements, **When** the user looks at it,
   **Then** no "Open as document" action is offered for it.
3. **Given** the user triggers "Open as document" on a section node, **When**
   the view opens, **Then** it shows only that node and all of its
   descendants, in document order, with the same block layout, markers and
   actions as a full-document view, and its tab title identifies the section.
4. **Given** a section view is open, **When** the user edits and saves,
   **Then** only the items shown in the section are changed, with the same
   save behaviour as the full-document view.
5. **Given** a section view is already open for the same section, **When**
   the user opens it again, **Then** the existing tab is revealed and no
   second tab is created.
6. **Given** a document view where the user scrolled down and placed the cursor
   in a later block, **When** the editor loses focus (another editor, panel or
   window is used) and the user clicks into it again, **Then** the cursor,
   selection and scroll position are exactly as left; the view does not jump to
   the start.

---

### User Story 2 - Open filter results as a document view (Priority: P2)

As a requirements engineer, I want to open all items found by a notebook
filter in the document view, so that I can read and edit a query result like a
document.

**Why this priority**: Extends the document view to a second source of items;
valuable but builds on the scope mechanism of Story 1.

**Independent Test**: Run a filter cell that matches several items and trigger
"Open as document" on its result; confirm a document view opens listing
exactly the matched items.

**Acceptance Scenarios**:

1. **Given** a filter cell with a non-empty result, **When** the user triggers
   "Open as document" on that result, **Then** a document view opens showing
   exactly the matched items.
2. **Given** a filter result view, **When** compared with a section view,
   **Then** block layout, markers, actions, editing, saving, validation and
   behave identically.
3. **Given** items of the filter result are already open in another document
   view, **When** the user opens the result, **Then** it opens normally and
   shows those items too.
4. **Given** a filter that matches nothing, **When** the user tries to open it
   as a document, **Then** no view opens and the user is told the result is
   empty.
5. **Given** a filter result view is open and the filter is re-run, **When**
   the matched set changes, **Then** the open view keeps showing the items it
   was opened with (it is a snapshot, not a live query).

---

### User Story 3 - Choose which item fields are editable in the view (Priority: P3)

As a user, I want to configure in the extension settings which fields of an
item's YAML header appear in the document view for editing, so that I can
tailor the view to my project's needs.

**Why this priority**: A customisation on top of working views; the views are
useful with the default field set.

**Independent Test**: Add a field name to the settings list, reopen a document
view, and confirm the field is shown for editing and its edits are saved.

**Acceptance Scenarios**:

1. **Given** the setting is at its default, **When** a document view opens,
   **Then** it shows the same fields as it does today.
2. **Given** the user adds field names to the setting list, **When** a view is
   (re)opened, **Then** each listed field is shown for every item that has it
   and can be edited and saved.
3. **Given** the list names a field that an item does not have, **When** the
   view opens, **Then** the field is omitted for that item without error.
4. **Given** the list contains a protected field (such as level,
   links or review state, which are managed by dedicated commands), **When**
   the view opens, **Then** the entry is ignored and the user is told which
   entry was ignored.
5. **Given** the setting is changed while a view is open, **When** the user
   reopens the view, **Then** the new field selection applies.

---

### User Story 4 - Reload a view from disk by hand (Priority: P3)

As a user with several views of the same items open, I want one button at the
top of every document view that reloads its items from disk, so that I can
bring a view up to date whenever I want without closing and reopening it.

**Why this priority**: Views refresh themselves after saves and disk changes;
the button is a manual safety valve, useful but not essential.

**Independent Test**: Change an item file outside the view, click the button
at the top of the view, and confirm the view shows the new text.

**Acceptance Scenarios**:

1. **Given** any document view (document, section or filter result), **When**
   the user looks at its first line, **Then** a single "Reload from disk"
   action is offered there.
2. **Given** a view without unsaved edits, **When** the user clicks the action,
   **Then** the view shows the current content of its items from disk
   immediately.
3. **Given** a view with unsaved edits, **When** the user clicks the action,
   **Then** the user is asked to discard the edits or keep them; discarding
   reloads the view, keeping changes nothing.
4. **Given** a section or filter view whose items changed on disk, **When** the
   view is reloaded, **Then** it still shows only its own scope (items deleted
   on disk disappear, items created in the view stay).

---

### Edge Cases

- A section node whose items are partly inactive: only active items appear, as
  in the full-document view.
- A filter result that contains items from several documents: all appear,
  grouped in their document order, and the view is identified as a filter
  result.
- The same item is open in two views and is edited in one and saved: the
  other view follows the existing consistency-with-disk behaviour.
- A filter result that contains an item and its descendant: both appear once.
- An item shown in a section is deleted, moved or re-levelled on disk while
  the view is open: the existing consistency-with-disk behaviour of the
  document view applies.
- The settings list is empty or contains duplicates: empty means default
  fields only; duplicates are shown once.
- A view is refreshed while the cursor is in a block that still exists (after
  its own save, or after another view saved a shared item): the cursor stays
  in that block at the same offset and the scroll position does not jump.
- Reload while the server is unavailable: the view keeps its current text and
  an error names the reason.
- The same section is requested twice in quick succession: only one view
  opens.

## Requirements *(mandatory)*

### Functional Requirements

**Sections**

- **FR-001**: Every tree node that has sub-elements MUST offer an "Open as
  document" action; nodes without sub-elements MUST NOT.
- **FR-002**: Opening a section MUST show the node and all of its descendants
  as one document view, using the same block format as the full-document view.
- **FR-003**: A section view's tab title MUST identify the document and the
  section it shows.
- **FR-004**: Editing, saving, validation and all actions in a section view
  MUST behave exactly as in the full-document view and MUST affect only the
  items shown.
- **FR-005**: Opening a view whose scope equals an already open view MUST
  reveal the existing tab instead of opening a second one. Views with
  different scopes MAY show the same items simultaneously.
- **FR-018**: A document view of any kind MUST keep its cursor, selection and
  scroll position when its editor loses and regains focus, and when its text is
  refreshed while the block holding the cursor still exists; it MUST NOT reset
  to the first line.

**Manual reload**

- **FR-019**: Every document view MUST offer exactly one "Reload from disk"
  action on its first line; it MUST be the same for document, section and
  filter-result views.
- **FR-020**: Reloading a view without unsaved edits MUST replace its content
  with the current content of its items from disk; with unsaved edits it MUST
  first ask whether to discard them and MUST leave the view untouched if the
  user keeps them.
- **FR-021**: A failed reload MUST leave the view as it is and report the
  reason.

**Filter results**

- **FR-009**: A filter result MUST offer an "Open as document" action when it
  contains at least one item.
- **FR-010**: Opening a filter result MUST show exactly the matched items as a
  document view that behaves identically to a section view (FR-002 to FR-005).
- **FR-011**: An empty filter result MUST NOT open a view and MUST tell the
  user the result is empty.
- **FR-012**: A filter result view MUST be a snapshot of the matched items at
  the time of opening.

**Field configuration**

- **FR-013**: The extension MUST provide a setting holding a list of item
  header field names to show for editing in document views.
- **FR-014**: With the default setting, document views MUST show the same
  fields as before this feature.
- **FR-015**: Each configured field MUST be shown for every item that has it
  and edits MUST be saved back to that item.
- **FR-016**: Fields an item does not have, and names no item carries, MUST be
  omitted silently; protected fields in the list MUST be ignored and the user
  told which entries were ignored.
- **FR-017**: A changed setting MUST apply the next time a view is opened.

### Key Entities

- **View scope**: The set of items one document view shows: a whole document,
  a section (node plus descendants) or a filter result snapshot.
- **Section**: A tree node with sub-elements together with all its
  descendants.
- **Displayed-fields list**: The user-configured list of item header field
  names shown for editing.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can open any section from the explorer in one action
  (one click) and see only that section's items.
- **SC-002**: A user can open the result of a filter as an editable document
  in one action from the result.
- **SC-003**: Section, filter-result and full-document views are
  indistinguishable in editing, saving and validation behaviour (all existing
  document-view acceptance checks pass for each scope).
- **SC-004**: A user can add a field to the displayed-fields list and see it
  in a reopened view within one minute, without reading documentation beyond
  the setting's description.

## Assumptions

- "Subelements" means the child items shown beneath a node in the explorer
  tree; a section is that node plus all descendants at any depth.
- The same item may be open in any number of document views at once.
- The filter-result action lives on the notebook cell output that lists the
  matched items.
- Protected fields (level, links, review state, active/normative flags
  already handled by dedicated commands) are not made editable by the new
  setting.
- Fields are edit-only in the view: only fields an item already has are shown,
  and a field cannot be added to or removed from an item there.
- The default displayed fields are those the document view shows today.
- The existing document view feature (019) is the baseline; this feature only
  widens what a view can contain and adds the field setting.
