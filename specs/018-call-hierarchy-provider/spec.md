# Feature Specification: Requirement Call Hierarchy

**Feature Branch**: `018-call-hierarchy-provider`

**Created**: 2026-09-11

**Status**: Draft

**Input**: User description: "I want to a additional Call Hierarchy Provider. In the call Hierachy provider I can follow the the up and down stream realtionship of items. I want to be able to click on a icon "calls" in the tree view. this opens the editor and shows me the upstream and downstream itmes. the items shall be displays by UID:Name."

## Clarifications

### Session 2026-09-11

- Q: How should the prefix, UID and heading be arranged in each hierarchy entry's label? → A: Main label `UID: Heading`; the item's document prefix is shown as the entry's secondary/detail text beside it.
- Q: When the "outgoing" filter is pressed, which relationship is shown? → A: Outgoing = upstream (the requirements this item links to); Incoming = downstream (the requirements that link to this item).
- Q: How should the two filter icons at the top of the hierarchy view behave? → A: Like the VS Code call-hierarchy sample (microsoft/vscode-extension-samples, call-hierarchy-sample): the editor's built-in peek-style hierarchy view, with its title-bar direction icons; exactly one direction (outgoing or incoming) is shown at a time and pressing the other icon switches the whole view to that direction.
- Q: Which direction is shown when the hierarchy view first opens from the "calls" icon? → A: "Outgoing" (upstream — the requirements this item links to).
- Q: Should the hierarchy view visually mark links Doorstop flags as "suspect"? → A: No — entries are shown identically regardless of suspect state; suspect-link handling stays with the existing review features and is out of scope here.
- Amendment (post-plan, confirmed by user): the built-in view shows **one** direction icon at a time on its top line — "Show Incoming Calls" while outgoing is displayed, "Show Outgoing Calls" while incoming is displayed. Pressing it flips the direction. Wording below updated from "two icons" accordingly.
- Amendment (post-plan, confirmed by user): an unresolved entry "cannot be opened" means selecting it opens no target item — the built-in view navigates to the dangling `links:` line in the referencing file instead. FR-010 and the edge case updated accordingly.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open a requirement's hierarchy from the tree view (Priority: P1)

As a requirements author browsing the Doorstop tree view, I want a "calls"
icon on each requirement item so that one click opens that requirement in
the editor and shows me its upstream items (the requirements it links to)
and its downstream items (the requirements that link to it), all in one
in-editor hierarchy view.

**Why this priority**: This is the entry point the user explicitly asked
for. Without it the feature is not reachable from the place users spend most
of their time (the tree view), so it is the minimum viable slice.

**Independent Test**: In a workspace with a requirement that has at least one
upstream link and at least one downstream link, click the "calls" icon on
that requirement in the tree view. Confirm the requirement's file opens and a
hierarchy view appears listing its upstream and downstream items, each
labelled `UID: Heading` (prefix as detail text).

**Acceptance Scenarios**:

1. **Given** a requirement item is visible in the tree view, **When** the
   user clicks its inline "calls" icon, **Then** the requirement's file opens
   in the editor and an in-editor hierarchy view appears rooted at that
   requirement, showing the "outgoing" (upstream) direction first, with a
   single direction-switch icon on its top line (reading "Show Incoming
   Calls" while outgoing is displayed).
2. **Given** the hierarchy view is open for a requirement that links to
   parents, **When** the view is in the "outgoing" direction, **Then** the
   view shows only the upstream direction: every requirement listed under that
   item's links appears as a hierarchy entry labelled `UID: Heading` (prefix
   as detail text).
3. **Given** the hierarchy view is open for a requirement that other items
   link to, **When** the user presses the direction icon to switch to
   "incoming", **Then** the view shows only the downstream direction: every requirement whose links include
   this item appears as a hierarchy entry labelled `UID: Heading` (prefix as
   detail text).
4. **Given** the hierarchy view is open for a requirement with no links in
   either direction, **When** the user views either direction, **Then** the
   view shows an empty result (no entries) rather than an error.
