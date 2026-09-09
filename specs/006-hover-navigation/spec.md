# Feature Specification: Hover Previews & Navigation

**Feature Branch**: `N/A (retroactive documentation)`

**Created**: 2026-09-09

**Status**: Implemented (reverse-engineered from existing code)

**Input**: User description: "Reverse-engineered from existing implementation — see CHANGELOG.md and README.md for release history."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preview an upstream link on hover (Priority: P1)

As a developer reading a requirement, I want hovering over a linked
requirement's UID to show me its title, level, and full text without opening
the file, so I can quickly understand context.

**Why this priority**: The extension's signature convenience feature, listed
first under Hover Previews in the README, used constantly while reading
requirements.

**Independent Test**: Open a requirement file that references another
requirement's UID, hover over that UID, confirm a popup shows the target's
title/level/text.

**Acceptance Scenarios**:

1. **Given** a requirement UID token appears anywhere in a `.yml`/`.md`
   requirement file, **When** the user hovers over it, **Then** a popup shows
   the target item's header, level, and full text.
2. **Given** the hovered UID is outside a `links:` block, **When** the popup is
   shown, **Then** it also lists that target item's own upstream links.
3. **Given** the popup contains a link to another requirement, **When** the user
   clicks it, **Then** that requirement's file opens.

---

### User Story 2 - See what derives from the current requirement (Priority: P2)

As a developer, I want hovering over the `derived:` field key to show me every
requirement that already links back to (derives from) the current file, so I
can see downstream impact.

**Why this priority**: Complements upstream hover; used when checking impact of
a change, not on every read.

**Independent Test**: Open a requirement with items linking to it, hover the
`derived:` key, confirm a list of the linking (child) items appears.

**Acceptance Scenarios**:

1. **Given** a requirement has one or more items linking to it as their parent,
   **When** the user hovers its `derived:` field key, **Then** a popup lists
   those downstream/child items.

---

### User Story 3 - Tree and editor stay in sync while navigating (Priority: P2)

As a developer clicking through hover links or opening files directly, I want
the sidebar tree to keep tracking whatever requirement I'm currently viewing.

**Why this priority**: An orientation aid; hover-driven navigation is the
primary trigger for it.

**Independent Test**: Click a link inside a hover popup; confirm the tree
updates to reveal the newly opened requirement.

**Acceptance Scenarios**:

1. **Given** a hover popup link is clicked and its target file opens, **When**
   the active editor changes as a result, **Then** the Explorer tree reveals
   and selects the corresponding item.

---

### Edge Cases

- What happens when a hovered UID doesn't correspond to any file found in the
  workspace?
- What happens when a requirement's text is very long — is the hover popup
  truncated or scrollable?
- How does hover behave on a UID-shaped token that isn't actually a real link
  (e.g. appears in prose)?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST show a hover popup with title, level, and full text
  for any recognized requirement UID token in a requirement file.
- **FR-002**: System MUST include that target item's own upstream links in the
  popup when the hovered UID itself is not already inside a links listing.
- **FR-003**: Every requirement reference shown in a hover popup MUST be
  clickable and open that requirement's file.
- **FR-004**: System MUST show a popup listing downstream/child items when
  hovering the `derived:` field key.
- **FR-005**: System MUST keep the Explorer tree's active selection synchronized
  with whatever requirement file is currently active in the editor, including
  after navigating via a hover popup link.

### Key Entities

- **Upstream Link**: a reference from the current item to a parent item it
  depends on.
- **Downstream/Reverse Link**: an item elsewhere in the workspace that links to
  the current item as its parent.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can understand the full context (parents and text) of
  any linked requirement without leaving their current file.
- **SC-002**: A developer can see everything that depends on a requirement
  (downstream impact) without running a search.
- **SC-003**: Navigating via hover links keeps the sidebar tree oriented to the
  current file at all times.

## Assumptions

- Requirement lookup by UID is done via a workspace file-name glob
  (`<uid>.yml`/`.md`); requirements without a matching file are treated as not
  found rather than raising an error.
