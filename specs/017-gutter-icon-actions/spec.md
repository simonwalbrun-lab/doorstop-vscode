# Feature Specification: Review and Suspect-Link Actions via Problems Quick Fix

**Feature Branch**: `017-gutter-icon-actions`

**Created**: 2026-09-11

**Status**: Draft

**Input**: User description: "We need to revise the code lenses. We keep the function but we change the location for user. instead of having the codelenses which provide the following features I want to have gutter icons to click, this means basically that the acees point moves from above to left of the respective line. + Derive Requirement --> type-hierarchy, Do Review --> check-compact, Clear all Suspect Links --> check-all, Clear Suspct Link --> check. We only use icons from VS Code Codicons lib. Also update the icons which are used in the doorstop TreeView. The function clear suspect link and review is no longer available by the icon on the requirements to click. (leave the context menu as it is.)"

**Revision note**: VS Code has no public, stable API for an arbitrary custom-icon gutter glyph that runs a command on a single click (confirmed against the open, unimplemented feature request [microsoft/vscode#224134](https://github.com/microsoft/vscode/issues/224134)). After reviewing that constraint with the requester, the approach below was agreed instead: "Do Review" and the two "Clear Suspect Link(s)" actions attach to the Problems Doorstop's own validation already reports for those exact conditions (a real, clickable, left-of-line Quick Fix affordance), and "+ Derive Requirement" is explicitly kept unchanged, since Doorstop has no equivalent "problem" for it. The TreeView icon change is unaffected by this and proceeds as originally requested.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Fix "needs review" and "suspect link" problems from a Quick Fix (Priority: P1)

A requirements author is editing Doorstop requirement files. Today, "Do Review", "Clear All Suspicions" and "Clear the Suspicion" appear as clickable text links floating above the relevant line. Doorstop's own validation already reports "this item needs review" and "suspect link to X" as Problems, shown inline in the editor and in the Problems panel. The author wants those two actions offered as a Quick Fix on the existing Problem instead of as a separate text link above the line - so resolving "needs review" or "suspect link" is one click away exactly where the problem is already flagged (VS Code shows a lightbulb in the editor's left margin, next to the line, for any line with an available Quick Fix).

**Why this priority**: This is the substance of the (revised) request - retiring the "Do Review" and "Clear Suspect Link(s)" CodeLenses in favor of fixing the problem where it's already reported.

**Independent Test**: With Doorstop reporting one item as needing review and another item as having a suspect link, open both files. Confirm a Problem is shown on the relevant line in each, that invoking Quick Fix there offers the matching fix, that choosing it reproduces today's CodeLens behavior exactly (same confirmation prompts, same success/error messages, same server changes), and that the Problem and its Quick Fix disappear once resolved.

**Acceptance Scenarios**:

1. **Given** an item Doorstop's validation reports as needing review, **When** the author opens that item's file, **Then** a Problem appears on the item's `reviewed:` line, invoking Quick Fix there offers "Do Review", and no "Do Review" text link appears above that line.
2. **Given** an item with exactly one suspect link, **When** the author opens that item's file, **Then** a Problem appears on that link's entry line, invoking Quick Fix there offers "Clear Suspect Link" for that one link, and no "Clear the Suspicion" text link appears above that line.
3. **Given** an item with two or more suspect links, **When** the author invokes Quick Fix on any one of that item's suspect-link Problems, **Then** the offered fixes include both "Clear Suspect Link" (that one only) and "Clear All Suspect Links" (every suspect link on the item), and no "Clear All Suspicions" text link appears above the `links:` line.
4. **Given** the author selects "Do Review" from Quick Fix, **When** the document has unsaved changes, **Then** the same "save and continue" confirmation used by today's CodeLens is shown before the review is recorded.
5. **Given** the author selects "Clear Suspect Link" or "Clear All Suspect Links" from Quick Fix, **When** the request succeeds, **Then** the same success message appears and the same link(s) are cleared as the equivalent CodeLens action clears today.
6. **Given** an item Doorstop does not report as needing review and that has no suspect links, **When** the author opens that file, **Then** no "Do Review" or "Clear Suspect Link" Problem or Quick Fix is offered for it.
7. **Given** an item with a `derived:` field, **When** the author opens that item's file, **Then** the existing "+ Derive Requirement" text link above that line is unchanged by this feature.
8. **Given** the author has applied "Clear Suspect Link" (or "Do Review") from Quick Fix and the request succeeded, **When** the next validation check completes, **Then** the Problem that fix belonged to is no longer reported and invoking Quick Fix on that same line no longer offers that fix - the fix is gone together with the problem it resolved.
9. **Given** an item that both needs review and has two or more suspect links, **When** the author opens that item's file, **Then** invoking Quick Fix on the `reviewed:` line offers "Do Review", and invoking it on any suspect-link entry line offers "Clear Suspect Link" and "Clear All Suspect Links" - each set independently, with no fix appearing on a line it does not belong to.

---

### User Story 2 - Remove Review and Clear Suspect Link from the TreeView's clickable icons (Priority: P2)

A requirements author browsing the Doorstop TreeView currently sees four small icon buttons on each requirement row (Add, Review, Clear Suspect Link, Link). Now that Review and Clear Suspect Link are reachable from the editor's Problems Quick Fix (User Story 1), the author wants those two icon buttons removed from the tree row itself, while still being able to reach the same two actions from the row's right-click context menu, unchanged.

**Why this priority**: Secondary to the main change, and keeps the TreeView row from offering two access points to the same action once the Quick Fix exists.

**Independent Test**: Open the Doorstop TreeView, hover a document row and an item row, and confirm only the Add and Link icon buttons remain visible on the row. Right-click the same row and confirm Review and Clear Suspect Link still appear in the context menu, in the same place and with the same behavior as before.

**Acceptance Scenarios**:

1. **Given** the Doorstop TreeView is open, **When** the author looks at a requirement item row, **Then** only the "Add Item" and "Link Items" icon buttons are visible on the row; no "Review" or "Clear Suspect" icon button is shown.
2. **Given** the Doorstop TreeView is open, **When** the author looks at a document (root) row, **Then** only the "Add Item" icon button remains visible where "Review" previously also appeared inline.
3. **Given** a requirement item row, **When** the author right-clicks it, **Then** the context menu still lists "Review" and "Clear Suspect" exactly as it does today, and choosing either performs the same action as today.

---

### Edge Cases

- What happens when an item both needs review and has suspect links at the same time? Both Problems appear, each with its own Quick Fix, and each remains independently actionable - exactly as today's two separate CodeLenses behave (acceptance scenario 9).
- What happens when a Quick Fix is invoked while the buffer has unsaved edits made since the last on-disk validation pass (so the Problem may be slightly stale)? The fix still targets the field it names and still requires the existing "save and continue" confirmation before it mutates anything, exactly as today's CodeLens actions do.
- What happens once a fix is applied and the item is no longer flagged? The Problem and its Quick Fix disappear on the next validation refresh, the same as any other resolved Doorstop problem today (acceptance scenario 8).
- What happens to "+ Derive Requirement" now that Review and Clear Suspect Link have moved off the CodeLens track? Nothing changes - it is explicitly out of scope and keeps its current above-line CodeLens exactly as it is today.
- What happens to the Doorstop TreeView's document (root) rows, which today only ever showed "Add" and "Review" inline (not "Clear Suspect" or "Link")? They keep showing "Add" inline and lose the inline "Review" icon, consistent with Review moving out of the row's clickable icons.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: For an item Doorstop's validation reports as needing review, the system MUST offer a "Do Review" Quick Fix at the diagnostic already shown on that item's `reviewed:` line, performing the same review action (same server call, same unsaved-changes confirmation, same success/error messaging) the current "Do Review" CodeLens performs today.
- **FR-002**: For an item Doorstop's validation reports as having a suspect link, the system MUST offer a "Clear Suspect Link" Quick Fix at each such diagnostic's link-entry line, clearing only that one suspect link, matching today's "Clear the Suspicion" CodeLens behavior.
- **FR-003**: When an item has two or more suspect-link diagnostics at once, the system MUST additionally offer a "Clear All Suspect Links" Quick Fix (available alongside "Clear Suspect Link" at any of that item's suspect-link diagnostics), clearing every suspect link on the item, matching today's "Clear All Suspicions" CodeLens behavior.
- **FR-004**: The "Do Review", "Clear Suspect Link", and "Clear All Suspect Links" CodeLenses MUST be removed once their Quick Fix equivalents are in place, so each of those three actions has exactly one entry point instead of two.
- **FR-005**: The "+ Derive Requirement" CodeLens MUST remain exactly as it is today - unchanged placement above the `derived:` line, unchanged trigger, unchanged behavior. This feature does not alter it.
- **FR-006**: Selecting a Quick Fix action MUST produce exactly the outcome (server request, confirmation prompts, success/error feedback) its corresponding CodeLens produces today; only the entry point changes.
- **FR-007**: Quick Fix actions introduced by this feature MUST only be offered where Doorstop's own validation already reports the corresponding problem (needs review / suspect link); the system MUST NOT invent new validation checks to support them.
- **FR-008**: Once a Quick Fix's action is applied and the underlying problem no longer exists, the corresponding Problem and its Quick Fix MUST disappear on the next validation refresh, consistent with how Problems already refresh today.
- **FR-009**: The doorstop TreeView MUST stop showing inline, directly-clickable icon buttons for "Review" and "Clear Suspect Link" on document and requirement item rows.
- **FR-010**: The doorstop TreeView's right-click context menu MUST continue to offer "Review" and "Clear Suspect Link" unchanged - same wording, same position, and same behavior as before this change.
- **FR-011**: The doorstop TreeView's existing inline icon buttons for "Add Item" and "Link Items" MUST remain exactly as they are today.
- **FR-012**: Where the editor surface used for Quick Fix actions supports it, the "Do Review", "Clear Suspect Link", and "Clear All Suspect Links" action titles SHOULD carry a VS Code Codicon glyph (respectively echoing `check-compact`, `check`, and `check-all` from the original request) to keep some visual continuity with the icons originally asked for; a plain text title is acceptable wherever that glyph syntax is not rendered by the surface.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A requirements author can resolve a "needs review" or "suspect link" problem by invoking Quick Fix at the point where Doorstop already reports it, with no separate above-line text link required for either action.
- **SC-002**: The "Do Review", "Clear Suspect Link", and "Clear All Suspect Links" actions produce identical outcomes (confirmations, server changes, success/error messages) before and after this change, with no regression in existing automated test coverage for these actions.
- **SC-003**: Zero "Do Review", "Clear the Suspicion", or "Clear All Suspicions" CodeLens text links remain in requirement documents after the change, while "+ Derive Requirement" continues to appear exactly as before.
- **SC-004**: Each requirement row in the doorstop TreeView shows at most two inline icon buttons (down from four today), with "Review" and "Clear Suspect Link" reachable only through the right-click context menu.
- **SC-005**: Every Quick Fix introduced by this feature is attached to a validation issue Doorstop itself already reports; no new validation logic is invented client-side or server-side to support it.

## Assumptions

- Quick Fix (Code Action) titles may use `$(icon)`-style Codicon syntax to echo the originally requested glyphs; if the concrete editor surface used does not render that syntax, a plain text title is used instead - this is a presentation detail to confirm during implementation, not a change in behavior.
- "The doorstop TreeView" refers to the existing requirements tree whose rows currently expose inline Add, Review, Clear Suspect, and Link icon buttons; other Doorstop views (e.g., the Commands panel) are out of scope unless they expose these same two actions inline.
- Command Palette availability of the underlying review/clear-suspect actions is unchanged by this feature; only their in-editor entry point moves.
- The existing Problems refresh cadence (debounced, on save, per `specs/014-doorstop-validation-diagnostics`) is reused unchanged; this feature does not alter how often or when Problems refresh.
- Diagnostics describe on-disk state; a Quick Fix invoked while the buffer has unsaved edits still goes through the existing "save and continue" confirmation before it mutates anything, exactly as today's CodeLens actions do.
