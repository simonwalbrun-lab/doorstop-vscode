# Feature Specification: Batch Edit Items

**Feature Branch**: `036-batch-edit-items`

**Created**: 2026-10-31

**Status**: Draft

**Input**: User description: "As a testmanager I want to be able to plan testruns. therefore I need to be able to make batch edits to sets of elements. I need to be able to collect elements by filtering them with the current filter function and than modify fields which are writen back to the items. After using the currently implementet filter to get a set of elements I want to be able to select by checkboxes which elements to include. This includes: generating from a parent element a child element with the same uid (but correct PREFIX); setting the value of a existing field; removing exsisting fields; adding new fields; appending or removing entries in item fields which are lists"

## Clarifications

### Session 2026-10-31

- Q: How does the user enter the operation and its values? → A: As an `edit:` section written in the filter cell next to `filters:`, applied to the ticked rows with an "Apply to selected" button in the result table. The edit is saved in the notebook and can be repeated for the next test run.
- Q: Do field edits chosen in the same batch also apply to newly generated children? → A: No. Generating children and editing fields are separate runs; the user filters the new children and edits them in a second run.
- Q: Constraints and options for generating children? → A: Only when all ticked items come from the same document. A `force` option overwrites existing items with the target UID; a `blank` option gives the new items the next free numbers instead of copying the parents' numbers.
- Q: What happens when files have unsaved changes? → A: (revised 2026-11-01) The batch edit does not run while any open markdown or YAML file has unsaved changes; the user is told to save or discard them first. Nothing is written.
- Q: May batch edits touch `header` and `reviewed`? → A: No, both are forbidden; reviewing stays with the existing Review command.
- Q: Does the `edit:` section get autocomplete? → A: Yes, the same way the `filters:` part does (spec 022 FR-016): keys, operation names, field names and values, from the same cached item data.

### Session 2026-11-01

- Q: May `add` create a field holding an empty list? → A: Yes, `add: {testruns: []}` (user request).
- Q: How strictly should values in an `edit:` section follow the filter style of putting text in double quotes? → A: Like the filter part: text values must be in double quotes (`"TR-1"`, levels as `"1.10"`); unquoted text is rejected; numbers and `true`/`false` stay unquoted; field names stay unquoted.
- Q: Should a date in an `edit:` section be written unquoted (stored as a real YAML date) or in double quotes (stored as text)? → A: Unquoted, stored as a real YAML date (`due: 2026-11-30`); the one exception to the quotes rule.
- Q: Should `set` also accept an empty list, so `set: {testruns: []}` clears a list field on the ticked items? → A: Yes; `set` with `[]` replaces the value with an empty list on items that have the field.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Select filtered items and set a field on all of them (Priority: P1)