5. **Given** the "calls" icon is shown in the tree view, **When** the user
   looks at a Doorstop document root node (not an individual requirement),
   **Then** no "calls" icon is offered for it.

---

### User Story 2 - Follow the chain further up or down (Priority: P1)

As a requirements author who has opened the hierarchy for one requirement,
I want to expand any listed upstream or downstream item to see *its* upstream
or downstream items in turn, so that I can trace a requirement's lineage all
the way to the top-level requirement or all the way down to the leaf items
without re-opening the view for each step.

**Why this priority**: The user described the ability to "follow the up and
down stream relationship", which means multi-level traversal. Showing only
one level would leave the core value (tracing a chain) undelivered.

**Independent Test**: Open the hierarchy for a requirement that sits in the
middle of a three-level chain (grandparent → parent → item → child). Expand
the parent entry in the upstream direction and confirm the grandparent
appears; expand the child entry in the downstream direction and confirm its
own children (if any) appear.

**Acceptance Scenarios**:

1. **Given** the hierarchy view lists an upstream item, **When** the user
   expands that item, **Then** its own upstream items are listed beneath it,
   labelled `UID: Heading` (prefix as detail text).
2. **Given** the hierarchy view lists a downstream item, **When** the user
   expands that item, **Then** its own downstream items are listed beneath
   it, labelled `UID: Heading` (prefix as detail text).
3. **Given** an entry in the hierarchy has no further items in the current
   direction, **When** the user expands it, **Then** it shows no children and
   no error.
4. **Given** the user has traversed several levels, **When** the user
   presses the direction-switch icon (outgoing ↔ incoming), **Then** the
   view re-roots on the same originally selected requirement and shows only
   the other direction, and the icon now offers the direction just left.

---

### User Story 3 - Jump to an item from the hierarchy (Priority: P2)

As a requirements author looking at the hierarchy, I want to select any
listed upstream or downstream item and have its file open in the editor, so
that I can read the related requirement's full content without hunting for it
in the tree view.

**Why this priority**: Navigating to the related item is the natural
follow-up to seeing it in the hierarchy; it turns the view from read-only
information into a navigation tool. It is P2 because the hierarchy is still
useful without it.

**Independent Test**: Open the hierarchy for any linked requirement, select
one of the listed items, and confirm that item's file opens in the editor
positioned at the requirement's header.

**Acceptance Scenarios**:

1. **Given** the hierarchy view lists at least one item, **When** the user
   selects that item, **Then** its requirement file opens in the editor with
   the cursor at that requirement's header line.
2. **Given** the user navigated to an item from the hierarchy, **When** the
   user triggers the editor's "Go Back", **Then** the previously open file is
   restored.

---

### User Story 4 - Open the hierarchy from inside the editor (Priority: P3)

As a requirements author already reading a requirement file, I want to invoke
the editor's standard "Show Call Hierarchy" action while my cursor is inside
that file so that I get the same upstream/downstream view without going back
to the tree view.

**Why this priority**: Consistency with how the existing "Go to Definition"
and "Find All References" features already work from inside the editor. It
reuses the same hierarchy the tree icon shows and adds a second entry point,
so it is lower priority than the tree icon the user asked for.

**Independent Test**: Open a requirement file, place the cursor on any line,
invoke "Show Call Hierarchy", and confirm the hierarchy view appears rooted
at the requirement the file belongs to.

**Acceptance Scenarios**:

1. **Given** the cursor is anywhere in a recognised requirement file,
   **When** the user invokes "Show Call Hierarchy", **Then** the hierarchy
   view opens rooted at that file's requirement.
2. **Given** the cursor is on another requirement's UID (for example an entry
   under `links:`), **When** the user invokes "Show Call Hierarchy", **Then**
   the hierarchy view opens rooted at the referenced requirement rather than
   the current file's requirement.
