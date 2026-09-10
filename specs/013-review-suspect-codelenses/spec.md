# Feature Specification: Review & Suspect-Link CodeLenses

**Feature Branch**: `013-review-suspect-codelenses`

**Created**: 2026-09-10

**Status**: Draft

**Input**: User description: "I need additional code lenses. Currently I have the 'Derive Requirement'. I additionally need: in the yml part of the requirement the field 'review' shall have a code lens which provides the feature 'Review Done' which calls the doorstop server and performs the review for that item. One code lens for the links if links are available — one right above the 'links' field which clears all suspect links of the item: 'Clear All Suspicions'. One code lens for each item which is listed in the links section, with 'Clear the Suspicion', which sends to the server the command to clean only the one link."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Mark a requirement as reviewed from the editor (Priority: P1)

As a developer reading a requirement file, I want a one-click action directly on
the review field to mark that requirement as reviewed, so I can confirm a change
without leaving the editor to find the equivalent command in the tree or command
panel.

**Why this priority**: Reviewing is the single most frequent bookkeeping step
after editing a requirement's text, and it is currently only reachable from
surfaces outside the file being edited. It stands alone as a complete, shippable
improvement even if no link-related action is ever added.

**Independent Test**: Open a requirement file whose review field is unset or , click
the "Review Done" action shown on that field, and confirm the requirement is
recorded as reviewed and the file content reflects it.

**Acceptance Scenarios**:

1. **Given** a requirement file containing a review field, **When** the file is
   opened in the editor, **Then** a "Review Done" action appears inline on that
   field.
2. **Given** the user invokes "Review Done", **When** the action completes
   successfully, **Then** only that one requirement is marked as reviewed, and
   the open file shows the updated review state without the user reopening it.
3. **Given** the user invokes "Review Done", **When** the request cannot be
   completed (server unavailable, requirement not found), **Then** the user sees
   an explicit error message naming the failure, and the file is left unchanged.
4. **Given** a file that is not a Doorstop requirement, **When** it is opened,
   **Then** no "Review Done" action is shown.

---

### User Story 2 - Clear all suspect links on a requirement at once (Priority: P2)

As a developer who has just updated a requirement that several downstream items
link to, I want a single action on the links field that clears the suspect state
of all of that item's links, so I can resolve the whole batch in one step
instead of one link at a time.

**Why this priority**: This is the bulk path and covers the common case where an
edit invalidates every link at once. It depends on nothing in User Story 1 and
delivers value on its own.

**Independent Test**: Open a requirement file that has at least one link, click
the "Clear All Suspicions" action shown above the links field, and confirm every
link on that requirement is no longer suspect.

**Acceptance Scenarios**:

1. **Given** a requirement file whose links field lists one or more links,
   **When** the file is opened, **Then** a "Clear All Suspicions" action appears
   inline directly above the links field.
2. **Given** a requirement file with no links (empty or absent links field),
   **When** the file is opened, **Then** no "Clear All Suspicions" action is
   shown.
3. **Given** the user invokes "Clear All Suspicions", **When** the action
   completes, **Then** every link on that requirement is recorded as no longer
   suspect, and no other requirement is modified.
4. **Given** the user invokes "Clear All Suspicions", **When** the request
   fails, **Then** the user sees an explicit error message and no link's state
   is partially reported as changed.

---

### User Story 3 - Clear the suspicion on one specific link (Priority: P3)

As a developer who has reviewed the impact of a change on one particular parent
link, I want an action on that individual link entry to clear only that link's
suspect state, so I can acknowledge links selectively rather than being forced
to accept all of them.

**Why this priority**: The precise, per-link path. It is the most granular and
least frequently needed of the three, and it is only meaningful once a user
already understands the bulk action.

**Independent Test**: Open a requirement file that links to two or more parents,
click the "Clear the Suspicion" action on exactly one of the listed links, and
confirm only that link's suspect state changed while the other links kept
theirs.

**Acceptance Scenarios**:

1. **Given** a requirement file listing three links, **When** the file is
   opened, **Then** a "Clear the Suspicion" action appears inline on each of the
   three link entries.
2. **Given** the user invokes "Clear the Suspicion" on one link entry, **When**
   the action completes, **Then** only that link is recorded as no longer
   suspect and the requirement's other links are untouched.
3. **Given** a link entry naming a parent requirement that no longer exists,
   **When** the user invokes "Clear the Suspicion" on it, **Then** the user sees
   an explicit error identifying the unresolvable parent, and no state is
   changed.

---

### Edge Cases

- What happens when the open file has unsaved edits at the moment an action is
  invoked, given the action operates on the requirement's stored state and will
  cause the stored file to be rewritten?