As a test manager, I write a filter cell in a filter notebook with a
`filters:` section and an `edit:` section (for example "set `testrun` to
`TR-2026-11`"), run it, tick the items I want in the result table, and apply
the edit to all ticked items at once, so I can assign a set of tests to a test
run without opening each file. Because the edit is saved in the cell, I can
run the same edit again for the next test run.

**Why this priority**: Selecting a set and changing one field on it is the core
of batch editing. Every other operation reuses the same selection and the same
write-back.

**Independent Test**: In a project with three items that all have a
`testrun` field, run a filter that matches all three, untick one, set
`testrun` to a new value; confirm the two ticked item files hold the new value
and the third is unchanged.

**Acceptance Scenarios**:

1. **Given** a filter cell with an `edit:` section has run, **When** the user
   looks at the result table, **Then** every row has a checkbox, all rows
   start ticked, and one control ticks or unticks all rows at once.
2. **Given** a cell with an `edit:` section has run and some rows are ticked,
   **When** the user presses "Apply to selected", **Then** only the ticked
   items are edited; unticked items are not touched.
3. **Given** the cell's `edit:` section sets a field to a value, **When** the
   edit is applied, **Then** every ticked item that has that field holds the
   new value and every other line of the item file is unchanged.
4. **Given** a ticked item does not have the field, **When** `set` is
   applied, **Then** that item is left unchanged and listed as skipped
   ("field missing") in the result summary.
5. **Given** no row is ticked, **When** the user presses "Apply to selected",
   **Then** the user is told that nothing is selected and nothing is written.
6. **Given** the edit is about to be written, **When** the user confirms,
   **Then** they first see how many items will change and which operation will
   run, and can still cancel without any file being written.
7. **Given** a cell without an `edit:` section, **When** it runs, **Then** the
   result table looks as before this feature: no checkboxes and no "Apply to
   selected" button.
8. **Given** the cell's `edit:` section lists several field operations,
   **When** the edit is applied, **Then** they run in the listed order on each
   ticked item, and the summary reports each operation per item.

---

### User Story 2 - Add and remove fields in bulk (Priority: P2)

As a test manager, I add a new field (for example `result: open`) to all
selected test items that do not have it yet, or remove a field that is no
longer needed, so the item set matches the planned test run.

**Why this priority**: Planning a new test run usually needs a new field on
items that never had it, and cleaning up old fields afterwards.

**Independent Test**: Select two items, one with and one without a `result`
field; run `add: {result: "open"}`; confirm the item without it now has
`result: open` and the other keeps its old value. Then run `remove: result`
on both and confirm the field is gone from both files.

**Acceptance Scenarios**:

1. **Given** ticked items without the field, **When** `add` runs,
   **Then** each of them gains the field with the given value.
2. **Given** a ticked item already has the field, **When** `add` runs,
   **Then** that item keeps its old value and is listed as skipped ("field
   exists").
3. **Given** ticked items with the field, **When** `remove` runs,
   **Then** the field is removed from each of them; items without the field
   are listed as skipped.

---

### User Story 3 - Append to or remove from list fields (Priority: P2)

As a test manager, I add an entry (for example `TR-2026-11`) to a list field
(for example `testruns`) on all selected items, or remove an entry from it, so
an item can belong to several test runs.

**Why this priority**: Test items are reused across runs; list fields are how
one item records several runs.

**Independent Test**: Select two items whose `testruns` lists are `[TR-1]` and
`[TR-1, TR-2]`; `appendEntry` `TR-2`; confirm both lists end as `[TR-1, TR-2]`.
`removeEntry` `TR-1`; confirm both lists end as `[TR-2]`.

**Acceptance Scenarios**:

1. **Given** a ticked item with a list field, **When** `appendEntry` runs,
   **Then** the entry is added at the end of the list unless it is already in
   the list; in that case the item is listed as skipped ("entry exists").
2. **Given** a ticked item without the field, **When** `appendEntry` runs,
   **Then** the item gains the field as a list holding only that entry.
3. **Given** a ticked item whose list holds the entry, **When** `removeEntry`
   runs, **Then** every occurrence of that entry is removed; the field stays,
   possibly as an empty list.
4. **Given** a ticked item where the field exists but is not a list, **When**
   either list operation runs, **Then** the item is left unchanged and listed
   as skipped ("not a list").

---

### User Story 4 - Generate child items with the parent's number (Priority: P3)

As a test manager, I select requirements and generate one test item per
requirement in a child document, where each new item has the requirement's
number with the child document's prefix (for example `REQ-012` → `TST-012`)
and links to its parent, so tests and requirements line up by number.

**Why this priority**: It saves creating and linking test items one by one,
but it is only needed once per requirement; the field edits are needed for
every run.

**Independent Test**: In a project with document REQ and its child document
TST, select `REQ-001` and `REQ-003`; generate children in TST; confirm
`TST-001` and `TST-003` exist and each links to its parent.

**Acceptance Scenarios**:

1. **Given** ticked items in a document that has exactly one child document,
   **When** "generate children" runs, **Then** for each ticked item a new item
   is created in the child document whose number equals the parent's number,
   written with the child document's prefix, separator and digit count, and
   linked to the parent.
2. **Given** the parent document has several child documents, **When**
   "generate children" is applied, **Then** the child document named in the
   `edit:` section is used; if none is named, the user is told to name one and
   nothing is created.
3. **Given** the parent document has no child document, **When** "generate
   children" starts, **Then** the user is told so and nothing is created.
4. **Given** the child document already holds an item with the target UID and
   the `force` option is not set, **When** "generate children" runs, **Then**
   that item is not changed and is listed as skipped ("UID exists").
5. **Given** ticked items come from more than one document, **When** the user
   presses "Apply to selected", **Then** the user is told that all items must
   come from the same document and nothing is created.
6. **Given** children were generated, **When** the summary is shown, **Then**
   it lists the created UIDs so the user can filter them for the next edit.
7. **Given** an `edit:` section combines "generate children" with field
   operations, **When** the user presses "Apply to selected", **Then** the
   user is told these must be separate runs and nothing is written.
8. **Given** the child document already holds an item with the target UID and
   the `force` option is set, **When** "generate children" runs, **Then** that
   item is replaced by the new item (default content plus the link to the
   parent), and the summary lists it as overwritten.
9. **Given** the `force` option is set and some target UIDs exist, **When** the
   confirmation is shown, **Then** it states how many existing items will be
   overwritten, before anything is written.
10. **Given** the `blank` option is set, **When** "generate children" runs,
    **Then** the new items get the next free numbers of the child document,
    one after another in the order of the result table, instead of the
    parents' numbers; each is still linked to its parent.

---

### User Story 5 - Autocomplete while writing an edit (Priority: P2)

As a test manager writing the `edit:` section of a filter cell, I want the
same suggestions I get in the `filters:` part, so I can write an edit without
looking up operation names, field names, document prefixes or existing values.

**Why this priority**: Batch editing works without it, but a mistyped field
name silently skips every item ("field missing"), and suggestions prevent that.

**Independent Test**: In a project with a list field `testruns` holding
`TR-1` on some items, type the `removeEntry` operation for `testruns`
in an `edit:` section; confirm `testruns` is offered as field name and `TR-1`
as entry.

**Acceptance Scenarios**:

1. **Given** the top level of a filter cell, **When** the user triggers
   suggestions, **Then** `edit:` is offered next to `filters:` and `order:`
   unless the cell already has it.
2. **Given** an empty line inside `edit:`, **When** the user triggers
   suggestions, **Then** the six operation names of FR-003 are offered, and
   picking one inserts it with placeholders for its parameters.
3. **Given** the user is typing the field name of an operation, **When**
   suggestions appear, **Then** they list the custom field names found in the
   project and the standard attributes allowed by FR-012, and no forbidden
   attribute.
4. **Given** the user is typing the value of a field operation or a list
   entry, **When** suggestions appear, **Then** they list the values that
   field already has in the project.
5. **Given** the user is typing the target document of "generate children",
   **When** suggestions appear, **Then** they list the document prefixes of
   the project.
6. **Given** the user is inside a "generate children" operation, **When**
   suggestions appear, **Then** the `force` and `blank` options are offered.

---

### Edge Cases

- An open markdown or YAML file (an item file, a Document View) has unsaved
  changes when the user presses "Apply to selected": the batch edit does not
  run and the user is told to save or discard those changes first (FR-020).
  The filter notebook's own cells and untitled editors do not count.
- A ticked item was deleted or moved after the filter ran: it is listed as
  skipped ("item not found"); the other items are still edited.
- Writing one item fails (for example a read-only file): the failure is listed
  for that item, the remaining items are still processed, and items already
  written stay written.
- The field name is empty or is not a valid field name, or the `edit:`
  section names an unknown operation or misses a value: the edit does not
  start, nothing is written, and the user is told which part is wrong.
- The cell's `edit:` section is changed after the cell ran: "Apply to
  selected" uses the edit as it was when the table was produced, so what the
  user confirms matches what runs; re-running the cell picks up the change.
- Values are written like in the filter part (FR-021): `"TR-1"` is text,
  `3`, `true` and `2026-11-30` are a number, true/false and a date and are
  stored as that type. A
  level is text, so `level: "1.10"` stays 1.10. Unquoted text such as
  `testrun: TR-1` or `level: 1.10` is rejected before anything is written,
  with a message to put it in double quotes.
- The filter result is large (hundreds of items): the edit still works and
  shows progress while it runs.
- The filter cell is re-run while the user has ticked rows: the ticks are
  reset to the default (all ticked) for the new result.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a filter cell has an `edit:` section, each row of its
  result table MUST have a checkbox; all rows MUST start ticked, and one
  control MUST tick or untick all rows. A cell without an `edit:` section MUST
  render its table as before, without checkboxes.
- **FR-002**: A result table of a cell with an `edit:` section MUST have an
  "Apply to selected" button; it MUST apply that cell's edit only to the
  ticked items of that table.
- **FR-003**: A filter cell MAY hold an `edit:` section next to `filters:`
  that lists one or more operations: `set` (set field), `add` (add field),
  `remove` (remove field), `appendEntry` (append list entry), `removeEntry`
  (remove list entry), or `generateChildren` (generate children). Field
  operations run in the listed order on each item. `generateChildren` MUST
  NOT be combined with field operations in one section. An invalid section
  MUST be reported and MUST NOT write anything.
- **FR-004**: `set` MUST change the value of the named field on each
  ticked item that has it, and MUST skip items without it. The value MAY be
  an empty list (`set: {testruns: []}`), which clears a list field.
- **FR-005**: `add` MUST add the named field with the given value to
  each ticked item that does not have it, and MUST skip items that have it.
  The value MAY be an empty list (`add: {testruns: []}`), which creates a list
  field to fill later with `appendEntry`.
- **FR-006**: `remove` MUST remove the named field from each ticked item
  that has it, and MUST skip items without it.
- **FR-007**: `appendEntry` MUST add the entry at the end of the named
  list field unless it is already present; if the field is missing it MUST be
  created as a one-entry list; if the field is not a list the item MUST be
  skipped.
- **FR-008**: `removeEntry` MUST remove every occurrence of the entry
  from the named list field; items where the field is missing, not a list or
  does not contain the entry MUST be skipped.
- **FR-009**: `generateChildren` MUST only run when all ticked items come
  from the same document; otherwise nothing is created and the user is told
  why. It MUST create, for each ticked item, one new item in a child document
  of that document, numbered with the parent's number and written with the
  child document's prefix, separator and digit count, and linked to the
  parent. When the document has several child documents, the `edit:` section
  MUST name the target, otherwise nothing is created and the user is told to
  name one; when it has none, nothing is created and the user is told so.
- **FR-018**: Without the `force` option, a ticked item whose target UID
  already exists in the child document MUST be skipped ("UID exists"). With
  `force`, the existing item MUST be replaced by the new item; the summary
  MUST list it as overwritten.
- **FR-019**: With the `blank` option, new children MUST get the next free
  numbers of the child document, assigned in the order of the result table,
  instead of the parents' numbers. Because no target UID can exist then,
  `force` has no effect together with `blank`.
- **FR-010**: Before anything is written, the user MUST see the number of
  items and the operation, and, with `force`, how many existing items will be
  overwritten; the user MUST be able to cancel with no file changed.
- **FR-011**: A batch edit MUST change only the targeted field (or create only
  the new item); every other attribute of each item MUST keep its value. The
  file is written in Doorstop's own format, as by every other edit through the
  extension.
- **FR-012**: Field operations MUST be allowed on custom fields and on the
  standard attributes `active`, `normative`, `derived`, `level`, `text` and
  `ref` (set only). They MUST NOT be allowed on `uid`, `links`, `header` or
  `reviewed`; the user MUST be told why when they try.
- **FR-013**: Items that no longer exist and items that fail to write MUST be
  skipped without stopping the batch; a failure on one item MUST NOT leave
  that item's file half-written.
- **FR-020**: When any open markdown or YAML text document has unsaved
  changes as the user presses "Apply to selected", the batch edit MUST NOT
  run: nothing is sent or written, and the user MUST be told to save or
  discard those changes first. Cells of the filter notebook and untitled
  documents do not count.
- **FR-014**: After a batch edit the user MUST see a summary: how many items
  were changed, and for every skipped or failed item its UID and the reason.
- **FR-015**: A batch edit still running one second after it started MUST
  show a progress notification until it finishes.
- **FR-016**: After a batch edit, the tree view, open document views and
  problem markers MUST reflect the changed and created items without the user
  reloading anything.
- **FR-017**: The `edit:` section MUST offer autocomplete like the filter part
  (spec 022 FR-016): the `edit:` key at the top level of a cell, the
  operation names of FR-003 with placeholders for their parameters, field
  names (custom fields and the standard attributes FR-012 allows, never the
  forbidden ones), existing values of the named field, and document prefixes
  for the target and the `force` and `blank` options of "generate children".
  Suggestions MUST come from the same
  cached item data as the filter suggestions; typing MUST NOT trigger a
  server request per keystroke. Suggested text values MUST be inserted in
  double quotes (FR-021).
- **FR-021**: Values in an `edit:` section MUST be written like values in the
  filter part: text (including levels and document prefixes given as
  `document:`) in double quotes; numbers, `true`/`false` and dates
  (`2026-11-30`, stored as a date) unquoted. An unquoted text value MUST be
  rejected as an invalid edit (FR-003) with a
  message naming the value and asking for double quotes. Field names and
  operation names stay unquoted; `remove` takes field names, not values.

### Key Entities

- **Selection**: the ticked rows of one filter result table; a list of item
  UIDs. Lives only as long as that result is shown.
- **Edit section**: the `edit:` part of a filter cell; an ordered list of
  batch operations, saved in the notebook with the filter.
- **Batch operation**: one of the six operations of FR-003, with its
  parameters: field name, value or list entry, or target child document and
  the `force` and `blank` options.
- **Batch result**: per item: changed, overwritten, skipped (with reason) or
  failed (with error); for "generate children" also the created UID.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A test manager can assign 50 filtered items to a new test run
  (one field set or list entry appended) in under one minute, compared with
  opening 50 files by hand.
- **SC-002**: A batch edit of 500 items finishes in under 10 seconds on a
  typical developer machine.
- **SC-003**: In every batch edit, 100% of unticked item files are
  byte-for-byte unchanged and 100% of untargeted fields keep their values.
- **SC-004**: No batch edit ever discards unsaved text from an open editor.
- **SC-005**: Every skipped or failed item appears in the summary with a
  reason; the user never has to compare files to find out what was not
  changed.
- **SC-006**: On a project with 1,000 items, suggestions in the `edit:`
  section appear within 200 ms, the same as in the `filters:` part.

## Assumptions

- The filter notebooks and their result tables from spec 022 are the only
  place where a selection is made; there is no selection in the tree view.
- There is no undo inside the extension for a batch edit; item files are
  under version control and the user reverts with it. The confirmation step
  (FR-010) is the safeguard.
- A generated child item gets the default content of a new item in that
  document (as when adding an item by hand), plus the link to its parent; the
  parent's text is not copied.
- "Same number" means the numeric part of the UID; the child uses its own
  document's separator and digit count, so `REQ-12` can become `TST-0012`.
- Values are single values (text, number, true/false, date), except that
  `set` and `add` may write an empty list (FR-004, FR-005). Setting a filled list or a nested
  structure in one step is out of scope; list fields are changed entry by
  entry (FR-007, FR-008).
- Linking items other than through "generate children", and changing links,
  stay with the existing link commands.
