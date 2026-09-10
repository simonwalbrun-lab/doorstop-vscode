---

description: "Task list template for feature implementation"
---

# Tasks: Diagram Ghost Items & Content Preview

**Input**: Design documents from `/specs/011-ghost-items-preview/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/diagram-message-protocol.md, quickstart.md

**Tests**: Not included. Tests are OPTIONAL per this workflow, and this feature's spec/clarifications did not request them; the repository has no existing automated webview/vis-network UI test harness for any prior diagram feature (drag-and-drop, physics toggle, canvas context menu are all verified manually), so `quickstart.md`'s 7 manual scenarios are the verification mechanism here, consistent with existing practice.

**Organization**: Tasks are grouped by user story (from spec.md: US1 = P1 Ghost Nodes, US2 = P2 Hover Preview, US3 = P3 Heading Toggle) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- File paths are exact and relative to the repository root

## Path Conventions

Single VS Code extension project (no new top-level directories): extension host in `src/diagrammPanel.ts`, webview in `src/webview/diagram/*.js`. No server changes (confirmed in `research.md` — `GET /tree` already returns everything this feature needs).

---

## Phase 1: Setup

**Purpose**: Establish a clean baseline before making changes. No new dependencies or project scaffolding are needed (Constitution Principle IV — confirmed in `plan.md`'s Constitution Check), so this phase is minimal.

- [X] T001 Run `npm run check-types` and `npm run lint` on the `011-ghost-items-preview` branch and confirm both pass before any change in this feature, establishing a clean baseline to diff against

**Checkpoint**: Clean baseline confirmed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Forward the `header`/`text` fields that `GET /tree` already returns but the extension currently does not send to the webview. All three user stories depend on this data being present on nodes (US1's ghost nodes need it to render and hover; US2's hover preview needs it for both body and ghost nodes; US3's heading toggle needs `header` to show/hide).

**⚠️ CRITICAL**: No user story work should begin until this phase is complete.

- [X] T002 Extend the `NodeMeta` interface in `src/diagrammPanel.ts` with `header: string | null` and `text: string | null` fields, per `data-model.md`'s BodyItem entity and `contracts/diagram-message-protocol.md`
- [X] T003 In `fetchTreeMeta()` in `src/diagrammPanel.ts`, populate the new `header`/`text` fields on each `NodeMeta` entry directly from the corresponding `/tree` item's `header`/`text` fields (depends on T002)
- [X] T004 In `handleDroppedData()` / `addRequirementToDiagram()` in `src/diagrammPanel.ts`, include `header`/`text` in the `addNode` message's `node` payload, per the extended `addNode` contract in `contracts/diagram-message-protocol.md` (depends on T002)
- [X] T005 In the `loadDiagram` message construction in `src/diagrammPanel.ts`, include `header`/`text` on each `meta[uid]` entry, per the extended `loadDiagram` contract in `contracts/diagram-message-protocol.md` (depends on T002, T003) — already satisfied: `handleReady` forwards `meta` (now carrying `header`/`text` per T002/T003) unchanged
- [X] T006 [P] In `src/webview/diagram/main.js`'s `loadDiagram` and `addNode` handlers, retain the incoming `header`/`text` fields on the corresponding entry stored in the `nodeMeta` map so later lookups (hover, heading toggle) can read them — verified: both handlers already store the whole incoming object (`message.node` / `message.meta[item.id]`) into `nodeMeta` as-is, so the new fields flow through with no code change

**Checkpoint**: Foundational data flow ready — every node the webview knows about now carries `header`/`text`. User story implementation can begin.

---

## Phase 3: User Story 1 - Preview Related Items as Ghost Nodes (Priority: P1) 🎯 MVP

**Goal**: Turning on Ghost Preview shows every item directly linked to an on-canvas body item as a smaller, lightened, non-persisted ghost node, physics-driven and tethered to its body item(s); body items stay fixed; ghosts can be promoted to real body items via a context-menu action that also opens their file.

**Independent Test**: Add two body items where one links to an item not on the canvas; toggle Ghost Preview on; confirm the linked item appears as a smaller, lighter-toned ghost node tethered to it; drag the body item and confirm the ghost follows; toggle off and confirm the ghost disappears with body items unchanged; right-click a ghost and promote it, confirming it becomes a real body item and its file opens.

### Implementation for User Story 1

- [X] T007 [US1] Add a "Ghost Preview" toggle button (`#ghost-preview-toggle`) to the toolbar in `src/webview/diagram/diagram.html`, alongside the existing `#layout-toggle`/`#physics-toggle` buttons
- [X] T008 [P] [US1] Add a hidden-by-default "preview incomplete" inline indicator element (`#ghost-preview-status`) in `src/webview/diagram/diagram.html`, styled in `src/webview/diagram/diagram.css` to match the existing toolbar's visual language, for the FR-012 failure path
- [X] T009 [P] [US1] Add ghost-related client state to `src/webview/diagram/state.js` — **implementation correction**: vis-network's `Network` only ever renders the one nodes/edges `DataSet` pair it was constructed with, so the originally planned separate `visGhostNodes`/`visGhostEdges` DataSets would never render. Used instead: `ghostMeta` (`Map<uid, GhostItem>`, marks an entry as a ghost and backs hover/promotion lookups) plus a `clearGhosts()` helper that removes ghost-marked nodes/edges from the existing `visNodes`/`visEdges`; ghost edges are tagged `ephemeral: true`. `ghostPreviewEnabled`/`headingDisplayEnabled`/`physicsToggleSuspended` booleans added as planned. `data-model.md` updated to match
- [X] T010 [US1] Implement `computeGhostItems(bodyUids)` in `src/diagrammPanel.ts`: over the cached `/tree` data, for each body UID find every item `Y` where `Y.uid` appears in the body item's `links[].uid` (parents) or the body item's UID appears in `Y.links[].uid` (children linking up to it); deduplicate so an item linked to multiple body items becomes exactly one ghost with `tetherUids: string[]` listing all of them (FR-006), per `data-model.md`'s GhostItem entity and `research.md` §1 (depends on T002–T005)
- [X] T011 [US1] Implement `handleRequestGhostPreview({enabled, bodyUids})` in `src/diagrammPanel.ts`: on `enabled: true`, refresh the `/tree` cache if stale, call `computeGhostItems`, and reply with `ghostPreviewData {nodes, edges, incomplete}`; on any tree-fetch failure, reply `{nodes: [], edges: [], incomplete: true}` instead of throwing (FR-012); on `enabled: false`, acknowledge only — per `contracts/diagram-message-protocol.md` (depends on T010)
- [X] T012 [US1] Register the `requestGhostPreview` and `promoteGhost` message types in the `onDidReceiveMessage` dispatch table in `src/diagrammPanel.ts` (depends on T011)
- [X] T013 [P] [US1] Implement `toVisGhostNode(item)` in `src/webview/diagram/render.js`: renders smaller than a body node, colored via the existing `colorForDocument(documentPrefix)` at a visibly lighter/reduced intensity, label following the current heading-display state (identifier-only for now — heading toggle lands in Phase 5), reusing the existing badge logic
- [X] T014 [US1] Implement `setupGhostPreviewToggle()` in `src/webview/diagram/main.js`: on enabling, collect `visNodes.getIds()` and send `requestGhostPreview {enabled: true, bodyUids}`; on disabling, clear ghosts locally via `state.clearGhosts()` (no round trip needed — nothing was persisted) and restore body items' prior physics/toggle state (depends on T009, T013)
- [X] T015 [US1] Handle the `ghostPreviewData` message in `src/webview/diagram/main.js`: if `incomplete: true`, show `#ghost-preview-status` and leave all body items and their positions untouched (FR-012); otherwise populate ghost nodes/edges into `visNodes`/`visEdges` via `render.toVisGhostNode` (tracked in `state.ghostMeta`), set every body node's vis-network option to `physics: false`, force the network's overall `physics.enabled = true` (depends on T014)
- [X] T016 [US1] Extend `setupLayoutToggle()` in `src/webview/diagram/main.js` to also disable `#ghost-preview-toggle` while Hierarchical Layout is active, and extend the Ghost Preview toggle handler to disable `#layout-toggle`/`#physics-toggle` while Ghost Preview is active — implementing FR-014's mutual exclusivity in both directions (depends on T014)
- [X] T017 [US1] Extend the `network.on('oncontext', ...)` handler in `src/webview/diagram/interactions.js` to detect a right-click on a node present in `state.ghostMeta` and show a single `"Add to Diagram"` context-menu entry (reusing the existing `showContextMenu` helper) that sends `promoteGhost {uid, fileUri, pointer}` (depends on T009)
- [X] T018 [US1] Implement `handlePromoteGhost({uid, fileUri, pointer})` in `src/diagrammPanel.ts`: call the existing `handleDroppedData(fileUri, pointer)` to add the item as a real body node (which already replies with the existing `addNode` message), then call `vscode.window.showTextDocument` to open the file, satisfying FR-015 (depends on T012)
- [X] T019 [US1] Extend the `addNode` handler in `src/webview/diagram/main.js` to also remove any matching entry from `state.ghostMeta`/`visNodes`/`visEdges` when the incoming node's UID was previously a ghost, so promotion leaves no leftover ghost duplicate (depends on T015, T018)
- [X] T020 [US1] Verify `getDiagramData()`/`saveGraphState()` in `src/webview/diagram/state.js` only ever serialize non-ghost entries, confirming FR-011's no-persistence guarantee holds — implemented as an explicit `!ghostMeta.has(node.id)` / `edge.ephemeral !== true` filter in both functions (depends on T009)

**Checkpoint**: User Story 1 is fully functional and independently testable (quickstart.md Scenarios 1, 2, 5, 6, 7).

---

## Phase 4: User Story 2 - Hover to Preview Item Content (Priority: P2)

> **Superseded**: this entire user story was removed by T037 in Phase 8, per direct user feedback that hover did not work reliably and was not needed. The checked tasks below are kept as a historical record of what was originally built, not as a claim that this code still exists.

**Goal**: Hovering any node — body or ghost — shows a short delay then a preview of its heading and body text near the pointer, dismissed on leaving the node, and updates immediately when moving directly between nodes.

**Independent Test**: With Ghost Preview off, hover a body item and confirm a heading+text preview appears after a short delay and disappears on leaving; repeat with a ghost item once User Story 1 is available; move directly between two nodes and confirm the preview updates without an intervening dismissal.

### Implementation for User Story 2

- [X] T021 [US2] Add a hover-preview tooltip element (`#doorstop-hover-preview`) to `src/webview/diagram/diagram.html`
- [X] T022 [P] [US2] Style `#doorstop-hover-preview` in `src/webview/diagram/diagram.css` (absolute positioning near the pointer, background/border matching the existing `#doorstop-context-menu` visual pattern)
- [X] T023 [US2] Add a `getNodeContent(nodeId)` helper to `src/webview/diagram/state.js` that checks `nodeMeta` first and falls back to `ghostMeta`, returning `{header, text}` for either kind of node (depends on T009)
- [X] T024 [US2] Wire `network.on('hoverNode', ...)` / `network.on('blurNode', ...)` in `src/webview/diagram/interactions.js`: after a short delay, show `#doorstop-hover-preview` populated via `getNodeContent`, for both body and ghost nodes; hide immediately on `blurNode`; when the pointer moves directly from one node to another, update the preview to the new node without requiring an intervening blur (FR-007/FR-008, spec.md User Story 2 Acceptance Scenario 3) (depends on T021, T022, T023)

**Checkpoint**: User Story 2 is functional independently (works for body items with Ghost Preview off) and integrates with User Story 1 for ghost items.

---

## Phase 5: User Story 3 - Toggle Between Identifier-Only and Heading Labels (Priority: P3)

**Goal**: A toggle switches all node labels (body and ghost) between identifier-only and identifier-plus-heading.

**Independent Test**: With any body items on the canvas, toggle heading display on and confirm labels now show headings in addition to identifiers; toggle off and confirm labels return to identifier-only; with ghost items visible, confirm their labels change the same way.

### Implementation for User Story 3

- [X] T025 [US3] Add a heading-display toggle button (`#heading-toggle`) to the toolbar in `src/webview/diagram/diagram.html`
- [X] T026 [P] [US3] Add `headingDisplayEnabled` (boolean, default `false` — identifier-only baseline, per spec.md User Story 3 Acceptance Scenario 1) to `src/webview/diagram/state.js`
- [X] T027 [US3] Modify the label-building logic in `src/webview/diagram/render.js` (both `toVisNode` and the `toVisGhostNode` added in T013) to omit the header/title line when `state.headingDisplayEnabled` is `false`, and include it when `true` — the same rule for both body and ghost labels (FR-009/FR-010) (depends on T013, T026) — implemented as the shared `buildLabel()` helper, done as part of T013 so both node kinds were correct from first render rather than needing a later rewrite
- [X] T028 [US3] Implement `setupHeadingToggle()` in `src/webview/diagram/main.js`: flips `state.headingDisplayEnabled`, then re-renders every current body node's and ghost node's label in place via `relabelAllNodes()` (updates only the `label` field via `render.buildLabel`/`buildBadge` — deliberately not `render.toVisNode`/`toVisGhostNode` wholesale, since those default `x`/`y` to `0` and the DataSet doesn't track live drag/physics positions, which would have snapped nodes back to their original spot) (depends on T027)

**Checkpoint**: All three user stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final verification and documentation, spanning all three stories.

- [X] T029 [P] Run `npm run check-types` and `npm run lint` again across all files touched by T002–T028 and fix any violations (Constitution Principle V) — also ran `npm run compile` (full esbuild bundle + webview asset copy) to confirm the build succeeds end-to-end; all clean
- [X] T030 [P] Add a `CHANGELOG.md` entry for Ghost Items Preview under `[Unreleased]`, following this project's established entry style
- [ ] T031 Execute all scenarios in `specs/011-ghost-items-preview/quickstart.md` end-to-end in the Extension Development Host and confirm each passes — **not run**: this sandboxed session has no display/VS Code Extension Development Host available to launch `F5` interactively. Left unchecked deliberately rather than falsely marked done; see completion report for what full type-check/lint/build verification *did* cover, and hand this off as the one remaining manual step. (Note: `quickstart.md` was revised by Phase 8/T039 — it now has 6 scenarios, the former hover scenario removed.)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup. **Blocks all user stories** — ghost and heading-toggle rendering rely on `header` reaching the webview. (Originally also carried `text` for hover; removed in Phase 8/T038 once hover was cut from scope.)
- **User Story 1 (Phase 3)**: Depends on Foundational only. No dependency on US2/US3.
- **User Story 2 (Phase 4)**: Depends on Foundational only for body-item hover; reads (but does not modify) US1's `visGhostNodes` state for ghost-item hover, so is easiest to verify fully once US1 exists, but its own code has no hard dependency on US1's tasks.
- **User Story 3 (Phase 5)**: Depends on Foundational and on T013 (US1's `toVisGhostNode`) only because it edits that same function; otherwise independent of US1/US2 behavior.
- **Polish (Phase 6)**: Depends on all desired user stories being complete.

### Parallel Opportunities

- Within Foundational: T006 (webview) can run parallel to T002–T005 (extension host) once the contract shape is agreed (it already is, per `contracts/diagram-message-protocol.md`).
- Within US1: T008, T009, T013 are marked `[P]` — different files from each other and from the sequential T010–T012 extension-host chain.
- Within US2: T022 (`[P]`) can run alongside T021/T023.
- Within US3: T026 (`[P]`) can run alongside T025.
- Within Polish: T029 and T030 are independent of each other.

---

## Parallel Example: User Story 1

```bash
# After Foundational (Phase 2) is complete, these can start together:
Task: "Add Ghost Preview toggle button in src/webview/diagram/diagram.html"          # T007
Task: "Add preview-incomplete indicator in diagram.html/diagram.css"                 # T008 [P]
Task: "Add ghost-related client state in src/webview/diagram/state.js"               # T009 [P]
Task: "Implement toVisGhostNode() in src/webview/diagram/render.js"                  # T013 [P]
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational — blocking).
2. Complete Phase 3 (User Story 1).
3. **STOP and VALIDATE**: run quickstart.md Scenarios 1, 2, 5, 6, 7 in the Extension Development Host.
4. This is a demoable MVP: Ghost Preview with promotion, without hover preview or the heading toggle.

### Incremental Delivery

1. Setup + Foundational → data flow ready.
2. Add User Story 1 → validate → MVP demo.
3. Add User Story 2 → validate (quickstart Scenario 3) → demo.
4. Add User Story 3 → validate (quickstart Scenario 4) → demo.
5. Polish → full quickstart.md pass, changelog, type/lint gate.

## Notes

- No test tasks are included (see Tests note above); `quickstart.md` is the verification mechanism.
- No server-side tasks exist — `research.md` confirmed `GET /tree` already returns everything this feature needs.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.

---

## Phase 7: Convergence

**Purpose**: Close gaps found by comparing the implemented code (T001–T031) against spec.md, plan.md, research.md, and the constitution. Ordered CRITICAL/HIGH first.

- [X] T032 CRITICAL: Add explicit error handling to `handlePromoteGhost` in `src/diagrammPanel.ts` (wrap `handleDroppedData`/`showTextDocument` in try/catch and report failure via `vscode.window.showErrorMessage`, matching the pattern already used by `handleCreateLinkedItem`/`handleAddLink`/`handleRemoveLink` in the same file) per Constitution III (contradicts) — done together with T042 below
- [X] T033 In `setupGhostPreviewToggle()`'s enable branch in `src/webview/diagram/main.js`, pin all current body items (`state.visNodes.update(..., { physics: false })`) synchronously at click time, before sending `requestGhostPreview`, so existing body items can never be moved by the physics engine during the round trip to the `ghostPreviewData` reply per FR-004 (partial) — completed by T045 in Phase 9, once the user independently confirmed this exact symptom live
- [X] T034 In the `addNode` handler in `src/webview/diagram/main.js`, set the newly added node's `physics: false` immediately whenever `state.ghostPreviewEnabled` is `true` (covers both ghost promotion and a fresh drag-and-drop while Ghost Preview stays active), so every body item present while Ghost Preview is on stays fixed, not only the ones present when it was turned on per FR-004 (missing) — completed by T046 in Phase 9
- [X] T035 In `handleRequestGhostPreview` in `src/diagrammPanel.ts`, only call `refreshItemMeta()` when `this._itemMeta` is empty (or otherwise known-stale); reuse the existing cache on the happy path, matching the documented design in research.md §1 and `contracts/diagram-message-protocol.md` ("no new server call on the happy path") per research.md §1 (contradicts)
- [X] T036 In `setupGhostPreviewToggle()` in `src/webview/diagram/main.js`, on receiving `ghostPreviewData {incomplete: true}`, roll back the toggle's enabled-side-effects (restore button text to "Ghost Preview", re-enable `#layout-toggle` and `#physics-toggle`/restore `physicsToggleSuspended`) while still showing `#ghost-preview-status`, so the control never reads "on" when nothing was actually enabled per FR-012 (partial) — implemented as a shared `exitGhostPreview()` helper, reused by the toggle's own "turn off" click; the rollback only fires when `state.ghostMeta.size === 0` (nothing was ever successfully shown yet), so a failed *recompute* after an already-successful enable (T044/FR-016) doesn't tear down a working preview over one bad request. Known narrow edge case: if Ghost Preview is legitimately showing zero ghosts (spec.md Acceptance Scenario 5) and a later recompute then fails, this heuristic will also roll back — accepted as a reasonable tradeoff rather than adding a dedicated "ever loaded successfully" flag for that narrow case

---

## Phase 8: User-Requested Revisions

**Purpose**: Direct user feedback after trying the feature: hover doesn't work and isn't wanted, node colors have poor text contrast, ghost nodes should read as less prominent, and both "open the file" actions (ghost promotion, and the pre-existing "Add Linked Item" context-menu action) should open in the diagram's secondary editor column like clicking any other node, not the default column.

- [X] T037 Remove the hover-preview feature entirely, per direct user feedback ("hovering is not working and not needed"): the `#doorstop-hover-preview` element (`src/webview/diagram/diagram.html`), its CSS rules (`src/webview/diagram/diagram.css`), `setupHoverPreview()`/`HOVER_PREVIEW_DELAY_MS`/the `hoverNode`/`blurNode` wiring (`src/webview/diagram/interactions.js`), and `getNodeContent()` (`src/webview/diagram/state.js`)
- [X] T038 Remove the `text` field from `NodeMeta`/`GhostNode` (`src/diagrammPanel.ts`) and its population in `refreshItemMeta()`/`handleDroppedData()`/`computeGhostItems()` — it existed only to feed the hover preview removed in T037; `header` is retained (still used by the heading-display toggle and ghost labels)
- [X] T039 Update `spec.md` to remove User Story 2 (hover), FR-007, FR-008, the Content Preview key entity, and SC-003; update `research.md` §2, `data-model.md`, `contracts/diagram-message-protocol.md`, and `quickstart.md` (drop the hover scenario) to match — hover is out of scope going forward
- [X] T040 In `src/webview/diagram/render.js`, change `NODE_FONT` to black text and replace `DOCUMENT_PALETTE` and the fallback `NODE_COLOR.background` with a lighter palette chosen for good contrast against black text, per user feedback ("colors of the nodes have little contrast to the font color... select colors for the background which have good contrast with black")
- [X] T041 In `src/webview/diagram/render.js`'s `toVisGhostNode`, increase the lighten amount applied to ghost background/border so ghost nodes read as visually less prominent than body nodes while keeping the same size, per user feedback ("ghost nodes need to be less present... keep the size but make the color lighter")
- [X] T042 In `handlePromoteGhost` (`src/diagrammPanel.ts`), open the promoted item's file via `getOrCreateSideColumn()` (the same secondary-editor-column behavior `handleOpenFile` already gives a clicked node) instead of the default column, and add the error handling from T032 (folded into this task since both touch the same method)
- [X] T043 In `handleCreateLinkedItem` (`src/diagrammPanel.ts`), open the newly created linked item's file via `getOrCreateSideColumn()` the same way, instead of the default column, per user feedback ("the same shall be for creating a new item in the context menu")

---

## Phase 9: Clarification Follow-ups (2026-09-10)

**Purpose**: Implement the answer to `/speckit-clarify`'s question on promotion behavior (FR-016), and fix the node-jump bug the user confirmed live (the same root cause T033/T034 already identified) — both landed in the same round.

- [X] T044 Implement FR-016: after `handlePromoteGhost` succeeds in `src/diagrammPanel.ts` / the webview's `addNode` handler adds the promoted node in `src/webview/diagram/main.js`, if `state.ghostPreviewEnabled` is `true`, send `requestGhostPreview` again with the updated `bodyUids` (including the newly-promoted uid) so the ghost set is recomputed immediately to include any new items linked to it
- [X] T045 Pin all current body items (`physics: false`) synchronously in `setupGhostPreviewToggle()`'s enable branch in `src/webview/diagram/main.js`, before sending `requestGhostPreview`, fixing the user-confirmed bug ("when I toggle the ghost mode there is always a short period of time were all the nodes are moving") — completes T033 per FR-004
- [X] T046 In the `addNode` handler in `src/webview/diagram/main.js`, set the newly added node's `physics: false` immediately whenever `state.ghostPreviewEnabled` is `true` — needed now for T044 too, since a promoted node must be pinned immediately, the same as every other body item present while Ghost Preview is on — completes T034 per FR-004