- What happens when the review field or links field appears more than once in a
  single file, or inside a nested block that is not the requirement's own
  metadata?
- What happens when the links field is present but written in a form with no
  individual entries (empty list), so per-link actions have nothing to attach to?
- What happens when the same requirement file is open in two editor panes while
  an action rewrites it?
- What happens when a link entry is malformed and no parent identifier can be
  determined from it?
- How does the system behave when the server is not running at the moment a lens
  is invoked, versus when the file is merely opened?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display an inline "Review Done" action on the review
  field of a requirement's metadata, in the same editor surfaces where the
  existing derive action is offered.
- **FR-002**: Invoking "Review Done" MUST mark exactly the one requirement the
  file represents as reviewed, and MUST NOT affect any other requirement or
  document.
- **FR-003**: System MUST display an inline "Clear All Suspicions" action
  immediately above the links field whenever that requirement has at least one
  link, and MUST NOT display it when the requirement has no links.
- **FR-004**: Invoking "Clear All Suspicions" MUST clear the suspect state of
  every link belonging to that requirement, and MUST NOT affect links belonging
  to other requirements.
- **FR-005**: System MUST display an inline "Clear the Suspicion" action on each
  individual link entry listed in the requirement's links field.
- **FR-006**: Invoking "Clear the Suspicion" on a link entry MUST clear the
  suspect state of only that link, leaving the requirement's other links
  unchanged.
- **FR-007**: All three actions MUST perform their state change through the
  Doorstop server rather than by editing the requirement file's text directly.
- **FR-008**: After any of the three actions succeeds, the open editor MUST
  reflect the requirement's resulting stored state without the user manually
  reopening or reloading the file, and the extension's other requirement views
  MUST reflect the change.
- **FR-009**: When an action fails, the system MUST surface an explicit,
  human-readable error identifying what failed, and MUST leave the requirement's
  stored state unchanged.
- **FR-010**: When the file holding the requirement has unsaved editor changes,
  the system MUST NOT silently discard them; it MUST either persist them first
  or tell the user the action cannot proceed until the file is saved.
- **FR-011**: System MUST offer these actions only for files it recognizes as
  Doorstop requirements, and MUST show no such actions in unrelated files.
- **FR-012**: The three new actions MUST coexist with the existing derive action
  on the same file without suppressing or replacing it.

### Key Entities

- **Review Field**: the metadata field on a requirement recording whether the
  requirement's current content has been reviewed; the anchor point for the
  "Review Done" action.
- **Links Field**: the metadata block on a requirement listing the parent
  requirements it links to; the anchor point for the "Clear All Suspicions"
  action.
- **Link Entry**: a single parent reference within the links field, carrying its
  own suspect state; the anchor point for a "Clear the Suspicion" action.
- **Suspect State**: the condition of a link whose parent has changed since the
  link was last acknowledged, which the clear actions resolve.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can mark the requirement they are reading as reviewed
  in a single action, without switching away from the file.
- **SC-002**: A developer can resolve every suspect link on a requirement in a
  single action, regardless of how many links that requirement has.
- **SC-003**: A developer can resolve exactly one link of a multi-link
  requirement without altering the state of the others, verifiable by inspecting
  the requirement afterwards.
- **SC-004**: Every failure of these actions produces a message that names the
  cause; no action fails silently or leaves the displayed state disagreeing with
  the stored state.
- **SC-005**: Opening a requirement file with many links does not noticeably
  delay the file becoming readable and editable.

## Assumptions

- The user's phrase "the field 'review'" refers to the requirement's existing
  review metadata field as stored in the requirement file; the action's label is
  "Review Done".
- The clear actions are offered whenever links are present, not only when a link
  is currently suspect. This follows the user's wording ("one code lens for the
  links if links are available") and keeps the lenses stable as suspect state
  changes; clearing an already-clear link is treated as a harmless no-op.
- "Review Done" reviews only the single requirement whose file is open — not its
  document and not the whole tree; the existing tree and command-panel entries
  remain the path for document-wide and workspace-wide review.
- These actions are offered in the same file types the existing derive action
  supports, so requirements stored as standalone metadata files and requirements
  whose metadata sits in a Markdown header are treated alike.
- The server already provides the review and selective suspect-clearing
  operations these actions need; this feature adds editor entry points to them
  rather than new server capabilities. If a needed operation turns out to be
  missing, adding it is in scope, but re-implementing review or suspect logic
  outside the server is not.
- Bulk clearing applies to all of the requirement's own links only; clearing
  suspicions across a document or the whole tree stays with the existing
  commands.
- Undo of a review or clear is out of scope; these actions are corrected the
  same way they are today, through the existing Doorstop workflow.
