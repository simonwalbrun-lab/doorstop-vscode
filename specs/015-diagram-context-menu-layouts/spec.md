# Feature Specification: Diagram Context Menu Actions & Static Layouts

**Feature Branch**: `015-diagram-context-menu-layouts`

**Created**: 2026-09-10

**Status**: Draft

**Input**: User description: "On the canvas diagramms I want to be able to do the following in the contect menu of elements: delete elements from diagramms. add a link from e element to another from the context menu, I want that the autoaragen is disabled at all (expect the ghost nodes. thex should behave like now.) the hierachical view and one for arregement of all body nodes as a box/grid close to a square shall be added. As the auto-arrage is no longer needed remove that button. this means that there is no longer a depenceny of hierachical button and the rest as all body elements are always static"

## Clarifications

### Session 2026-09-10

- Q: Does "delete elements from diagrams" remove the item from the diagram only, or also delete the requirement? → A: From the diagram only. The requirement and all of its links are untouched.
- Q: Are the hierarchical and grid arrangements persistent modes or one-shot commands? → A: One-shot. They compute positions once; afterwards body items are static and freely draggable, which is what removes the button interdependency.
- Q: How does the context-menu link action choose its target? → A: The user clicks a second node on the canvas; Escape or a click on empty canvas cancels.
- Q: What happens to spec 011's rule that Ghost Preview and Hierarchical Layout are mutually exclusive? → A: Removed. Spec 011 FR-014 has been struck through and annotated as superseded by FR-024 here.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Remove an item from the diagram via its context menu (Priority: P1)

As a requirements engineer building up a traceability diagram, I want to right-click
a node on the canvas and remove it from the diagram, so I can prune a diagram that
has grown too large without touching the underlying requirement or its links.

**Why this priority**: Adding items to a diagram is already possible; removing them
is not, so diagrams can only ever grow. This is the most-missed everyday action and
delivers value entirely on its own.

**Independent Test**: Open a diagram with several items, right-click one, choose the
remove action, and confirm the node and its connecting lines disappear from the
canvas, the diagram file no longer references it, and the requirement itself and all
of its links are unchanged on disk.

**Acceptance Scenarios**:

1. **Given** a diagram with two or more body items, **When** the user opens a body
   item's context menu and chooses the remove action, **Then** that node disappears
   from the canvas along with every connecting line drawn to or from it.
2. **Given** a node has just been removed, **When** the diagram is saved and
   reopened, **Then** the removed item is still absent.
3. **Given** a node has just been removed, **When** the user inspects the underlying
   requirement, **Then** the requirement still exists and all of its links are
   unchanged — only the diagram's contents changed.
4. **Given** a diagram whose last remaining item is removed, **When** removal
   completes, **Then** an empty canvas is shown with no error.
5. **Given** Ghost Preview is on and a removed body item was the only reason a ghost
   item was shown, **When** removal completes, **Then** that ghost item disappears
   too and the remaining ghost set is recomputed.

---

### User Story 2 - Create a link between two items from the context menu (Priority: P1)

As a requirements engineer, I want to right-click a node, choose to add a link, and
then pick the item it should link to, so I can create a real traceability link
without having to perform a precise drag gesture on the canvas.

**Why this priority**: Link creation on the canvas today depends on a drag gesture
that is easy to miss and hard to perform on trackpads or a dense canvas. A
context-menu path makes the same core capability reliably reachable.

**Independent Test**: With two unlinked items on the canvas, right-click the first,
choose the add-link action, select the second, and confirm a new connecting line
appears and the link is present in the source requirement's stored links.

**Acceptance Scenarios**:

1. **Given** two body items on the canvas that are not linked, **When** the user
   opens the first item's context menu, chooses the add-link action, and selects the
   second item, **Then** a real link is created in the requirement data and a
   connecting line appears between the two nodes.
