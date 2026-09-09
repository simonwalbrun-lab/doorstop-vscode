# Feature Specification: Traceability Diagram — Canvas Interaction

**Feature Branch**: `N/A (retroactive documentation)`

**Created**: 2026-09-09

**Status**: Implemented (reverse-engineered from existing code)

**Input**: User description: "Reverse-engineered from existing implementation — see CHANGELOG.md and README.md for release history."

## Clarifications

### Session 2026-09-09

- Q: What happens when the user tries to add the same requirement to the diagram twice? → A: Silent no-op — if a node for that UID already exists on the canvas, the add attempt does nothing (no duplicate node, no warning).
- Q: What happens when a link-creation attempt targets two nodes that are already linked? → A: Succeeds silently and idempotently — Doorstop stores an item's links as a set, so re-creating an existing link is a no-op rather than an error.
- Q: What happens when the diagram is closed and reopened after the VS Code window was reloaded mid-edit? → A: Unsaved canvas changes, including dragged node positions, are lost. A hot-exit backup file is written on every change, but reopening always reads the original file on disk rather than that backup, so the backup does not currently achieve recovery (see Assumptions and Follow-up Tasks).
- Q: Does dragging an item from the Doorstop Explorer TreeView onto an open diagram work? → A: No — this is a known VS Code platform limitation (TreeDragAndDropController payloads aren't reliably delivered as webview DataTransfer), not a bug in this extension. "Add to Diagram" (FR-002) is the only supported way to add a tree item; drag-and-drop (FR-001) only works from an editor.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add a requirement to an open diagram (Priority: P1)

As a developer, I want to add a requirement to an already-open diagram either by
dragging it from an editor, or via a right-click "Add to Diagram" command on a
tree item, so I can build up the diagram from requirements I'm already looking
at.

**Why this priority**: The core way diagrams get populated; without it,
diagrams stay empty.

**Independent Test**: With a diagram open, drag a requirement from an editor
onto the canvas; confirm a node for it appears. Separately, right-click a tree
item and choose "Add to Diagram"; confirm the same result without dragging.

**Acceptance Scenarios**:

1. **Given** an open diagram and a requirement dragged from an editor, **When**
   the item is dropped on the canvas, **Then** a node representing it appears
   at the drop location.
2. **Given** an open diagram and a tree item's "Add to Diagram" context-menu
   action, **When** it is invoked, **Then** a node for that item appears on the
   canvas even though no drag occurred.
3. **Given** the referenced requirement's file cannot be located, **When** an
   add-to-diagram attempt is made, **Then** the user sees a warning and no
   invalid node is added.

**Technical Limitation**: Dragging an item directly from the Doorstop Explorer
TreeView onto the diagram canvas does not work — VS Code does not reliably
deliver a `TreeDragAndDropController` payload as webview `DataTransfer` (a
known platform limitation, not something this extension controls). The
"Add to Diagram" context-menu action (FR-002) exists specifically because of
this and is the only supported way to add a tree item to an open diagram;
drag-and-drop (FR-001) only works when dragging from an editor.

---

### User Story 2 - Create and remove links directly on the canvas (Priority: P1)

As a developer, I want to draw a connection between two nodes to create a real
traceability link, or right-click an existing connection to remove it, so the
diagram and the underlying Doorstop data stay in sync.

**Why this priority**: Turning the diagram into a true editing surface (not
just a viewer) is the feature's main differentiator.

**Independent Test**: Draw an edge between two existing nodes; confirm the link
is created in the underlying requirement files. Then remove that edge via
right-click; confirm the link is removed.

**Acceptance Scenarios**:

1. **Given** two nodes on the canvas, **When** the user draws an edge between
   them, **Then** a real parent-child link is created via the server and the
   edge is only shown once that succeeds.
2. **Given** the user attempts to draw an edge from a node to itself, **When**
   the draw action completes, **Then** it is rejected without any server
   request.
3. **Given** an existing edge, **When** the user removes it via its context
   menu, **Then** the underlying link is deleted via the server and the edge
   disappears only once that succeeds.
4. **Given** a link creation or removal request fails, **When** the failure is
   reported, **Then** the user sees the error and the canvas reflects the
   unchanged (pre-attempt) state.

---

### User Story 3 - Create a new, already-linked item from the canvas (Priority: P2)

As a developer, I want to right-click a node and create a brand-new item that's
immediately linked to it and placed on the canvas, without leaving the diagram.

**Why this priority**: A convenience shortcut over "create item elsewhere, then
drag it in, then link it" — valuable but not required to use the diagram.

**Independent Test**: Right-click a node, choose "Add Linked Item...", pick a
target document; confirm a new linked item is created, added to the canvas,
and opened.

**Acceptance Scenarios**:

1. **Given** a node's "Add Linked Item..." action and a chosen target document,
   **When** the action completes, **Then** a new item exists in that document,
   is linked to the source node's requirement, appears as a new node on the
   canvas, and opens in the editor.

---

### User Story 4 - Open requirements from the diagram (Priority: P2)

As a developer, I want clicking a node to preview its file beside the diagram,
and double-clicking to keep it open permanently, so I can inspect requirements
while keeping the diagram visible.

**Why this priority**: A navigation convenience; the diagram is still usable
for link-editing without it.

**Independent Test**: Single-click a node, confirm its file opens as a preview
tab beside the diagram; double-click another node, confirm it opens as a
permanently pinned tab.

**Acceptance Scenarios**:

1. **Given** a diagram is open, **When** the user single-clicks a node,
   **Then** its file opens in a preview tab beside the diagram (reused on
   subsequent single-clicks) and the Explorer tree reveals it.
2. **Given** a diagram is open, **When** the user double-clicks a node,
   **Then** its file opens in a permanent (non-preview) tab.

---

### User Story 5 - Adjust the canvas layout and view (Priority: P3)

As a developer, I want to toggle between free-form and hierarchical layout, see
a legend explaining status icons and document colors, and delete nodes/edges I
no longer want on the canvas.

**Why this priority**: Presentation/cleanup conveniences, not required for the
diagram's core value.

**Independent Test**: Toggle the layout mode and confirm nodes rearrange
accordingly, then toggle back and confirm manually-placed positions are
restored; select a node and delete it, confirm it and its edges are removed and
the removal persists on save.

**Acceptance Scenarios**:

1. **Given** a diagram with manually positioned nodes, **When** the user
   toggles to hierarchical layout and back to free-form, **Then** the original
   manual positions are restored.
2. **Given** a legend toggle control, **When** the user opens it, **Then** it
   explains each status badge icon and the color assigned to each document.
3. **Given** a selected node or edge, **When** the user deletes it, **Then** it
   is removed from the canvas and that removal is reflected the next time the
   diagram is saved.

---

### Edge Cases

- Adding a requirement already present on the canvas is a silent no-op — no
  duplicate node is created and no message is shown.
- Creating a link that already exists is a silent no-op — it succeeds without
  error and does not create a second copy of the link.
- Drawing an edge that would create a cyclic dependency (not just a direct
  self-link) is rejected with an error, the same way any other failed link
  request is (FR-006).
- Unsaved canvas changes (including dragged node positions) are lost if VS Code
  is reloaded mid-edit — see Assumptions and Follow-up Tasks for why the
  existing backup mechanism does not currently prevent this.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to add a requirement to an open diagram via
  drag-and-drop from an editor. Dragging from the Doorstop Explorer TreeView is
  a known, unsupported limitation (see Technical Limitation under User Story
  1) — not a requirement this system meets today.
- **FR-002**: Users MUST be able to add a requirement to an open diagram via a
  context-menu action ("Add to Diagram" on a tree item), as the reliable,
  supported path for tree items, since drag-and-drop from the tree does not
  work.
- **FR-003**: System MUST warn the user and add no node when a drag/drop or
  add-to-diagram action references a requirement file that cannot be located.
- **FR-004**: Users MUST be able to create a real traceability link by drawing a
  connection between two nodes on the canvas.
- **FR-005**: System MUST reject a self-referencing edge (a node connected to
  itself) without contacting the server.
- **FR-006**: System MUST only display a drawn or removed edge on the canvas
  once the corresponding link creation/removal has been confirmed by the
  server; a failed request MUST leave the canvas showing its prior, unchanged
  state and MUST surface the error to the user.
- **FR-007**: Users MUST be able to remove an existing link by removing its edge
  via a context-menu action on the canvas.
- **FR-008**: Users MUST be able to create a brand-new item, already linked to
  a selected node, directly from the canvas, ending with the new node visible
  and its file open.
- **FR-009**: Single-clicking a node MUST open its file in a reusable preview
  tab beside the diagram and update the Explorer tree's active selection.
- **FR-010**: Double-clicking a node MUST open its file in a permanent,
  non-preview tab.
- **FR-011**: Users MUST be able to toggle between a free-form and a
  hierarchical layout without losing previously set manual node positions.
- **FR-012**: System MUST provide a legend explaining status badge icons and
  per-document node coloring.
- **FR-013**: Users MUST be able to delete a node or edge from the canvas, with
  the removal reflected in the diagram file on save.
- **FR-014**: System MUST treat adding a requirement that already has a node on
  the canvas as a no-op — no duplicate node and no error.
- **FR-015**: System MUST treat creating a link that already exists as a
  successful no-op rather than an error.
- **FR-016**: System MUST reject drawing an edge that would create a cyclic
  dependency anywhere in the tree (not only a direct self-link), surfacing the
  failure the same way as any other rejected link request (FR-006).

### Key Entities

- **Canvas Node**: a visual representation of a requirement item on the
  diagram, positioned manually or by the current layout mode.
- **Canvas Edge**: a visual representation of a link between two nodes, always
  backed by a real server-confirmed link.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can build a complete diagram of a subset of their
  project using only the mouse, without hand-editing any file.
- **SC-002**: Every link visible on a diagram corresponds to a real, verifiable
  link in the underlying requirements — the canvas never shows a link that
  doesn't exist, or vice versa after a confirmed edit.
- **SC-003**: A developer can inspect any node's full requirement content
  without losing their place on the diagram.

## Assumptions

- Canvas layout state (positions, current layout mode) is treated as part of
  the diagram file / webview session state, not something the server tracks.
- "Add Linked Item..." reuses the same target-document selection convention as
  the standalone Add Item command (see `003-item-lifecycle-commands`), rather
  than introducing a separate rule.
- Known limitation, not a design intent: the custom editor's
  `backupCustomDocument` faithfully writes a hot-exit backup file on every
  canvas change, but `openCustomDocument` always re-reads the original diagram
  file from disk and never consults that backup when VS Code restores the
  editor after a reload/crash. The backup is currently write-only — it does not
  achieve the recovery VS Code's backup API is meant to provide. Fixing this
  (reading from `openContext.backupId` when present) is out of scope for this
  spec but is a real gap worth a follow-up task (see Follow-up Tasks below).

## Follow-up Tasks

Not part of this spec's requirements (these describe known gaps to fix, not
intended behavior) — tracked here since no `plan.md`/`tasks.md` exists yet for
this feature:

- [ ] Fix hot-exit recovery for diagrams: `openCustomDocument` in
  `src/extension.ts` ignores `openContext.backupId`. It should check for a
  backup and read the diagram from it when present, instead of always reading
  `uri` from the original file, so unsaved canvas changes (including dragged
  node positions) actually survive a VS Code crash/reload as intended by
  `backupCustomDocument`.
