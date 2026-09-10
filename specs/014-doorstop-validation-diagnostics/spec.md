# Feature Specification: Doorstop Validation Problems In-Item

**Feature Branch**: `014-doorstop-validation-diagnostics`

**Created**: 2026-09-10

**Status**: Draft

**Input**: User description: "I need additional problem reporting. The user needs to see all issues which are reported by doorstop to an item directly in the item. Therefore the extension shall fetch the issues from the server and the warning shall have yellow curls and the error shall be reported as errors. If a single validation is related to several items then it shall be shown in all related items. [Followed by the list of Doorstop WARNING-level and ERROR-level checks with the field each should be anchored to.]"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See broken links reported as errors on the offending link (Priority: P1)

As a developer maintaining a requirements tree, I want every link that Doorstop
considers broken — a link to an unknown identifier, a parent link pointing at a
deactivated requirement, or an external reference that cannot be found — to be
reported as an error directly on the link entry inside the requirement file, so
I can find and fix genuinely invalid traceability without running a separate
validation report and manually mapping messages back to files.

**Why this priority**: These are the only problems Doorstop classifies as
errors. They mean the traceability tree is actually broken, not merely untidy,
and they are the problems most likely to invalidate a release or an export.
Reporting them alone is a complete, shippable improvement.

**Independent Test**: Open a requirement that links to a non-existent
identifier; confirm an error problem appears on that specific link entry,
carries Doorstop's own message, and is listed in the editor's problems list.

**Acceptance Scenarios**:

1. **Given** a requirement whose links list contains an identifier that matches
   no existing requirement, **When** the requirement's problems are shown,
   **Then** an error is reported on the line of that link entry, and no error is
   reported on the requirement's other, valid link entries.
2. **Given** a requirement whose parent link points at a deactivated
   requirement, **When** the requirement's problems are shown, **Then** an error
   is reported on that link entry.
3. **Given** a requirement whose external reference cannot be resolved to a
   file, **When** the requirement's problems are shown, **Then** an error is
   reported on the reference field of that requirement.
4. **Given** a requirement with no link or reference problems, **When** its
   problems are shown, **Then** no error is reported anywhere in that file.
5. **Given** a requirement reported with an error, **When** the user fixes the
   cause and the requirements are re-checked, **Then** the error disappears
   without the user restarting the editor.

---

### User Story 2 - See link-health warnings as yellow squiggles on the link and derived fields (Priority: P2)

As a developer who has just changed a requirement, I want Doorstop's link-health
warnings — a suspect link whose recorded fingerprint no longer matches, a link
to a non-normative requirement, a self-link, a child link to a deactivated
requirement, a link cycle, a non-normative requirement that nevertheless has
links, and requirements missing the links their position in the hierarchy
implies — to be shown as warnings on the link or derived field they concern, so
I can see the traceability consequences of my edit in the file I am already
editing.

**Why this priority**: These are the warnings developers hit constantly during
normal editing, and they are the ones whose meaning is hardest to recover from a
bulk validation log. They are independent of User Story 1 and deliver value on
their own.

**Independent Test**: Open a requirement with a known suspect link; confirm a
warning appears on that link entry with Doorstop's message and warning
severity, and clearing the suspicion makes the warning disappear.

**Acceptance Scenarios**:

1. **Given** a requirement with a suspect link, **When** its problems are shown,
   **Then** a warning is reported on that link entry.
2. **Given** a requirement that links to itself, **When** its problems are
   shown, **Then** a warning is reported on that link entry.
3. **Given** a requirement that links to a non-normative requirement, **When**
   its problems are shown, **Then** a warning is reported on that link entry.
4. **Given** a normative, non-derived requirement in a child document that has
   no links, **When** its problems are shown, **Then** a warning is reported on
   its derived field.
5. **Given** a requirement in a document with child documents that no child
   requirement links to, **When** its problems are shown, **Then** a warning is
   reported on its derived field.
