# Feature Specification: Diagram Canvas Refinement

**Feature Branch**: `025-diagram-canvas-refinement`

**Created**: 2026-10-09

**Status**: Draft

**Input**: User description: "We need to do the next iteration on the canvas. First the access point of the canvas is moved from the doorstop treeview to the doorstop command panel. The command open diagram is removed only new diagramm is kept. opening a existing diagramm is from now on only possible by clicking on the respecive file. during loading of the canvas the file the existing file pathes need to be checked. if a item is moved but can be found by the alias again, the path is updated during loading of the file. the edit command in the top line needs to be removed. editing is from now on only possible by the buttons and context menu. the commands for sorting and ordering the itmes on the canvas need to consider the size of the element. e.g. if the headings are shown the size of the items changes. If a heading is long there should be a linebreak after about 30 chars with the next space. I want to have removed the feature of showing icons. This should be remoed. this means the review suspsect status and so one is no longer needed."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Diagram file stays valid after items move (Priority: P1)

A requirements engineer reorganizes the repository (an item file is moved to another folder, or a document directory is relocated). Later they open an existing diagram file. The canvas recognizes that a stored item path no longer points to the item, finds the item again by its identifier (UID, the "alias" stored for each node), and updates the stored path so the diagram keeps showing the item instead of a broken node.

**Why this priority**: A diagram that silently breaks after a routine file move loses the user's curated work. This is the only part of the iteration that protects data; everything else is UI cleanup.

**Independent Test**: Create a diagram containing an item, save it, move the item's file to another location in the workspace, reopen the diagram, and verify the node is shown, opens the moved file on click, and the diagram reports the corrected path once saved.

**Acceptance Scenarios**:

1. **Given** a saved diagram whose node refers to item `REQ-001` at path `reqs/REQ-001.yml`, **When** that file has been moved to `reqs/sub/REQ-001.yml` and the diagram is opened, **Then** the node for `REQ-001` is displayed normally and its stored path is updated to `reqs/sub/REQ-001.yml`.
2. **Given** the path was corrected during loading, **When** the user saves the diagram, **Then** the saved file contains the corrected workspace-relative path.
3. **Given** a diagram whose stored paths are all still correct, **When** it is opened, **Then** no path is changed and the diagram is not marked as modified.
4. **Given** a node whose stored path is wrong and whose UID no longer exists in the project, **When** the diagram is opened, **Then** the node and its stored data are kept unchanged and the user is told which item(s) could not be resolved.

---

### User Story 2 - Layout commands respect real node size (Priority: P1)

A user turns on "Show Headings" so nodes display their heading text, then runs Grid Layout or Hierarchical Layout. The arrangement accounts for each node's actual width and height, so no nodes overlap and spacing looks even. Long headings wrap onto several lines (break at the first space after roughly 30 characters) instead of producing very wide nodes.

**Why this priority**: Overlapping nodes after a layout command make the diagram unreadable and force manual rearrangement, defeating the purpose of the layout commands.

**Independent Test**: Load a diagram with items that have short and long headings, enable headings, run each layout command, and verify no two node boxes overlap and long headings appear on multiple lines.

**Acceptance Scenarios**:

1. **Given** headings are shown and several nodes have headings of different lengths, **When** the user runs Grid Layout, **Then** no two node boxes overlap and the gap between neighbouring boxes is consistent.
2. **Given** headings are shown, **When** the user runs Hierarchical Layout, **Then** no two node boxes overlap.
3. **Given** headings are hidden, **When** the user runs either layout command, **Then** nodes are spaced according to their (smaller) size rather than a fixed spacing sized for the largest possible label.
4. **Given** an item heading of 70 characters with spaces, **When** headings are shown, **Then** the heading is displayed on multiple lines, each line break occurring at the first space after the first 30 characters of the remaining text.
5. **Given** a heading of more than 30 characters with no space after its first 30 characters, **When** headings are shown, **Then** the remainder stays on the current line (no mid-word break).

---

### User Story 3 - Canvas entry point lives in the Commands panel (Priority: P2)

A user wants to create a new diagram. They find "New Diagram" in the Doorstop Commands panel alongside the other Doorstop actions. The Doorstop TreeView title bar no longer shows diagram buttons. To open an existing diagram, the user simply clicks the `*.doorstop.json` file in the Explorer; there is no separate "Open Diagram" command anymore.

**Why this priority**: Consolidates actions in one place and removes a redundant command, but does not change what the user can achieve.

**Independent Test**: Verify the Commands panel shows "New Diagram" and running it creates and opens a diagram; verify the TreeView title bar has no diagram buttons; verify "Open Traceability Graph" no longer appears anywhere; verify clicking a `*.doorstop.json` file opens the canvas.

