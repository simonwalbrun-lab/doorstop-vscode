# Feature Specification: Treeview Auto-Reveal Toggle

**Feature Branch**: `010-treeview-auto-reveal-toggle`

**Created**: 2026-09-09

**Status**: Draft

**Input**: User description: "as a user I want to be able to enable and disable the direct opening of the doorstop treeview if I click a element anywere. this means the treeview shall have a toggle button in the in the upper line of the treeview."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Turn off auto-reveal to stop the tree from jumping (Priority: P1)

As a developer who wants to keep the Explorer tree scrolled to a particular
area, I want to turn off automatic reveal-and-select of the active
requirement, so that navigating around files doesn't keep moving my tree
view out from under me.

**Why this priority**: This is the core motivation behind the request — the
tree currently always jumps to whatever the user just looked at, and that is
exactly the behavior they want a way to switch off.

**Independent Test**: Click the new toggle button in the Explorer tree's
title bar to turn auto-reveal off, then open several different requirement
files (via the editor, a hover link, or a diagram node). Confirm the
Explorer tree's scroll position and selection do not change in response.

**Acceptance Scenarios**:

1. **Given** the toggle is off, **When** the active editor changes to a
   different requirement file, **Then** the Explorer tree does not reveal or
   change its selection.
2. **Given** the toggle is off, **When** the user manually clicks a tree
   item, **Then** it still opens that item's file as normal — the toggle
   only suppresses *automatic* reveal, not direct interaction with the tree
   itself.

---

### User Story 2 - Turn auto-reveal back on (Priority: P1)

As a developer, I want to turn automatic reveal back on when I want the tree
to track my active file again, so the toggle is genuinely reversible rather
than a one-way opt-out.

**Why this priority**: A toggle only delivers value if both directions work;
"on" is also the default, expected state new users start from.

**Independent Test**: With the toggle off, click it again to turn it back on,
then open a different requirement file. Confirm the Explorer tree reveals
and selects the corresponding item, matching today's existing behavior.

**Acceptance Scenarios**:

1. **Given** the toggle is on, **When** the active editor changes to a
   requirement file, **Then** the Explorer tree reveals and selects the
   corresponding item (today's existing, unchanged behavior).

---

### User Story 3 - See the current toggle state at a glance (Priority: P2)

As a developer, I want the toggle button's appearance to reflect whether
auto-reveal is currently on or off, so I don't have to guess or hunt for a
setting to find out.

**Why this priority**: Usability/discoverability layered on top of the core
on/off mechanism from User Stories 1-2; the feature works without it, but is
confusing without visual feedback.

**Independent Test**: Toggle the button and visually confirm its icon changes
to a distinct "on" vs "off" appearance each time.

**Acceptance Scenarios**:

1. **Given** auto-reveal is on, **When** the user looks at the Explorer
   tree's title bar, **Then** the button visually indicates the "on" state.
2. **Given** auto-reveal is off, **When** the user looks at the title bar,
   **Then** the button visually indicates the "off" state.

---

### User Story 4 - Preference persists across sessions (Priority: P3)

As a developer, I want my on/off choice to persist across VS Code restarts
and window reloads, so I don't have to re-disable it every time I start
working.

**Why this priority**: A quality-of-life improvement; the toggle already
delivers its core value within a single session without this, so it's the
most separable piece.

**Independent Test**: Turn the toggle off, restart or reload VS Code, reopen
the workspace, and confirm the toggle is still off.

**Acceptance Scenarios**:

1. **Given** the toggle was set to off, **When** VS Code is restarted or the
   window is reloaded, **Then** the toggle remains off afterward.

---

### Edge Cases

- The auto-reveal mechanism is currently shared by three triggers: the
  active editor changing, clicking a link inside a hover popup, and clicking
  a node on the traceability diagram (all funnel into the same underlying
  "reveal this requirement in the tree" behavior). Per the Assumptions below,
  the toggle governs that one shared mechanism, so turning it off suppresses
  all three triggers, not just editor-tab switching.
- What happens if the toggle is switched while the Doorstop server hasn't
  finished starting, or the tree hasn't loaded yet? Toggling MUST work
  regardless of server/tree state, since it only affects local UI behavior
  and has no server interaction.
- What happens if the currently active file has no corresponding tree node
  (e.g. a non-requirement file) while auto-reveal is on? No change from
  today's behavior — nothing happens, same as before this feature existed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a toggle button in the Explorer tree
  view's title bar (alongside existing controls like Refresh and Open
  Diagram) that switches automatic reveal-and-select on or off.
- **FR-002**: When the toggle is off, system MUST NOT automatically reveal or
  change the Explorer tree's selection in response to the active editor
  changing, a hover-popup link being clicked, or a diagram node being
  clicked.
- **FR-003**: When the toggle is on, system MUST reveal and select the
  Explorer tree node matching the active requirement, exactly as it already
  does today, regardless of which of the three triggers in FR-002 caused it.
- **FR-004**: Turning the toggle off MUST NOT affect manually clicking a tree
  item to open its file, nor any other command (Add, Review, Clear, Link,
  etc.) — only the *automatic* reveal behavior is affected.
- **FR-005**: The toggle button MUST visually indicate its current on/off
  state without requiring a hover tooltip to determine it.
- **FR-006**: The toggle's state MUST persist across VS Code window reloads
  and restarts.
- **FR-007**: Toggling MUST succeed regardless of whether the Doorstop server
  or tree data has finished loading — it is a local UI preference with no
  server interaction.

### Key Entities

- **Auto-Reveal Preference**: a single on/off setting controlling whether
  the Explorer tree automatically reveals the active requirement; persists
  across sessions; defaults to on (matching today's existing behavior, so
  nothing changes for users who never touch the new toggle).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can stop the Explorer tree from auto-jumping with
  a single click, with no setting to search for.
- **SC-002**: A developer can restore the original auto-reveal behavior just
  as easily, with the same single click.
- **SC-003**: A developer can tell whether auto-reveal is currently on or
  off just by glancing at the tree's title bar.
- **SC-004**: A developer who disables auto-reveal does not have to
  re-disable it the next time they open VS Code.

## Assumptions

- "Direct opening of the doorstop treeview if I click a element anywhere"
  refers to the existing automatic reveal-and-select behavior already
  documented in [002-explorer-commands-panel](../002-explorer-commands-panel/spec.md)
  (FR-005) and [006-hover-navigation](../006-hover-navigation/spec.md)
  (FR-005) — not a new navigation mechanism. This feature adds an on/off
  switch for that existing behavior; it does not change what the behavior
  does when on.
- The toggle governs the single underlying reveal mechanism
  (`doorstop.activateRequirement` / `syncActiveRequirement`) shared by all
  three triggers (editor change, hover-link click, diagram-node click),
  rather than adding separate switches per trigger — this keeps the feature
  to one control with one consistent effect, matching the user's broad
  phrasing ("if I click a element anywhere"). This scope choice is worth
  confirming via `/speckit-clarify` if a narrower scope (e.g., editor-tab
  switching only) turns out to be what's actually wanted.
- The preference is a personal editing habit, not project configuration, so
  it is assumed to persist per-user (e.g. VS Code global state) rather than
  being committed to the workspace/repository. The exact storage mechanism
  is a planning-level detail, not specified here.
- "Upper line of the treeview" refers to the Explorer tree view's title bar
  (VS Code's `view/title` toolbar), where Refresh, Open Diagram, and New
  Diagram controls already live.