6. **Given** a non-normative requirement that has links, **When** its problems
   are shown, **Then** a warning is reported on its links field.
7. **Given** any of the above, **When** the problem is shown, **Then** it is
   reported at warning severity, distinguishable from the errors of User Story 1.

---

### User Story 3 - See content and review warnings on the field that caused them (Priority: P3)

As a developer reviewing requirement quality, I want the content-level warnings
— unreviewed changes, empty requirement text, and a level that duplicates
another requirement's level in the same document — reported on the review, text,
and level fields respectively, so I can correct the requirement's own content
without cross-referencing a report.

**Why this priority**: These are quality-hygiene problems rather than
traceability breakage. They matter for a clean document but do not block
traceability, so they follow the link-focused stories.

**Independent Test**: Open a requirement with unreviewed changes and an empty
text body; confirm one warning appears on the review field and another on the
text location for that file's format.

**Acceptance Scenarios**:

1. **Given** a requirement with unreviewed changes, **When** its problems are
   shown, **Then** a warning is reported on its review field.
2. **Given** a requirement stored in the attribute-file format whose text is
   empty, **When** its problems are shown, **Then** a warning is reported on its
   text field.
3. **Given** a requirement stored in the prose-file format whose text is empty,
   **When** its problems are shown, **Then** a warning is reported on the last
   line of that file.
4. **Given** two requirements in one document that share the same level,
   **When** their problems are shown, **Then** a warning is reported on the
   level field of each of those requirements.

---

### User Story 4 - See document-level and multi-requirement problems on every place they apply (Priority: P4)

As a developer responsible for a whole requirements document, I want a problem
that concerns a document as a whole reported on that document's configuration
file, and a problem that concerns several requirements at once reported
identically on each one of them, so that no problem is invisible just because I
happen to have only one of the affected files open.

**Why this priority**: This closes the coverage gap left by the per-requirement
stories — an empty document has no requirement to attach a problem to, and
relational problems such as a link cycle belong to more than one requirement. It
builds on the earlier stories but is separately demonstrable.

**Independent Test**: Create a document with no requirements and confirm a
warning appears on that document's configuration file; then create a cycle of
links across three requirements and confirm the same warning appears on all
three.

**Acceptance Scenarios**:

1. **Given** a document that contains no requirements, **When** its problems are
   shown, **Then** a warning is reported on that document's configuration file.
2. **Given** a cycle of links spanning three requirements, **When** their
   problems are shown, **Then** the cycle warning appears on the links field of
   each of the three requirements.
3. **Given** a problem Doorstop reports against several requirements, **When**
   the problems are shown, **Then** the same message and severity appear for
   every affected requirement, and the user can act on it from any of them.
4. **Given** a document-level problem, **When** the user opens the document's
   configuration file, **Then** the problem is visible there without any
   additional step.

---

### User Story 5 - Keep the reported problems current as the requirements change (Priority: P5)

As a developer working through a backlog of problems, I want the reported
problems to refresh after I change a requirement — by editing and saving a file,
or by using one of the extension's own requirement actions — so the list I am
working from reflects the current state rather than the state when I opened the
workspace.

**Why this priority**: Without refresh the earlier stories still deliver their
value on first display, but stale problems erode trust quickly. It is a
completeness concern layered on top of the display stories.

**Independent Test**: With a problem visible on a requirement, fix its cause,
save the file, and confirm the problem disappears; break it again, save, and
confirm it returns.

**Acceptance Scenarios**:

1. **Given** a visible problem on a requirement, **When** the user fixes the
   cause and saves the file, **Then** the problem disappears without a manual
   refresh.
2. **Given** a clean requirement, **When** the user introduces a problem and
   saves, **Then** the corresponding problem appears.
3. **Given** a requirement action performed through the extension that changes
   validation state (for example clearing a suspect link or marking a
   requirement reviewed), **When** the action completes, **Then** the affected
   problems are updated.