**Acceptance Scenarios**:

1. **Given** the Doorstop Commands panel is visible, **When** the user looks at its entries, **Then** a "New Diagram" entry is listed.
2. **Given** the user clicks "New Diagram" in the Commands panel, **When** they choose a file name, **Then** a new diagram file is created and opened in the canvas.
3. **Given** the Doorstop TreeView, **When** the user looks at its title bar, **Then** neither "Open Traceability Graph" nor "New Traceability Graph" buttons are present.
4. **Given** the Command Palette, **When** the user searches for "Open Traceability Graph", **Then** no such command exists.
5. **Given** an existing `*.doorstop.json` file in the Explorer, **When** the user clicks it, **Then** it opens in the diagram canvas.

---

### User Story 4 - Editing only through buttons and context menu (Priority: P2)

The canvas no longer shows the generic "Edit" control in its top-left corner. All editing (adding links, removing links, removing items from the diagram, adding linked items) is done through the toolbar buttons and the right-click context menu, which already offer these actions.

**Why this priority**: Removes a duplicate, confusing editing mode; low risk because equivalent actions already exist.

**Independent Test**: Open a diagram and verify no "Edit" control appears at the top of the canvas, and that adding a link, removing a link, and removing an item all still work via the context menu.

**Acceptance Scenarios**:

1. **Given** a diagram is open, **When** the user looks at the top of the canvas, **Then** no "Edit" control is shown.
2. **Given** a diagram is open, **When** the user right-clicks a node and chooses "Add Link to...", "Remove from Diagram" or "Add Linked Item...", **Then** the action works as before.
3. **Given** a diagram is open, **When** the user right-clicks an edge and chooses "Remove Link", **Then** the link is removed as before.

---

### User Story 5 - No status icons on the canvas (Priority: P3)

The canvas no longer shows status icons on nodes (reviewed / not reviewed, suspect link, derived, inactive, non-normative) and no longer highlights suspect items with a red border. The legend shows only the document colour key. Nodes show the identifier and, when enabled, the heading only.

**Why this priority**: Visual simplification requested by the user; the review/suspect workflow remains available elsewhere in the extension.

**Independent Test**: Open a diagram containing a reviewed item, an unreviewed item, a suspect item and a derived item; verify none shows an icon or a special border, and the legend has no "Status" section.

**Acceptance Scenarios**:

1. **Given** a diagram with items in various review/suspect/derived/active/normative states, **When** the canvas renders, **Then** no node shows a status icon and all nodes use their document colour without a suspect border.
2. **Given** the legend is expanded, **When** the user reads it, **Then** only the document colour section is shown.
3. **Given** ghost preview is enabled, **When** ghost nodes appear, **Then** they also show no status icons.

---

### Edge Cases

- Item UID appears more than once in the project: Doorstop itself rejects such a project when loading the tree, so item locations cannot be determined and FR-011 applies (diagram rendered as stored, paths not verified, user informed). The canvas never has to choose between two candidate paths.
- Stored path still exists but now holds a different item (e.g. files swapped): the node's UID is authoritative; the path is updated to wherever that UID now lives.
- Requirement server not reachable while loading: no path is changed, nodes are rendered from what is stored in the file, and the user is informed that paths could not be verified.
- Diagram opened from a hot-exit/backup copy: path correction applies the same way to the restored content.
- Heading shorter than the wrap threshold: displayed on a single line, unchanged.
- Very long single word heading (no spaces): not broken; node grows wider.
- Layout command run with zero or one node: silent no-op, as today.
- Toggling headings after a layout: node sizes change, but positions are not rearranged automatically; the user re-runs the layout if desired.
- Existing diagrams that relied on the removed "Open Traceability Graph" command: still openable by clicking the file.

## Requirements *(mandatory)*

### Functional Requirements

#### Entry point

- **FR-001**: The Doorstop Commands panel MUST list a "New Diagram" entry that creates a new diagram file and opens it in the canvas.
- **FR-002**: The Doorstop TreeView title bar MUST NOT show diagram-related buttons ("Open Traceability Graph", "New Traceability Graph").
- **FR-003**: The "Open Traceability Graph" command MUST be removed entirely (not listed in the Command Palette or any menu).
- **FR-004**: Clicking a `*.doorstop.json` file in the Explorer MUST open it in the diagram canvas.
- **FR-005**: The "Add to Diagram" context action on TreeView items MUST remain available unchanged.

#### Path verification on load

