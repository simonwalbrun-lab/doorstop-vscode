# Feature Specification: Filter Notebooks (MVP)

**Feature Branch**: `022-filter-notebooks`

**Created**: 2026-10-04

**Status**: Draft

**Input**: User description: "I want to add filters to the extension. The filters shall be somehow like the bases filters in obsidian, so including nested filtering, filtering for attributs and so on. I want to use the notebooks api for that. so one filter is one cell and outputs the the result as a table with clickable links. The filter shall only include doorstop elements. first we build a MVP."

## Clarifications

### Session 2026-10-04

- Q: When a filter checks related items, which relationships should it be able to follow? → A: Direct children and direct parents ("has child where …", "has parent where …"); no transitive descendant/ancestor conditions.
- Q: What should a newly created filter notebook contain? → A: One text cell with a short explanation and an operator cheat-sheet, followed by one runnable example filter cell. (Refined by FR-002/US1-6: one simple and one complex example filter cell.)
- Q: Where should the user choose which properties appear as columns in a cell's result table? → A: Inside the cell, Bases-style: a cell may be a mapping with `filters:` (the filter) and `order:` (list of attribute names shown as columns); a cell holding only a filter keeps the default columns.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run a filter cell and get a table of matching items (Priority: P1)

As a requirements engineer, I want to open a filter notebook, write a filter
in a cell, run it, and see every Doorstop item that matches as a table below
the cell, so I can answer questions like "which requirements in REQ are not
reviewed yet?" without scrolling through documents.

**Why this priority**: This is the core loop of the feature. Without it
nothing else has value; with only this story the feature is already useful.

**Independent Test**: In a project with items in two documents, create a
filter notebook, write a cell that matches the items of one document, run it;
confirm the table lists exactly those items.

**Acceptance Scenarios**:

1. **Given** an open filter notebook, **When** the user runs a cell whose
   filter is `document == "REQ"`, **Then** the cell output is a table with one
   row per item in document REQ and no rows from other documents.
2. **Given** a cell with a single condition on a standard item attribute
   (for example `reviewed == false`), **When** it runs, **Then** only items
   whose attribute matches are listed.
3. **Given** a filter that matches nothing, **When** it runs, **Then** the
   output states that no items matched instead of showing an empty table.
4. **Given** a notebook with several cells, **When** the user runs one cell,
   **Then** only that cell's output changes; each cell is an independent
   filter.
5. **Given** a run finished, **When** the user looks at the output, **Then**
   the output also shows how many items matched.
6. **Given** the user creates a new filter notebook from the command palette,
   **When** it opens, **Then** it contains a text cell explaining how filters
   work (with an operator cheat-sheet) followed by a simple and a complex
   example filter cell, and running either example without edits produces a
   result table (or the "no items matched" message) instead of an error.

---

### User Story 2 - Open an item from the result table (Priority: P1)

As a user reading a result table, I want to click an item's UID and land in
that item's file, so the table is a starting point for work, not a dead end.

**Why this priority**: The user explicitly asked for clickable links; a table
of UIDs you then have to search for by hand loses most of the value.

**Independent Test**: Run any filter that returns at least one item; click a
UID in the table; confirm the item's file opens in the editor.

**Acceptance Scenarios**:

1. **Given** a result table, **When** the user clicks an item's UID, **Then**
   that item's file opens in the editor.
2. **Given** an item was deleted after the cell ran, **When** the user clicks
   its UID, **Then** the user sees a message that the item no longer exists;
   nothing else breaks.

---

### User Story 3 - Combine conditions with nested AND / OR / NOT (Priority: P2)

As a user with a precise question, I want to combine conditions with "all of",
"any of" and "none of" groups, nested inside each other, the way Obsidian
Bases filters work, so one cell can express questions like "in REQ or SYS,
and not reviewed, and not inactive".

**Why this priority**: Nesting is what makes the filter more than a search
box, and it is explicitly part of the request. It builds on Story 1 and can
ship right after it.