4. **Given** the requirement problems cannot be retrieved, **When** the user
   works in the editor, **Then** the user is told explicitly that problem
   reporting is unavailable, and previously shown problems are not silently
   presented as if still current.
5. **Given** the user wants to re-check on demand, **When** they invoke the
   re-check action, **Then** all reported problems for the workspace are
   recomputed.

---

### Edge Cases

- What happens when a requirement file has unsaved edits, so the field the
  problem should attach to has moved or no longer exists in the buffer?
- What happens when the field a problem should attach to is absent from the file
  entirely (for example a requirement with no review field, or a problem about
  links on a requirement whose links field was deleted)?
- What happens when the message names a link identifier that the extension
  cannot locate in the file's link entries (malformed entry, or the same
  identifier listed twice)?
- What happens when a problem's category is not one of the known checks — a
  Doorstop version reports a check this feature does not have a mapping for?
- What happens when the workspace contains a very large number of requirements,
  so re-checking after every save would be noticeably slow?
- What happens when a document's configuration file is not open and a
  document-level problem applies to it?
- What happens when the same requirement is open in two editor panes, or when
  the file is changed outside the editor?
- What happens when the requirements source is unreachable at startup, before
  any problems have ever been retrieved?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The extension MUST obtain the requirement problems from the
  Doorstop server rather than deriving them itself, so the problems shown are
  exactly the ones Doorstop reports.
- **FR-002**: The extension MUST report each retrieved problem in the editor's
  standard problem surface, attached to a location inside a requirement or
  document file, so it is visible both inline in the file and in the aggregated
  problems list.
- **FR-003**: Problems Doorstop classifies as warnings MUST be reported at
  warning severity (yellow squiggle); problems Doorstop classifies as errors
  MUST be reported at error severity.
- **FR-004**: Each reported problem MUST carry Doorstop's own message text, so
  the wording the user sees matches the wording Doorstop's own validation
  produces.
- **FR-005**: When one problem concerns several requirements, the extension MUST
  report it on every affected requirement, with the same message and severity on
  each.
- **FR-006**: The extension MUST anchor each problem to the location listed in
  the anchor table below, based on the check that produced it.
- **FR-007**: Anchor table — warnings:

  | Check | Anchor location |
  | --- | --- |
  | A document contains no items | The document's configuration file |
  | Duplicated levels within the items of a document | The level field of each item sharing the level |
  | An item has an empty text attribute | The text field (attribute-file format) or the file's last line (prose-file format) |
  | An item has unreviewed changes | The item's review field |
  | An item's child link is an inactive item | The link entry concerned |
  | An item is linked to a non-normative item | The link entry concerned |
  | An item is linked to itself | The link entry concerned |
  | An item has a suspect link whose fingerprint differs from the one recorded | The link entry concerned |
  | An item in a document with child documents has no links from any item in a child document | The item's derived field |
  | A normative, non-derived item in a child document has no links | The item's derived field |
  | A non-normative item has links | The item's links field |
  | There is a cycle of item links | The links field of every item in the cycle |

- **FR-008**: Anchor table — errors:

  | Check | Anchor location |
  | --- | --- |
  | An item's parent link is an inactive item | The link entry concerned |
  | An item's link is an invalid or unknown identifier | The link entry concerned |
  | An external reference cannot be found | The item's reference field |

- **FR-009**: When a problem concerns one specific link, the extension MUST
  anchor it to that individual link entry, not to the links field as a whole, so
  a requirement with several links shows the problem only on the offending one.