2. **Given** the add-link action has been started, **When** the user cancels
   (Escape, or clicking empty canvas), **Then** no link is created and the diagram is
   unchanged.
3. **Given** the add-link action has been started, **When** the user selects the same
   node the action started from, **Then** no self-link is created and the user is
   told why.
4. **Given** two items that are already linked, **When** the user creates the same
   link again, **Then** the operation succeeds silently and no duplicate connecting
   line appears.
5. **Given** the add-link action targets an item that cannot be linked (for example
   the link would be rejected by the requirement data), **When** the attempt is made,
   **Then** the user sees an actionable error and the diagram is unchanged.

---

### User Story 3 - Body items never move on their own (Priority: P1)

As a user who has arranged a diagram by hand, I want body items to stay exactly
where I put them at all times, so that adding an item, toggling a view option, or
reopening the diagram never rearranges my layout behind my back.

**Why this priority**: The current auto-arrange behaviour silently destroys manual
layouts, which is the single biggest source of frustration with diagrams. Every
other story in this feature assumes stable positions.

**Independent Test**: Arrange several items by hand, then add another item, toggle
Ghost Preview on and off, and toggle heading labels; confirm no previously placed
body item has moved.

**Acceptance Scenarios**:

1. **Given** body items placed at chosen positions, **When** a new item is added to
   the diagram, **Then** no existing body item moves, and the new item appears where
   it was dropped (or, when added without a drop point, at a free position that does
   not overlap an existing node).
2. **Given** body items placed at chosen positions, **When** Ghost Preview is turned
   on and off, **Then** no body item moves.
3. **Given** Ghost Preview is on, **When** ghost items are shown, **Then** ghost
   items are positioned and settle automatically exactly as they do today, and they
   follow a body item that the user drags.
4. **Given** a diagram is saved and reopened, **When** it is rendered, **Then** every
   body item is at the position it was saved at.
5. **Given** the diagram toolbar, **When** the user looks at it, **Then** there is no
   auto-arrange enable/disable control, because body items are always static.

---

### User Story 4 - Arrange all body items as a near-square grid (Priority: P2)

As a user whose diagram has become a tangle, I want a one-click action that lays all
body items out in a compact box/grid roughly as wide as it is tall, so I can get an
orderly starting point and then fine-tune by hand.

**Why this priority**: A recovery action for a messy canvas. Valuable, but only once
static positioning (User Story 3) exists.

**Independent Test**: Scatter nine items randomly, invoke the grid arrangement, and
confirm they form a 3×3 grid with even spacing and no overlaps.

**Acceptance Scenarios**:

1. **Given** N body items on the canvas, **When** the grid arrangement is invoked,
   **Then** all body items are repositioned into a rectangular grid whose column and
   row counts differ by at most one, with uniform spacing and no two nodes
   overlapping.
2. **Given** a grid arrangement has been applied, **When** the user drags a node
   afterwards, **Then** it moves and stays where it was dropped — the arrangement is
   not re-applied.
3. **Given** a grid arrangement has been applied, **When** the diagram is saved and
   reopened, **Then** the grid positions are preserved.
4. **Given** an empty canvas, **When** the grid arrangement is invoked, **Then**
   nothing happens and no error is shown.
5. **Given** Ghost Preview is on, **When** the grid arrangement is invoked, **Then**
   only body items are placed on the grid and ghost items continue to settle around
   them.

---

### User Story 5 - Arrange all body items hierarchically, with no button dependencies (Priority: P2)

As a user, I want the hierarchical arrangement to be just another way of laying out
the body items, available at any time regardless of which other view options are on.

**Why this priority**: The hierarchical view already exists but is entangled with
auto-arrange and Ghost Preview through mutual disabling. Removing that entanglement
is a simplification that makes the whole toolbar predictable.

**Independent Test**: With Ghost Preview on, invoke the hierarchical arrangement and
confirm it applies without any control being greyed out, and that Ghost Preview
stays on.

**Acceptance Scenarios**:

1. **Given** body items on the canvas, **When** the hierarchical arrangement is
   invoked, **Then** body items are repositioned into a top-down hierarchy following
   their link direction.
2. **Given** any combination of Ghost Preview and heading-label settings, **When** the
   user looks at the toolbar, **Then** no toolbar control is disabled or greyed out
   because of another control's state.
3. **Given** the hierarchical arrangement has been applied, **When** the user drags a
   node, **Then** it moves freely and stays where it was dropped.
4. **Given** the hierarchical arrangement has been applied, **When** the grid
   arrangement is invoked, **Then** the body items are re-laid out as a grid.

---

### Edge Cases

- Removing a node while the add-link action is waiting for a target: the pending
  action is cancelled and no link is created.
- Removing a node whose underlying file no longer exists on disk: the node is still
  removed from the diagram without error.
- Grid or hierarchical arrangement with exactly one body item: the item is placed at
  the single grid/root position; no error.
- Grid arrangement with items of differing label widths (headings shown): spacing is
  sized so no two nodes overlap at the widest label in use.
- Hierarchical arrangement on body items that have no links to each other: they are
  laid out as independent roots without error.
- Invoking a layout action while a link creation or item creation is still in
  progress: the layout applies to the items present at that moment; newly arriving
  items are placed without disturbing the arranged ones.

## Requirements *(mandatory)*

### Functional Requirements

#### Context menu — removal

- **FR-001**: The context menu of a body item on the canvas MUST offer an action that
  removes that item from the diagram.
- **FR-002**: Removing a body item MUST remove its node and every connecting line
  drawn to or from it from the canvas.
- **FR-003**: Removing a body item MUST NOT delete the underlying requirement and MUST
  NOT change any link stored in the requirement data.
- **FR-004**: A removal MUST be persisted so that the item is still absent after the
  diagram is saved and reopened.
- **FR-005**: When Ghost Preview is active, removing a body item MUST cause the ghost
  set to be recomputed immediately.

#### Context menu — link creation

- **FR-006**: The context menu of a body item MUST offer an action that creates a link
  from that item to another item the user then selects.
- **FR-007**: The add-link action MUST create a real link in the requirement data (not
  a canvas-only line) and MUST show the resulting connecting line on the canvas.
- **FR-008**: The add-link action MUST be cancellable before a target is chosen, with
  no change to the diagram or the requirement data.
- **FR-009**: The add-link action MUST reject a link from an item to itself and tell
  the user why.
- **FR-010**: Re-creating a link that already exists MUST succeed silently without
  producing a duplicate connecting line.
- **FR-011**: When link creation fails, the user MUST see an actionable error message
  and the diagram MUST be left unchanged.
- **FR-012**: The existing context-menu actions MUST be preserved: creating a new
  linked item from a body item, removing a link from a connecting line, and promoting
  a ghost item to a body item.

#### Static body items

- **FR-013**: Body items MUST never be repositioned automatically. Their position
  changes only when the user drags them or explicitly invokes a layout action.
- **FR-014**: Adding an item, toggling Ghost Preview, toggling heading labels, saving,
  or reopening the diagram MUST NOT change any body item's position.
- **FR-015**: An item added without an explicit drop point MUST be placed at a free
  position that does not overlap an existing node.
- **FR-016**: Ghost items MUST retain their current behaviour exactly: they are
  positioned automatically relative to the body items they connect to and re-settle
  when a body item is dragged.
- **FR-017**: The auto-arrange enable/disable control MUST be removed from the diagram
  toolbar.

#### Layout actions

- **FR-018**: The diagram MUST offer an action that arranges all body items in a
  rectangular grid whose column and row counts differ by at most one (as close to
  square as the item count allows), with uniform spacing and no overlapping nodes.
- **FR-019**: The diagram MUST offer an action that arranges all body items
  hierarchically, top-down, following link direction.
