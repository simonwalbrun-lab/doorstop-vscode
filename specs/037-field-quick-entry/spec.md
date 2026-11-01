# Feature Specification: Field Quick Entry

**Feature Branch**: `add_testreporting` (no separate feature branch)

**Created**: 2026-11-01

**Status**: Draft

**Input**: User description: "as a user I want to be able to quickly fill fields in the yml or markdown files from selectable lists or generated like the current date and time. This settings are common for all users therefore they should by default land in .vscode settings.json. As a user I want to be able to configure that selectors. I want to be able to select which field gets a codelense for a entry of the current date and time in the format YYYY-MM-DD:hh-mm. I also want to define fields and allowed list values for some kind of quick entry. like a dropdown menu. e.g. status: ['Draft','Approved', 'Obsolete'], tester: ['Mister A', 'Madame B',...]. further more it shall be possible to activate a option which does the following. If I have e.g. in some item a field the extension shall generate a set of the entries and allow the user to choose from that set during entering values into that field in some other item."

**Revisions**: 2026-11-01 — date/time is offered as a suggestion instead of a
CodeLens; date/time uses the ISO 8601 format `YYYY-MM-DDThh:mm`; values used
in other items is one on/off option (default on) and never mixes with a
configured value list. Later on 2026-11-01 — added the document view (User
Story 5) and value lists in filter notebooks (User Story 6). After analysis
— a value is written unquoted only when it starts with a letter and holds
nothing YAML treats specially (so dates and numbers are quoted); FR-011
scoped; FR-019 inserts plain text.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pick a field value from a configured list (Priority: P1)

As a requirements engineer editing an item, I want a dropdown of the values my
team agreed on for a field (e.g. `status: Draft | Approved | Obsolete`,
`tester: Mister A | Madame B`), so I enter the right value without typing it
and without typos that break filters and reports.

**Why this priority**: Consistent field values are what filters, reports and
reviews rely on. It is the most frequent manual entry and the core of the
request.

**Independent Test**: Put a value list for `status` into the workspace
settings, open an item, place the cursor after `status:` and confirm the
three values are offered and the chosen one is written as the field value.

**Acceptance Scenarios**:

1. **Given** the workspace settings define the values `Draft`, `Approved`,
   `Obsolete` for `status`, **When** the user places the cursor in the value
   position of `status:` in a `.yml` item or the YAML header of a `.md` item
   and types a space after the colon or presses Ctrl+Space, **Then** this
   feature offers exactly those values, in the configured order.
2. **Given** the suggestions are shown, **When** the user picks `Approved`,
   **Then** the field reads `status: Approved` and the rest of the file is
   unchanged.
3. **Given** the field already has a value, **When** the user picks a
   value, **Then** the old value is replaced, not appended to.
4. **Given** a field that is a list (e.g. `tester:` followed by dash entries),
   **When** the user writes a new list entry under it, **Then** the same
   values are offered for that entry.
5. **Given** a configured value contains characters that YAML treats
   specially (e.g. `Mister A: lead`), **When** it is picked, **Then** it is
   written quoted so the item stays valid.
6. **Given** other items use `status: Aproved` (a typo), **When** the user
   enters `status` in another item, **Then** this feature offers only the
   three configured values, not `Aproved`.

---

### User Story 2 - Insert the current date and time from the suggestions (Priority: P2)

As a tester recording when I ran a test or reviewed an item, I want the date
fields my team chose (e.g. `tested_on`) to offer the current date and time as
the first suggestion, so I never type a timestamp by hand.

**Why this priority**: A frequent, error-prone entry, but limited to the few
fields that hold a timestamp.

**Independent Test**: Configure `tested_on` as a date/time field, open an
item, place the cursor after `tested_on:`, accept the first suggestion and
confirm the field holds the current local date and time as
`YYYY-MM-DDThh:mm`.

**Acceptance Scenarios**:

1. **Given** `tested_on` is configured as a date/time field, **When** the
   user places the cursor in the value position of `tested_on:` and opens
   suggestions, **Then** the first suggestion is "Current date and time" and
   shows the value it will insert.
2. **Given** that suggestion is accepted at 2026-11-01 09:05 local time,
   **When** the edit is applied, **Then** the line reads
   `tested_on: '2026-11-01T09:05'` (quoted, so it stays text) and any
   previous value is replaced.