**Independent Test**: Write a cell with an "all of" group containing a
condition and an "any of" sub-group of two conditions; confirm the result
equals the hand-computed set.

**Acceptance Scenarios**:

1. **Given** an "all of" group with two conditions, **When** it runs, **Then**
   only items matching both conditions are listed.
2. **Given** an "any of" group with two conditions, **When** it runs, **Then**
   items matching at least one condition are listed.
3. **Given** a "none of" group, **When** it runs, **Then** items matching any
   condition in the group are excluded.
4. **Given** groups nested at least three levels deep, **When** the cell runs,
   **Then** the result follows standard boolean logic for the nesting.

---

### User Story 4 - Filter on custom attributes and related items (Priority: P2)

As a team that adds its own attributes to items (for example `status`,
`priority`, `owner`), I want to filter on those too, on an item's links
(for example "items linking to REQ001"), and on its direct children or
parents (for example "items that have a child with `status == "approved"`"),
so the filter covers how my project actually works and not only Doorstop's
built-in fields.

**Why this priority**: "Filtering for attributes" is part of the request, and
custom attributes are the main reason teams want ad-hoc queries. It requires
the extension to see attributes it does not read today, so it follows the
core loop.

**Independent Test**: Give two items a custom attribute `status` with
different values; run `status == "approved"`; confirm only the matching item
is listed.

**Acceptance Scenarios**:

1. **Given** items with a custom attribute, **When** a cell filters on that
   attribute's value, **Then** only items with that value are listed.
2. **Given** some items lack the attribute, **When** a cell filters on it,
   **Then** those items do not match (and do not cause an error).
3. **Given** a cell filters on links containing a given UID, **When** it runs,
   **Then** exactly the items linking to that UID are listed.
4. **Given** REQ001 has a child with `status == "approved"` and REQ002 has
   only children with other statuses, **When** a cell filters on "has child
   where `status == "approved"`", **Then** REQ001 is listed and REQ002 is not.
5. **Given** SYS items link to parents in REQ, **When** a cell filters on
   "has parent where `document == "REQ"`", **Then** exactly the items with at
   least one parent in REQ are listed.
6. **Given** a "has child where …" condition whose inner condition is itself a
   nested `and` / `or` / `not` group, **When** it runs, **Then** a child counts
   as matching only if it satisfies the whole inner group.

---

### User Story 5 - Save and reopen filter notebooks (Priority: P3)

As a user, I want to save a filter notebook as a file in my project and reopen
it later, so useful filters can be reused and shared through version control.

**Why this priority**: Reuse matters, but the feature is already valuable for
one-off questions without it. It largely comes for free with the editor's
notebook handling.

**Independent Test**: Create a notebook with two cells, save it, close it,
reopen it; confirm both cells' filter text is unchanged and re-runnable.

**Acceptance Scenarios**:

1. **Given** a new filter notebook with cells, **When** the user saves it,
   **Then** a file is written into the workspace.
2. **Given** a saved filter notebook, **When** the user reopens it, **Then**
   all cells and their filter text are restored.
3. **Given** a saved notebook is reopened, **When** the user runs a cell,
   **Then** the result reflects the current project state, not the state at
   save time.

---

### User Story 6 - Choose which properties the table shows (Priority: P2)

