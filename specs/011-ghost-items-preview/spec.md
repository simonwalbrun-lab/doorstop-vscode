# Feature Specification: Diagram Ghost Items Preview

**Feature Branch**: `011-ghost-items-preview`

**Created**: 2026-09-09

**Status**: Draft

**Input**: User description: "I want to have a new feature for the canvas diagramms. I want to be able to preview all related items. this means that additionaly to the items which are directly added (lets call them body items) I can see all nodes which are connected to them in a let call it "ghost items" this means this ghost nodes are smaller and only contain their Filename. they have the same from the document they come from but in some mutch lighter tone. if the ghost mode is activated by a toggle button, the physics of all "body" nodes needs to be disabled but all ghost items have disabled physics. Addtionaly I want to have a hover previewview of the content of a node (ghost and body) and one toggle button which results in showing also the headings of items and not only the uid."

## Clarifications

### Session 2026-09-09

- Q: What should happen if the user turns on Ghost Preview while Hierarchical Layout mode is also active, since Hierarchical Layout already takes over node positioning and disables physics entirely? → A: Mutually exclusive — turning either mode on disables the other's toggle until the first one is turned off.
- Q: When a ghost item is promoted to a body item via its context menu action, should that also jump to and open the item's file in the editor, matching the project's existing "jump to new items" convention? → A: Yes — promoting a ghost opens/jumps to its file in the editor.
- Q: (post-implementation feedback) Should the hover content preview (former User Story 2, FR-007/FR-008) stay in scope? → A: No — removed. It did not work reliably in practice and is not needed for this feature; body and ghost items are still distinguished visually (size/color) and by their label, without a hover preview.
- Q: After a ghost item is promoted to a body item, should Ghost Preview mode stay on, or turn off automatically? → A: Stay on, and immediately recompute the ghost set so any new items directly linked to the newly-promoted item appear right away.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preview Related Items as Ghost Nodes (Priority: P1)

As a requirements engineer working in the traceability diagram, I want to see every item directly connected to the items I've already added, so I can understand the full context of a requirement's relationships without manually searching for and adding each related item one at a time.

**Why this priority**: This is the core, explicitly requested capability and the reason the feature exists — without it, there is no feature. It delivers value on its own even before the heading toggle exists.

**Independent Test**: Add two items to the canvas where at least one has a link to a requirement not yet on the canvas. Turn on Ghost Preview. Confirm the linked-but-not-added requirement appears as a smaller, lighter-toned node. Turn Ghost Preview off and confirm it disappears and nothing about the originally added items changed.

**Acceptance Scenarios**:

1. **Given** a canvas with one or more body items that have links to items not currently on the canvas, **When** the user turns on Ghost Preview mode, **Then** every item directly connected to a body item appears as a ghost item: smaller than a body item, colored in a lightened version of the color already used for its source document, and labeled the same way body items currently are (per the heading-display toggle — see User Story 3).
2. **Given** Ghost Preview mode is on, **When** the user turns it off, **Then** all ghost items are removed and only the originally added body items remain, unchanged.
3. **Given** Ghost Preview mode is turned on, **When** the canvas is rendered, **Then** body items stay exactly where they are (not moved by physics/auto-arrange), while ghost items are positioned by physics/auto-arrange based on their connections to body items.
4. **Given** Ghost Preview mode is on, **When** the user drags a body item to a new position, **Then** any ghost items connected to it follow it, settling into a new position relative to it under physics.
5. **Given** a body item has no links to anything outside the canvas, **When** Ghost Preview mode is turned on, **Then** no ghost item appears for it and no error is shown.
6. **Given** a related item is linked to more than one body item currently on the canvas, **When** Ghost Preview mode is on, **Then** that related item appears as exactly one ghost item, connected to each relevant body item.
7. **Given** a ghost item is visible, **When** the user opens its context menu and chooses to add it to the diagram, **Then** it becomes a body item — full body-item styling, subject to the same physics rules as other body items, and persisted in the saved diagram — stops being treated as a ghost, and its underlying file opens in the editor.
8. **Given** a ghost item was just promoted, **When** promotion completes, **Then** Ghost Preview mode remains on and the ghost set is immediately recomputed, so any item directly linked to the newly-promoted item that isn't already a body item now appears as a ghost.

