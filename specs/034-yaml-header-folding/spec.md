# Feature Specification: YAML Header Folding

**Feature Branch**: `034-yaml-header-folding`

**Created**: 2026-10-17

**Status**: Draft

**Input**: User description: "As a user I want to be able to fold the yml header of the markdown files. There shall be a button on the doorstop treeview panel and a workspace setting which are connected and in sync. With the button I can switch between the following behaviour: - Disable folding - Enable Folding - Enable with folded as default on opening a file. This folding should also apply on the editor in editor view which is used for references and incoming and outgoing calls (aka. hierarchy view)"

**Revision**: The three modes were reduced to one on/off switch, "Fold YAML
header on open". The header can always be folded by hand. "Disable folding" was
dropped because the editor may offer its own fold for the header, which this
feature cannot switch off.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Fold the YAML header (Priority: P1)

As a requirements author, I want to fold the YAML header (the block between the
`---` lines at the top of a Markdown requirement item) so that I can read the
requirement text without scrolling past metadata.

**Independent Test**: Open a Markdown item with a header, fold and unfold it.

**Acceptance Scenarios**:

1. **Given** an open Markdown item with a header, **When** the user folds it,
   **Then** only the first header line stays visible.
2. **Given** a folded header, **When** the user unfolds it, **Then** all header
   lines are visible and the file is unchanged.

---

### User Story 2 - Header folded on open (Priority: P1)

As a requirements author reading many requirements in a row, I want headers to
be folded already when I open a file.

**Independent Test**: Switch "Fold YAML header on open" on, open an item that
is not open yet, confirm its header is folded.

**Acceptance Scenarios**:

1. **Given** the switch is on, **When** the user opens an item, **Then** its
   header is folded.
2. **Given** the switch is off, **When** the user opens an item, **Then** its
   header is unfolded.
3. **Given** the user unfolded a header, **When** they switch tabs and back,
   **Then** it stays unfolded.

---

### User Story 3 - Button and setting (Priority: P1)

As a requirements author, I want a button in the Doorstop tree view's title bar
that turns the switch on and off, kept in sync with a setting.

**Independent Test**: Click the button, check the setting changed; change the
setting, check the button changed.

**Acceptance Scenarios**:

1. **Given** either state, **When** the user clicks the button, **Then** the
   switch flips and the setting holds the new value.
2. **Given** the user edits the setting, **When** it is saved, **Then** the
   button shows the new value without a reload.

---

### User Story 4 - Peek editor (Priority: P2)

As a requirements author browsing references or the incoming/outgoing call
hierarchy, I want the header in the peek editor to behave as in a normal editor.

**Independent Test**: Switch on, open the references or call hierarchy peek on
an item that is not open yet, confirm its header is folded.

**Acceptance Scenarios**:

1. **Given** the switch is on, **When** an item is shown in a peek editor,
   **Then** its header is folded and can be unfolded.

---

### Edge Cases

- Header without a closing `---`, an empty header, or `---` not on line 1: no
  fold, no error.
- Header becomes malformed while folded: the fold disappears, content is shown.
- Turning the switch on also folds the header in files already open, unless it
  was folded automatically there before. Turning it off unfolds nothing.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST offer a fold for the YAML header of every Markdown
  Doorstop requirement item, from the `---` line on line 1 to the next `---`
  line, if at least one line lies between them.
- **FR-002**: When the switch is on, system MUST show the header folded when an
  item is opened that was not open before; when off, unfolded.
- **FR-003**: System MUST NOT fold a header again after the user unfolded it
  while the file stays open.
- **FR-004**: System MUST provide a button in the Doorstop tree view's title bar
  that flips the switch, with a different icon and tooltip for on and off.
- **FR-005**: The switch MUST be stored as a setting, default off. Button and
  setting MUST stay in sync without a reload.
- **FR-006**: FR-001 to FR-003 MUST also apply in the peek editor of references
  and of incoming and outgoing call hierarchy.
- **FR-007**: System MUST NOT fold anything in files that are not Markdown
  Doorstop requirement items.
- **FR-008**: Folding MUST NOT change the file or mark it as modified.
- **FR-009**: Button and folding MUST work without a running Doorstop server.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user switches the behaviour with one click and sees its state
  on the button.
- **SC-002**: With the switch on, every newly opened item with a valid header,
  in an editor or peek view, shows the requirement text in its first visible
  lines.
- **SC-003**: The chosen value survives a window reload or restart.

## Assumptions

- Only `.md` Doorstop items are in scope; `.yml` items have no separate header.
- The default is off, so nothing changes for users who never touch the button.
- The peek editor is the one VS Code shows for "Peek References", "Find All
  References" and the call hierarchy (spec 018).