3. **Given** `tested_on` also has a value list, **When** suggestions are
   shown, **Then** the current date and time comes first, followed by the
   listed values.
4. **Given** the user removes `tested_on` from the date/time fields setting,
   **When** the setting is saved, **Then** the date suggestion is no longer
   offered for it, without a reload.

---

### User Story 3 - Offer values already used in other items (Priority: P3)

As a requirements engineer, I want fields that nobody keeps a list for (e.g.
`component`) to suggest the values already used for that field in other
items, so they stay consistent without anyone maintaining a list.

**Why this priority**: Builds on User Story 1's dropdown and saves keeping a
list current, but a maintained list already covers the fields that matter
most.

**Independent Test**: With the option on (the default), give two items the
`component` values `UI` and `Server`, open a third item, write `component:`
and confirm `UI` and `Server` are offered.

**Acceptance Scenarios**:

1. **Given** the option is on and items in the repository use `component:
   UI` and `component: Server`, **When** the user enters a value for
   `component` in another item, **Then** `Server` and `UI` are offered, each
   once, in alphabetical order.
2. **Given** some items use `component` as a list, **When** values are
   offered, **Then** each list entry counts as a separate value.
3. **Given** the user saves an item with a new value `Database` for
   `component`, **When** they next enter `component` in another item,
   **Then** `Database` is offered.
4. **Given** `status` has a configured value list, **When** the user enters
   `status`, **Then** values used in other items are not offered for it.
5. **Given** the user switches the option off, **When** they edit a field
   without a value list, **Then** no used values from other items are
   offered.

---

### User Story 4 - Configuration shared with the team (Priority: P2)

As a team lead, I want these value lists and field choices to live in the
workspace settings (`.vscode/settings.json`) by default, so they are versioned
with the repository and everyone gets the same lists.

**Why this priority**: The lists are only useful if the whole team uses the
same ones; otherwise each user's lists drift.

**Independent Test**: Commit a `.vscode/settings.json` with a value list,
open the repository on a second machine without any user settings, and
confirm the same suggestions appear.

**Acceptance Scenarios**:

1. **Given** the settings are defined in `.vscode/settings.json`, **When**
   another user opens the workspace, **Then** they get the same suggestions
   with no further setup.
2. **Given** the user opens the Settings editor, **When** they search for
   the quick-entry settings, **Then** all three settings are found under the
   Doorstop section with a description and an example.
3. **Given** a value list is changed in the settings, **When** the file is
   saved, **Then** the next suggestion list reflects the change without a
   reload.

---

### User Story 5 - Same suggestions in the document view (Priority: P2)

As a reviewer going through a document in the document view, I want the
field lines of each item to offer the same suggestions as the item files, so
I can set `status` or `tester` on many items in a row without opening each
file.

**Why this priority**: The document view is where several items are edited
in one go; without the suggestions there, the lists only help one item at a
time.

**Independent Test**: Configure a value list for `status`, show `status` in
the document view, open a document view, place the cursor after `status:` in
an item's field block and confirm the configured values are offered and the
chosen one is saved to that item.

**Acceptance Scenarios**:

1. **Given** `status` has a value list and is shown in the document view,
   **When** the user places the cursor in the value position of `status:` in
   an item's field block, **Then** the configured values are offered, as in
   User Story 1.
2. **Given** `tested_on` is a date/time field shown in the document view,
   **When** the user opens suggestions on its value, **Then** "Current date
   and time" is offered first, as in User Story 2.
3. **Given** a field without a value list, **When** the user edits it in the
   document view, **Then** values used in other items are offered, as in
   User Story 3.
4. **Given** the user accepts a suggestion, **When** the document view
   saves, **Then** only that field of that item changes.
5. **Given** the cursor is in an item's text, outside its field block,
   **When** the user types, **Then** no suggestions from this feature
   appear.

---

### User Story 6 - Value lists in filter notebooks (Priority: P2)

As a requirements engineer writing a filter or a batch edit, I want the
value suggestions for a field with a value list to be that list, so a batch
edit cannot spread a typo such as `Aproved` to many items at once.