- **FR-020**: Layout actions MUST apply only to body items; ghost items MUST continue
  to be positioned by their existing automatic behaviour.
- **FR-021**: After a layout action, body items MUST remain freely draggable and MUST
  stay wherever the user drops them — the layout MUST NOT be re-applied on any later
  event.
- **FR-022**: Positions produced by a layout action MUST be persisted with the diagram.
- **FR-023**: A layout action invoked on a diagram with no body items MUST do nothing
  and MUST NOT show an error.
- **FR-024**: No diagram toolbar control may be disabled, greyed out, or forced off as
  a consequence of another control's state.

### Key Entities

- **Diagram**: The saved canvas. Holds the set of body items it contains and each
  one's position. Removal and layout actions change this; nothing else does.
- **Body item**: A requirement explicitly added to the diagram. Has a fixed position
  owned by the user, a label, and a document-derived colour.
- **Ghost item**: A requirement shown only because it links to a body item. Not part
  of the saved diagram; positioned automatically. Unchanged by this feature.
- **Link**: A directed traceability relationship between two requirements, stored in
  the requirement data and drawn as a connecting line. Created and removed via the
  context menu; never changed by removing a node from a diagram.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can remove an item from a diagram in at most two interactions
  (open context menu, choose action) without leaving the canvas.
- **SC-002**: A user can create a link between two visible items in at most three
  interactions, with no drag gesture required.
- **SC-003**: Across a session of adding items and toggling every view option, 100% of
  manually placed body items remain at their exact positions.
- **SC-004**: For any diagram of 2–100 body items, the grid arrangement produces a
  layout whose width-to-height ratio in nodes is between 1:2 and 2:1, with zero
  overlapping nodes.
- **SC-005**: Every diagram toolbar control is usable at all times; zero controls are
  disabled as a side effect of another control.
- **SC-006**: Removing a node from a diagram changes zero bytes of the underlying
  requirement files.
- **SC-007**: A layout action on a 50-item diagram completes and settles within 2
  seconds on a typical developer machine.

## Assumptions

- "Delete elements from diagrams" means removing the item from the diagram only. The
  underlying requirement and its links are untouched; deleting a requirement itself
  remains a separate, existing command outside the canvas.
- Both layout actions ("Hierarchical" and the new grid/box arrangement) are one-shot
  arrangement commands, not persistent modes: they compute positions once, after which
  body items are static and freely draggable like any other body item. This is what
  makes "no dependency between the hierarchical button and the rest" possible.
- The add-link action selects its target by clicking another node on the canvas after
  the action is chosen, with Escape or a click on empty canvas cancelling. Only items
  currently on the canvas can be chosen as a target; linking to an item not on the
  canvas remains covered by the existing "add linked item" flow.
- Link direction for the context-menu action follows the same convention as the
  existing drag-to-link gesture (from the item whose context menu was opened, to the
  selected item).
- Ghost item behaviour, the Ghost Preview toggle, and the heading-label toggle are
  unchanged by this feature apart from no longer being mutually disabled with the
  hierarchical control.
- The existing rule that dragging from the Explorer tree onto the canvas does not work
  (a VS Code platform limitation) is unchanged.
- Automatic node positioning still exists internally for ghost items; "auto-arrange is
  disabled" means it never applies to body items and is no longer user-controllable.

## Dependencies

- Builds on the existing traceability diagram canvas, its context menu, and its save
  format (specs 007, 008).
- Builds on the ghost items preview feature (spec 011); this feature removes the
  mutual-exclusivity rule between Ghost Preview and the hierarchical control that
  spec 011 established, and that clarification in spec 011 is superseded here.

## Out of Scope

- Deleting a requirement from the repository via the canvas.
- Multi-select removal or bulk layout of a chosen subset of nodes.
- Undo/redo for removal or layout actions.
- New layout algorithms beyond the grid and the existing hierarchical arrangement.
- Automatic edge routing or overlap avoidance for connecting lines.