As a user answering a specific question ("which tests are still draft, and who
owns them?"), I want to choose the table's columns in the cell itself, the way
an Obsidian Bases view lists its properties, so the result shows exactly the
attributes I care about, including custom ones.

**Why this priority**: The default columns (document, level, header) rarely
answer questions about custom attributes such as `status` or `owner`. Builds
on Story 1's table.

**Independent Test**: Run a cell with `filters: document == "TST"` and
`order: [status, header]`; confirm the table has the columns UID, status,
header in that order with each item's values.

**Acceptance Scenarios**:

1. **Given** a cell with `filters:` and `order: [status, level]`, **When** it
   runs, **Then** the table columns are UID, status, level, in that order.
2. **Given** a cell holding only a filter (no `order:`), **When** it runs,
   **Then** the table shows the default columns UID, Document, Level, Header.
3. **Given** `order:` names an attribute some items lack, **When** the cell
   runs, **Then** those items show an empty cell in that column; no error.
4. **Given** `order:` lists `uid`, **When** the cell runs, **Then** UID still
   appears exactly once, as the first, clickable column.
5. **Given** `order:` is not a list of attribute names (e.g. `order: 5`),
   **When** the cell runs, **Then** an error output explains the expected
   shape; no table.

---

### Edge Cases

- **Syntax error in a cell**: the run fails with an error output naming the
  problem (and the line where possible); other cells are unaffected.
- **Unknown attribute name**: treated as "absent" on every item, so the
  condition matches nothing; no crash. (Lets users filter on custom attributes
  that only some items have.)
- **Type mismatch** (e.g. comparing a text attribute with a number): the
  condition does not match that item; no crash.
- **Server not running / not reachable**: the cell output shows an error
  telling the user the Doorstop server is unavailable; no partial or stale
  table is shown as if it were current.
- **Empty cell**: running it shows a short hint instead of listing all items.
- **Very large result** (thousands of items): the table still renders and
  stays usable; the match count is always shown.
- **Item without children / parents**: never matches "has child where …" /
  "has parent where …"; wrapped in `not`, it always matches.
- **Link to a missing item**: a link whose target does not exist is ignored
  by "has parent where …"; no crash.
- **List values in a column** (e.g. `links`): shown comma-separated.
- **Long text in a column**: shown as its first 80 characters.
- **Inactive items**: included like any other item; users exclude them with an
  explicit condition (`active == true`).
- **Non-Doorstop files**: never appear in results, regardless of the filter.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The extension MUST provide a filter notebook type holding two
  kinds of cells: filter cells, each holding exactly one filter and runnable
  independently, and text cells for notes, which are never run.
- **FR-002**: Users MUST be able to create a new filter notebook from the
  command palette and from the Doorstop Commands panel in the sidebar. A new
  notebook MUST start with (1) a text cell explaining
  how a filter is written and run, listing the available operators, the
  standard attribute names, the `and` / `or` / `not` groups and the "has child
  where" / "has parent where" conditions, and (2) two example filter cells: a
  simple one (a single condition) and a complex one showing nested `and` /
  `or` / `not`, a method, a "has child where" condition and an `order:` column
  list. Both use only standard attributes, so they run without error in any
  Doorstop project.
- **FR-003**: Running a cell MUST evaluate its filter against every Doorstop
  item in the project, as reported by the Doorstop server, and nothing else.
- **FR-004**: A cell's output MUST be a table with one row per matching item,
  plus the total number of matches. UID is always the first column. The other
  columns are those listed in the cell's `order:` (FR-015); without `order:`
  they are document prefix, level, and header (or the start of the text when
  there is no header).
- **FR-005**: Each UID in the result table MUST be a clickable link that opens
  that item's file in the editor.
- **FR-006**: Filters MUST support conditions on standard item attributes:
  UID, document prefix, level, header, text, ref, active, normative, derived,
  reviewed, and links.
- **FR-007**: Filters MUST support conditions on custom attributes stored in
  item files.
- **FR-007a**: Filters MUST support related-item conditions "has child where
  …" and "has parent where …": the item matches when at least
  one of its direct children (items linking to it) or direct parents (items it
  links to) matches the inner filter. The inner filter MAY be any filter,
  including nested groups and further related-item conditions. Transitive
  (descendant / ancestor) conditions are out of scope.
- **FR-008**: Conditions MUST support at least: equals, not equals, contains
  (text and lists), starts with, is empty / is not empty, and greater / less
  than for numbers and levels.
- **FR-009**: Filters MUST support "all of" (AND), "any of" (OR) and "none of"
  (NOT) groups, nestable to any depth, with the same meaning as Obsidian Bases
  filter groups.
- **FR-010**: The filter syntax MUST follow the shape of Obsidian Bases
  filters (named `and` / `or` / `not` groups holding condition expressions),
  so users who know Bases can read and write it without new learning.
- **FR-011**: A filter that cannot be parsed MUST produce an error output in
  that cell describing the problem; it MUST NOT affect other cells.
- **FR-012**: When the Doorstop server is unavailable or returns an error, the
  cell MUST show an error output saying so, and MUST NOT show a table.
- **FR-013**: Filter notebooks MUST be saveable as workspace files and restore
  all cells on reopen.
- **FR-014**: Each run MUST use the project state at the time of the run; a
  saved notebook MUST NOT store results as if they were current.
- **FR-015**: A filter cell MAY be written as a mapping with exactly the keys
  `filters:` (required, any filter per FR-009/FR-010) and `order:` (optional,
  a list of standard or custom attribute names), mirroring an Obsidian Bases
  view. `order:` sets the table's columns after UID, in the listed order;
  `uid` in the list is ignored (it is always first). A missing value shows as
  an empty cell, a list value comma-separated, text cut to its first 80
  characters. Any other shape of `order:` MUST produce an error output.

### Key Entities

- **Filter notebook**: A file in the workspace holding an ordered list of
  filter cells and text cells. Created, saved and reopened like any other
  editor document.
- **Text cell**: Free-form notes (formatted text) inside a filter notebook;
  never run, produces no output.
- **Filter cell**: One filter expression and an optional column list
  (`order:`), plus its most recent output. Independent of other cells.
- **Filter expression**: A tree of groups (`and` / `or` / `not`) whose leaves
  are conditions. A condition either compares one item attribute against a
  value with one operator, or is a related-item condition ("has child where" /
  "has parent where") holding its own inner filter expression.
- **Doorstop item**: The thing being filtered. Has standard attributes (UID,
  document, level, header, text, ref, active, normative, derived, reviewed,
  links) and optional custom attributes.
- **Result table**: One row per matching item with a clickable UID first,
  then the cell's chosen columns (or the defaults), plus the match count.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user who has never used the feature can create a notebook,
  write a single-condition filter, and see results in under 2 minutes.
- **SC-002**: On a project with 1,000 items, a cell's result appears within
  2 seconds of running it.
- **SC-003**: For every filter in the acceptance scenarios, the result set
  matches the hand-computed expected set exactly (no missing, no extra items).
- **SC-004**: Clicking a UID in a result table opens the correct item in
  100% of cases where the item still exists.
- **SC-005**: A user familiar with Obsidian Bases can read an example filter
  with two nested groups and correctly predict its result on the first try.
- **SC-006**: Invalid filters and an unavailable server always produce an
  explanatory error in the cell; neither ever results in a crash or a silent
  empty table.

## Assumptions

- **MVP scope**: filtering, a read-only result table and per-cell column
  choice (`order:`). Sorting, grouping, formulas/computed properties, several
  views per cell and summaries (all part of Obsidian Bases) are out of scope
  for the MVP.
- **Syntax**: filters are written as text in the cell, structured like an
  Obsidian Bases `filters:` block (nested `and` / `or` / `not` lists of
  expressions such as `document == "REQ"`). A graphical filter builder is out
  of scope for the MVP.
- **Data source**: item data comes from the Doorstop server (Constitution
  Principle I). Custom attributes are not exposed by the server today, so the
  server's item data must be extended to include them; the extension does not
  read item files itself.
- **Results are not editable**: the table is for finding and navigating;
  changing items happens through existing commands and editors.
- **Item ordering**: rows are ordered by document, then by level, matching how
  items appear elsewhere in the extension.
- **Links**: a condition on `links` checks the item's own (parent) link UIDs.
  Conditions on the children or parents themselves use "has child where" /
  "has parent where" (FR-007a). "All children match" is expressed as
  `not` + "has child where" + `not …`; no separate "all" quantifier.
- **Testing**: per Constitution Principle VI, the MVP ships with at least one
  CI-run test that executes a filter against a temporary Doorstop project and
  checks the result set.