- **FR-006**: When a diagram is loaded, the system MUST check every stored item path against the current location of the item identified by that node's UID.
- **FR-007**: If the stored path differs from the item's current location and the UID resolves to exactly one item, the system MUST replace the stored path with the current workspace-relative path.
- **FR-008**: When at least one path was corrected, the diagram MUST be marked as modified so the correction is persisted through the normal save flow; when no path was corrected, the diagram MUST NOT be marked as modified.
- **FR-009**: The system MUST inform the user how many paths were corrected during loading.
- **FR-010**: If a node's UID cannot be resolved, the system MUST keep the node and its stored data unchanged and inform the user which UIDs could not be resolved.
- **FR-011**: If item locations cannot be determined at all (e.g. server unavailable), the system MUST render the diagram exactly as stored, change nothing, and inform the user that paths could not be verified.

#### Editing

- **FR-012**: The canvas MUST NOT display the generic "Edit" control at the top of the canvas.
- **FR-013**: Adding links, removing links, removing items from the diagram and adding linked items MUST remain available through the toolbar buttons and the context menu.

#### Layout and labels

- **FR-014**: Grid Layout MUST position nodes based on each node's actual rendered width and height so that no two node boxes overlap, with a consistent gap between neighbours.
- **FR-015**: Hierarchical Layout MUST position nodes based on each node's actual rendered width and height so that no two node boxes overlap.
- **FR-016**: Node size used by layout commands MUST reflect the current heading display state (headings shown or hidden) at the time the command is run.
- **FR-017**: When headings are shown, a heading longer than 30 characters MUST be wrapped onto a new line at the first space that follows the first 30 characters (i.e. the first space at 0-based index ≥ 30); the space is dropped and this rule is applied repeatedly to the remaining text.
- **FR-018**: A heading segment with no space after its first 30 characters MUST NOT be broken mid-word.
- **FR-019**: Heading wrapping MUST apply equally to diagram nodes and ghost preview nodes.

#### Icon removal

- **FR-020**: Nodes (including ghost nodes) MUST NOT display status icons for reviewed, not reviewed, suspect, derived, inactive or non-normative states.
- **FR-021**: Nodes MUST NOT use a special border colour to indicate suspect state.
- **FR-022**: The legend MUST NOT contain a status section; it MUST continue to show the document colour key.
- **FR-023**: Review/suspect status data MUST no longer be required by the canvas; removing it MUST NOT affect the review/clear-suspect features available elsewhere in the extension.

### Key Entities

- **Diagram file**: A `*.doorstop.json` file listing nodes with their UID, workspace-relative item path and canvas position, plus links between nodes. Paths may be rewritten on load per FR-007.
- **Diagram node**: One requirement item on the canvas, identified by its UID (the stable "alias"); displays the UID and optionally the wrapped heading.
- **Path correction**: The outcome of the load-time check for one node: unchanged, corrected (old path → new path), or unresolved.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After moving any item file within the workspace, 100% of affected nodes in an existing diagram are displayed and clickable on next open, without manual repair.
- **SC-002**: Opening a diagram whose paths are all valid leaves the file unmodified (no unsaved-changes indicator) in 100% of cases.
- **SC-003**: After running either layout command with headings shown, 0 node boxes overlap, for diagrams of at least 50 nodes with headings up to 200 characters.
- **SC-004**: No displayed heading line exceeds 30 characters plus the length of one word.
- **SC-005**: A user can create a new diagram from the Commands panel in 2 clicks plus entering a file name.
- **SC-006**: Zero status icons and zero suspect-coloured borders appear on the canvas for any item state.

## Assumptions

- The "alias" in the user description refers to the item UID already stored with each diagram node; UIDs are unique within a valid Doorstop project.
- Item locations are looked up through the existing requirement server (per the constitution, the server is the single source of truth); no new file-system scanning is introduced on the client.
- Path corrections are persisted through the standard Save flow rather than written to disk silently during load, keeping diagram persistence on the existing Save / Revert / backup mechanism.
- "New Diagram" remains available in the Command Palette (titled "Doorstop: New Diagram", matching the Commands panel label); only its TreeView title-bar button moves to the Commands panel.
- The "Edit" control in the top line is the canvas's built-in manipulation toolbar; its add-link / delete functions are already covered by the context menu (spec 015).
- Ghost preview and heading toggle buttons remain in the toolbar unchanged apart from the label/size changes above.
- Toggling headings does not trigger an automatic re-layout; users re-run a layout command if needed.
- The wrap threshold of "about 30 characters" is fixed at 30 and not user-configurable.
- Review/suspect/derived/active/normative data may still be returned by the server for other features; the canvas simply stops displaying it.