3. **Given** the cursor is in a file that is not a recognised requirement,
   **When** the user invokes "Show Call Hierarchy", **Then** no
   requirement-specific hierarchy is offered (standard editor behaviour
   applies).

---

### Edge Cases

- What happens when a requirement links to a UID that does not exist in the
  workspace (dangling link)? The entry is listed with its UID and an
  indication that it could not be resolved; expanding it shows nothing, and
  selecting it opens no target item — the view stays on the dangling
  `links:` line in the referencing file, where the user would fix it.
- What happens when a requirement has no header/name? The entry is labelled
  with the UID alone (no trailing separator) so the label stays readable.
- What happens when the same item appears at more than one place in the
  chain (for example via two different parents)? Each occurrence is shown
  where it belongs; the view does not dedupe across branches.
- What happens if links form a cycle (A → B → A)? Expansion continues to
  work level by level; the view never hangs or fails because of the loop.
- What happens when the "calls" icon is clicked while the requirement index
  is not available (for example the server is not running)? The user sees a
  clear message explaining the hierarchy is unavailable, and no partial or
  stale view is shown.
- What happens when the requirement's file no longer exists on disk while it
  is still listed in the tree view? The user sees a "file not found" style
  message rather than a blank editor.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The tree view MUST show an inline "calls" action icon on every
  individual requirement item; the icon MUST NOT be shown on Doorstop
  document root nodes.
- **FR-002**: Activating the "calls" icon MUST open that requirement's file
  in the editor and open an in-editor hierarchy view rooted at that
  requirement.
- **FR-003**: The hierarchy view MUST offer two directions for any
  requirement: **outgoing** = upstream (the requirements listed under that
  item's links) and **incoming** = downstream (the requirements whose links
  include that item). The direction labels shown to the user MUST use the
  terms "outgoing" and "incoming" consistently with this mapping.
- **FR-003a**: The hierarchy view MUST be the editor's built-in peek-style
  call hierarchy view (as in the VS Code call-hierarchy sample), with its
  standard direction-switch icon on the view's top line. Exactly one
  direction is shown at a time, and exactly **one** icon is visible: "Show
  Incoming Calls" while outgoing is displayed, "Show Outgoing Calls" while
  incoming is displayed. Pressing it switches the entire view to the other
  direction. No custom hierarchy panel and no second icon are introduced.
- **FR-003b**: When opened from the tree view's "calls" icon, the hierarchy
  view MUST open showing the "outgoing" (upstream) direction first.
- **FR-004**: Every entry in the hierarchy view MUST have a main label in the
  form `UID: Heading`, where Heading is the requirement's header/title, and
  MUST show the item's document prefix (e.g. `REQ`) as secondary/detail text
  beside the main label; when no header exists, the main label MUST be the
  UID alone.
- **FR-005**: Every entry in the hierarchy view MUST be expandable so its own
  upstream or downstream items (matching the currently shown direction) are
  listed beneath it, to any depth the data allows.
- **FR-006**: Selecting an entry in the hierarchy view MUST open that
  requirement's file in the editor at its header line, leaving a navigable
  history entry so the editor's "Go Back" returns to the previous location.
- **FR-007**: The editor's standard "Show Call Hierarchy" action MUST work in
  any recognised requirement file: on a requirement UID token it MUST root on
  the referenced requirement; anywhere else in the file it MUST root on the
  file's own requirement.
- **FR-008**: Upstream and downstream results MUST be derived from the same
  requirement index the existing hover, "Go to Definition" and "Find All
  References" features use, so all views agree on which items are linked.
- **FR-009**: Requirements with no links in a direction MUST produce an
  empty result in that direction, not an error.
- **FR-010**: Links to UIDs that cannot be resolved MUST be shown as
  unresolved entries: expanding one MUST yield no children, and selecting
  one MUST open no target item (navigation stays on the dangling `links:`
  line in the referencing file). Unresolved entries MUST NOT prevent the
  remaining entries from being shown.