**Why this priority**: A batch edit writes to many items in one step, so a
wrong value there does the most damage; the value lists must apply there
too.

**Independent Test**: Configure a value list for `status`, let one item use
`status: Aproved`, open a filter notebook, write a batch edit `set status`
and confirm only the configured values are offered; write `status ==` and
confirm `Aproved` is offered after the configured values.

**Acceptance Scenarios**:

1. **Given** `status` has a value list and an item uses `status: Aproved`,
   **When** the user writes a value for `status` in a batch edit operation
   that writes it (`set`, `add`, `appendEntry`), **Then** this feature
   offers only the configured values, in the configured order.
2. **Given** the same setup, **When** the user writes a filter condition on
   `status` or a `removeEntry` value, **Then** the configured values are
   offered first, followed by `Aproved`, marked as not in the value list, so
   items with the wrong value can be found and fixed.
3. **Given** a field without a value list, **When** the user asks for its
   values in a filter notebook, **Then** the values used in other items are
   offered, as before this feature.

---

### Edge Cases

- A field name in the settings that is a protected header field (`uid`,
  `level`, `active`, `normative`, `derived`, `reviewed`, `cleared`, `links`,
  `header`, `text`) is ignored, because those fields are owned by Doorstop or
  by dedicated commands; the user is told once which names were ignored.
  Protected fields never get used values from other items either.
- A value list with duplicate or empty entries: duplicates are offered once,
  empty entries are skipped.
- A setting with the wrong shape (e.g. a value list that is a string instead
  of a list): it is ignored and the user is told which setting is invalid;
  the other settings still work.
- A date/time field never gets used values from other items, so old
  timestamps are not offered.
- Used values that are not plain text, numbers or booleans (nested maps):
  they are skipped.
- A field with more than 50 distinct used values: the first 50 in
  alphabetical order are offered; a value list is the remedy for such
  fields.
- The file is not a Doorstop item (any other `.yml` or `.md`): no
  suggestions from this feature.
- A `.md` item: suggestions only apply inside the YAML header, never in the
  Markdown body.
- The Doorstop server is not running: configured value lists and the
  date/time suggestion still work; used values from other items are not
  offered until it runs.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The extension MUST provide a setting that maps field names to
  lists of values (e.g. `{"status": ["Draft", "Approved", "Obsolete"]}`).
- **FR-002**: When the cursor is in the value position of a field that has a
  value list, in a `.yml` item or the YAML header of a `.md` item, the
  editor MUST offer that field's listed values as suggestions, in the
  configured order.
- **FR-003**: The same suggestions MUST be offered for a new or edited entry
  of a list-valued field (an entry line under the field).
- **FR-004**: Accepting a suggestion MUST replace the field's current value
  (or the current list entry) and MUST NOT change any other part of the
  file.
- **FR-005**: An inserted value MUST be read back by Doorstop as exactly the
  same text. It MUST be written unquoted only when it starts with a letter,
  is not a word YAML reads as yes/no/null, and contains no colon before a
  space, tab or the end, no `#` after a space or tab, and no leading or
  trailing space; otherwise it MUST be written in single quotes.
- **FR-006**: The extension MUST provide a setting listing the fields that
  hold a date and time.
- **FR-007**: For a field listed in the FR-006 setting, the first suggestion
  MUST be "Current date and time", showing the value it inserts: the current
  local date and time in the ISO 8601 format `YYYY-MM-DDThh:mm` (24-hour
  clock, zero-padded, no time zone), e.g. `2026-11-01T09:05`.
- **FR-008**: A field listed in the FR-006 setting that also has a value
  list MUST offer the date and time first, followed by its listed values.
- **FR-009**: The extension MUST provide an on/off setting for offering
  values used in other items; it MUST be on by default.
- **FR-010**: When the FR-009 setting is on, a non-protected field that has
  no value list and is not a date/time field MUST offer the distinct plain
  values (text, number, boolean) that field has in any item of the
  repository, each list entry counted separately, in alphabetical order, at
  most 50 per field (the first 50 alphabetically).
- **FR-011**: In item files and the document view, a field with a value
  list or listed as a date/time field MUST NOT offer values used in other
  items (filter notebooks: FR-023).