- **FR-010**: When the field a problem should anchor to is missing from the file,
  the extension MUST fall back to a stable location within the same file (the
  start of the requirement's content) rather than dropping the problem.
- **FR-011**: When a retrieved problem does not match any known check, the
  extension MUST still report it, using the fallback location of FR-010 and the
  server's severity and message, so no problem is silently discarded.
- **FR-012**: The extension MUST refresh the reported problems after a
  requirement file is saved and after any extension-initiated action that
  changes requirement state.
- **FR-013**: Users MUST be able to re-check all requirement problems on demand
  through an explicit action.
- **FR-014**: When problems cannot be retrieved, the extension MUST tell the user
  explicitly that problem reporting is unavailable and MUST NOT leave stale
  problems presented as current.
- **FR-015**: The extension MUST report problems for every requirement and
  document in the workspace, not only for files currently open, so the
  aggregated problems list reflects the whole requirements tree.
- **FR-016**: The extension MUST clear a requirement's reported problems when
  the requirement or its file no longer exists.
- **FR-017**: Problem reporting MUST be read-only: retrieving or displaying
  problems MUST NOT modify any requirement or document.

### Key Entities *(include if data involved)*

- **Validation problem**: One issue reported by Doorstop's validation. Carries a
  severity (warning or error), a human-readable message, the check that produced
  it, the requirement or document it concerns, and — where applicable — the
  specific link identifier or field the message is about.
- **Anchor**: The location inside a requirement or document file at which a
  problem is displayed — a named field, a specific link entry, the file's last
  line, or a fallback position when the intended location is absent.
- **Requirement**: An existing Doorstop item, stored either as an attribute file
  or as a prose file with attributes, carrying fields such as level, text,
  review state, derived state, links, and external reference.
- **Document**: An existing Doorstop document with a configuration file, holding
  zero or more requirements and optionally having child documents.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the fifteen listed Doorstop checks are reported, each at
  the specified severity and at the specified location.
- **SC-002**: A user opening a requirement that has problems sees them without
  performing any additional action beyond opening the file.
- **SC-003**: For a problem concerning a single link, the problem appears on that
  link entry and on no other link entry of the same requirement, in 100% of
  cases where the link entry is present in the file.
- **SC-004**: A problem affecting N requirements is visible on all N of them.
- **SC-005**: After a user saves a change that resolves a problem, the problem is
  gone from the problems list within 3 seconds for a workspace of up to 500
  requirements.
- **SC-006**: A user can go from an entry in the problems list to the exact
  offending field in the file in one click.
- **SC-007**: No problem retrieved from the server is discarded without being
  shown somewhere, including problems from checks not present in the anchor
  tables.
- **SC-008**: When problem retrieval fails, 100% of such failures produce an
  explicit user-visible message rather than an empty problems list.

## Assumptions

- The Doorstop server is the source of the problems; a way to ask it for the
  validation results of the whole requirements tree will be provided as part of
  this feature, consistent with the project's rule that the server owns all
  Doorstop logic.
- "Yellow curls" is understood as the editor's standard warning presentation
  (yellow squiggle plus an entry in the problems list), and "reported as errors"
  as the standard error presentation; no custom decoration style is introduced.
- The external-reference error is anchored to the requirement's reference field,
  since that is where the external reference is declared; the user's note listed
  it under the link-related anchors, but no link entry exists for it.
- "Attribute-file format" and "prose-file format" refer to the two ways Doorstop
  stores a requirement (all attributes in a structured file, versus prose with
  an attribute header). Fields other than text are located in the attribute
  section in both formats, so their anchors work identically.
- Problems are computed for the requirement state stored on disk. While a file
  has unsaved edits, the problems shown may lag the buffer; they are refreshed on
  save.
- Re-checking covers the whole requirements tree, because Doorstop's validation
  is inherently tree-wide (cycles, cross-document links, and duplicate levels
  cannot be judged from one file alone).
- Problem reporting is display-only for this feature; offering fixes (for
  example a quick action to clear a suspect link from the warning) is out of
  scope and left to the existing dedicated commands.
- The requirements tree is local to the workspace and of a size where a
  whole-tree re-check on save is acceptable; no incremental per-file validation
  protocol is assumed.