---

### User Story 3 - Toggle Between Identifier-Only and Heading Labels (Priority: P3)

As a user, I want to switch node labels between a compact identifier-only view and a view that also shows each item's heading, so I can choose between a dense overview and a more descriptive one depending on what I'm doing.

**Why this priority**: Smallest and most independent of the three asks; a pure display preference that doesn't depend on the other two stories to be useful.

**Independent Test**: With any body items on the canvas, toggle heading display on and confirm labels now show headings in addition to identifiers; toggle it off and confirm labels return to identifier-only.

**Acceptance Scenarios**:

1. **Given** the heading display toggle is off, **When** items are shown on the canvas, **Then** each body item's label shows only its identifier.
2. **Given** the user turns the heading display toggle on, **When** items are shown on the canvas, **Then** each body item's label also shows its heading/title.
3. **Given** ghost items are visible, **When** the heading display toggle is changed in either direction, **Then** ghost item labels change the same way body item labels do (both show identifier-only, or both show identifier-plus-heading).

---

### Edge Cases

- A related item linked to several body items on the canvas at once must render as a single ghost item connected to each of them, not once per relationship; if the body item it's tethered to for physics purposes needs to be picked, any one of its connected body items settling it is acceptable.
- Using a ghost item's context menu to add it to the diagram must fully promote it to a body item (styling, physics behavior, persistence) and must not leave a leftover ghost duplicate of the same item.
- If the system cannot determine an item's related items while Ghost Preview is being turned on (for example, a temporarily unreachable data source), the existing body items and their positions must remain exactly as they were, with a clear indication that the related-items preview is incomplete, rather than the canvas appearing to lose data.
- A ghost item is colored using its own source document's color (lightened), which may differ from the body item(s) it's connected to.
- Turning Ghost Preview off and back on must reproduce the same ghost items for unchanged data (no stale or duplicated ghosts left over from a prior toggle).
- Ghost Preview mode and Hierarchical Layout mode cannot both be on at once: the Ghost Preview toggle is disabled while Hierarchical Layout is active, and vice versa.
- An item that is both a parent and a child of the same body item (a link in each direction) is a single ghost item connected by two separate connections, one drawn each way.
- Turning Ghost Preview on must not produce a brief moment where body items visibly move before settling back into place — FR-004's "stay fixed in place" applies from the instant the toggle is switched on, not only once ghost data has arrived.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The canvas MUST provide a toggle control that turns Ghost Preview mode on and off.
- **FR-002**: When Ghost Preview mode is on, the system MUST show, for every body item on the canvas, every item directly linked to it (in either direction) that is not already a body item, as a ghost item.
- **FR-003**: Ghost items MUST be visually distinct from body items by size (smaller) and color (their own source document's color at a visibly lighter/reduced intensity); their label text follows the same heading-display toggle as body items (see FR-009/FR-010).
- **FR-004**: When Ghost Preview mode is turned on, body items MUST stay fixed in place (not moved by physics/auto-arrange), while ghost items MUST be positioned by physics/auto-arrange based on their connections to body items; moving a body item MUST cause any ghost items connected to it to follow.
- **FR-005**: When Ghost Preview mode is turned off, the system MUST remove all ghost items and MUST NOT change body items' positions or the saved diagram content.
- **FR-006**: A related item connected to multiple body items on the canvas MUST be represented as exactly one ghost item.
- **FR-007**, **FR-008**: *(removed — the hover content preview was cut from scope; see Clarifications)*.
- **FR-009**: The canvas MUST provide a toggle, independent of Ghost Preview mode, that switches body item labels between identifier-only and identifier-plus-heading.
- **FR-010**: The heading-display toggle MUST apply equally to ghost item labels and body item labels — there is no separate label mode for ghost items.
- **FR-011**: Ghost items MUST NOT be written to the saved diagram file; only body items and their explicit connections are persisted.
- **FR-012**: If the system is unable to determine related items when Ghost Preview is enabled, it MUST leave existing body items and their positions unchanged and MUST indicate that the preview is incomplete, rather than clearing or altering the displayed diagram.
- **FR-013**: The system MUST provide a context menu action on a ghost item that adds it to the diagram as a body item, promoting it out of ghost status (full body-item styling, physics behavior, and persistence going forward).
- **FR-016**: After a ghost item is promoted (FR-013), Ghost Preview mode MUST remain on, and the ghost set MUST be recomputed immediately so any item directly linked to the newly-promoted item that isn't already a body item appears as a ghost without the user needing to toggle Ghost Preview off and back on.
- **FR-014**: Ghost Preview mode and the existing Hierarchical Layout mode MUST be mutually exclusive: while one is active, the control for turning on the other MUST be disabled, and turning either off MUST re-enable the other's control.
- **FR-015**: When a ghost item is promoted to a body item via its context menu action (FR-013), the system MUST also open/jump to that item's underlying file in the editor — in the diagram's secondary editor column, the same place clicking any other node's file already opens it — consistent with how other item-creation actions in this extension behave.
- **FR-017**: The connection drawn between a ghost item and a body item MUST follow the direction of the underlying link, in the same orientation already used between two body items (pointing from the child to the parent). A ghost that is a parent of the body item MUST be drawn as the target of the connection; a ghost that is a child of the body item MUST be drawn as its source — the direction MUST NOT be fixed to always point at the ghost.

### Key Entities

- **Body Item**: A requirement item explicitly added to the diagram by the user. Persisted in the saved diagram. Stays fixed in place (not moved by physics) while Ghost Preview mode is on; otherwise follows the normal physics/auto-arrange setting. Its label reflects the current heading-display toggle.
- **Ghost Item**: A requirement item shown only while Ghost Preview mode is on, because it is directly linked to a body item currently on the canvas. Never persisted unless explicitly promoted to a body item via its context menu. Rendered smaller and in a lightened version of its own source document's color. Its label reflects the same heading-display toggle as body items. Positioned by physics/auto-arrange, tethered to the body item(s) it connects to, and follows them if they move.
- **Document Color**: The existing per-source-document color already used to tint items on the canvas; ghost items reuse this color at reduced visual intensity.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can reveal every item directly related to what's already on the canvas in a single interaction (one toggle), without manually searching for or adding each related item.
- **SC-002**: A user can tell a directly-added item apart from a related-but-not-added item at a glance, without consulting a legend, in at least 90% of informal spot checks.
- **SC-003**: *(removed — depended on the hover content preview cut from scope; see Clarifications)*.
- **SC-004**: Turning Ghost Preview on and off never changes the saved diagram file or the arrangement of the user's originally added items.
- **SC-005**: A user can switch between a compact and a descriptive view of the whole diagram's labels in a single interaction, with the change visible on every body item immediately.

## Assumptions

- "Related"/"connected" items means items with a direct link to a body item (one hop). Expanding further from a ghost item's own connections (multi-hop) is out of scope for this feature.
- Ghost items are computed fresh whenever Ghost Preview mode is turned on and are never written to the saved diagram file; only body items and their explicit links persist, matching how the diagram is saved today.
- "Filename" in the request is interpreted as the item's identifier (the same identifier already shown on body items today), not a literal on-disk file name with extension.
- Clicking or double-clicking a ghost item behaves the same as it already does for a body item (for example, opening or revealing the underlying requirement), so interaction stays consistent across both kinds of nodes.
- Turning Ghost Preview mode off restores whatever physics/auto-arrange state the user had set for body items before turning it on.
- The heading-display toggle and Ghost Preview mode are independent controls; either can be used without the other.
- No maximum number of ghost items is enforced in this version; a related item with an unusually large number of connections may produce visual crowding, which is treated as a known limitation rather than a blocking requirement.