- **FR-012**: Values used in other items MUST reflect item changes saved to
  disk without a reload.
- **FR-013**: Changes to any of the three settings MUST take effect for the
  next suggestion list without a reload.
- **FR-014**: All three settings MUST be definable at workspace level
  (`.vscode/settings.json`), and the setting descriptions MUST recommend
  defining them there; any value the extension writes to these settings
  MUST go to the workspace settings.
- **FR-015**: Protected header fields (`uid`, `level`, `active`,
  `normative`, `derived`, `reviewed`, `cleared`, `links`, `header`, `text`)
  MUST be ignored in the FR-001 and FR-006 settings, and the user MUST be
  told once per settings change which names were ignored.
- **FR-016**: A setting with an invalid shape MUST be ignored and reported
  to the user by name, while the other settings keep working.
- **FR-017**: Suggestions from this feature MUST appear only in Doorstop
  item files and, for `.md` items, only inside the YAML header.
- **FR-018**: A field without a value list, not listed as a date/time field,
  and with the FR-009 setting off MUST NOT get value suggestions from this
  feature.
- **FR-019**: In the document view, the value position of a field line in
  an item's field block MUST offer the same suggestions, under the same
  rules, as the same field in an item file (FR-002, FR-004, FR-007,
  FR-008, FR-010, FR-011, FR-018). Values are inserted as plain text without
  quotes, because the view saves field values as text and Doorstop quotes
  them when it writes the item.
- **FR-020**: In the document view, suggestions from this feature MUST
  appear only inside an item's field block.
- **FR-021**: In filter notebooks, for a field that has a value list, the
  value suggestions this feature gives for batch edit operations that write
  a value (`set`, `add`, `appendEntry`) MUST be exactly its listed values,
  in the configured order.
- **FR-023**: In filter notebooks, for a field that has a value list, the
  value suggestions of filter conditions and of `removeEntry` MUST be its
  listed values in the configured order, followed by the values used in
  other items that are not in the list, each marked as not in the value
  list.
- **FR-022**: In filter notebooks, value suggestions for a field without a
  value list MUST stay as they were before this feature.

### Key Entities

- **Value list**: a field name and the ordered values a team agreed on for
  it; defined in settings; shared via the workspace. Its values are the only
  ones offered for that field.
- **Date/time field**: a field name whose value is a timestamp filled from
  the current local time.
- **Used values**: the distinct values a field already has across all items,
  offered for fields with no value list.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user sets a listed field value with at most 3 keystrokes or
  clicks after placing the cursor behind the field name.
- **SC-002**: A user fills a date/time field with at most 2 keystrokes or
  clicks after placing the cursor behind the field name.
- **SC-003**: In a repository with 2,000 items, suggestions appear within 1
  second of the user asking for them.
- **SC-004**: After a team commits value lists to the workspace settings, a
  second user gets identical suggestions with zero setup steps.
- **SC-005**: Every value inserted from a suggestion leaves the item readable
  by Doorstop (no YAML errors introduced) in 100% of cases, including values
  with YAML special characters.

## Assumptions

- The values in a value list are suggestions, not enforced: a user can still
  type a value that is not in the list, and no warning is raised. Warning
  about values outside the list is a possible follow-up, out of scope here.
- The date/time format is ISO 8601 to the minute, `YYYY-MM-DDThh:mm`, in
  local time without a time zone; a configurable format is out of scope.
- The date/time suggestion fills a field the item already has; adding a
  missing field to an item is out of scope.
- Settings are edited in `settings.json` or the Settings editor; no
  dedicated configuration dialog is provided. Where the Settings editor
  saves a change depends on the tab the user picks; the descriptions point
  to the Workspace tab.
- In the document view (spec 019) suggestions apply to the fields it shows,
  i.e. those listed in its fields setting; showing more fields is out of
  scope.
- In filter notebooks (specs 022, 036) only the value lists change the
  suggestions; the date/time suggestion is not offered there, because a
  timestamp fixed when the cell is written is rarely what a filter or a
  rerun batch edit wants.
- Values used in other items come from the same source as the filter
  notebook autocomplete (spec 022 / 036), which already collects each
  custom field's distinct values, keeps them current as items change, and
  limits them to 50 per field; no separate collection is introduced.