- **FR-011**: If the hierarchy cannot be computed (for example the
  requirement index is unavailable), the user MUST be shown a clear message
  explaining why, and no empty or stale hierarchy view is presented as if it
  were valid.
- **FR-012**: The hierarchy view MUST reflect the current state of the
  requirement index each time it is opened, so links added or removed since
  the last open are visible without restarting the extension.

### Key Entities

- **Requirement Item**: an individual Doorstop requirement identified by its
  UID, with an optional header (name), a file location, and a list of links
  to other UIDs.
- **Upstream Item (outgoing)**: a requirement that the current item links to
  (its parent in Doorstop terms). Shown under the "outgoing" direction.
  Matches the "Upstream Links" the hover already shows.
- **Downstream Item (incoming)**: a requirement whose links include the
  current item (its child in Doorstop terms). Shown under the "incoming"
  direction. Matches the "Downstream (Reverse) Links" the hover already
  shows.
- **Hierarchy Entry**: one row in the hierarchy view — a `UID: Heading` main
  label, the document prefix as secondary/detail text, a direction
  (upstream/downstream), the file location it opens to, and its expandable
  children in that direction.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From the tree view, a user can reach the full list of a
  requirement's direct upstream and downstream items with a single click,
  where previously it required opening the file and reading hover text.
- **SC-002**: A user can trace a five-level requirement chain (top-level to
  leaf) in a single hierarchy view without opening any additional file
  manually.
- **SC-003**: For a workspace of up to 1,000 requirements, the hierarchy view
  for any item appears within 2 seconds of clicking the "calls" icon.
- **SC-004**: Every hierarchy entry for a requirement with a header shows a
  `UID: Heading` main label plus its document prefix as detail text; 100% of
  entries in the automated test fixture render in this form.
- **SC-005**: The set of upstream/downstream items shown in the hierarchy
  exactly matches the set of upstream/downstream links shown in the hover
  preview for the same requirement in 100% of tested cases.
- **SC-006**: Unresolvable links, empty directions, and an unavailable index
  each produce a user-visible outcome (unresolved entry, empty list, or
  message) and never a crash or a silently blank view.

## Assumptions

- "Upstream" means the requirements this item links to (its parents) and
  "downstream" means the requirements that link to this item (its children),
  matching the terminology the existing hover preview already uses. In the
  hierarchy view these appear as "outgoing" (upstream) and "incoming"
  (downstream), because a link is written in the item and points out to its
  parent.
- "Name" in the original request means the requirement's header/title
  field, shown as `UID: Heading`; the document prefix is shown as detail text
  rather than repeated inside the UID. Items without a header are shown by
  UID alone.
- "Opens the editor" means the requirement's own file is opened in a text
  editor and the hierarchy is shown as the editor's built-in peek-style call
  hierarchy view — the same mechanism the VS Code call-hierarchy sample
  demonstrates — in the same way "Find All References" already shows an
  in-editor locations view for this project. The "two icons for filtering"
  in the original request are that view's standard direction switch — a
  single icon whose label and glyph flip between "Show Incoming Calls" and
  "Show Outgoing Calls"; it is not a custom control and there is never a
  second icon.
- The hierarchy is built from the same workspace-wide requirement index that
  powers hover, "Go to Definition" and "Find All References"; no new source
  of link data is introduced.
- The "calls" icon is an inline tree-item action alongside the existing
  inline actions (add, link); its exact glyph is left to the implementation,
  but it should read as "hierarchy/calls" to the user.
- The diagram canvas is out of scope for this feature; the feature adds no
  new context command to the diagram.
- Suspect-link state is not shown in the hierarchy view; entries look the
  same whether or not the link is suspect. Suspect handling remains with the
  existing review features.
- When the hierarchy is invoked from inside the editor via the standard
  "Show Call Hierarchy" action (User Story 4) rather than the tree icon, the
  editor's own default direction applies; the "outgoing first" rule in
  FR-003b is specific to the tree view's "calls" icon.
- The feature ships with at least one automated extension-side test covering
  User Story 1's primary path, per the project constitution.
