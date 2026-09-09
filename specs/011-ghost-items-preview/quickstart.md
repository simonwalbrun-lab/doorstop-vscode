# Quickstart: Diagram Ghost Items Preview

**Feature**: `011-ghost-items-preview` | **Date**: 2026-09-09

Manual validation guide. This project has no automated webview UI test
harness (consistent with existing diagram features like drag-and-drop,
which are also verified manually in the Extension Development Host) — see
`plan.md` Constitution Check for why that's acceptable here.

## Prerequisites

- Doorstop server running against a fixture project with at least two
  linked items across two documents, e.g. `testdata/reqs` (already used by
  `server/tests`): `python -m doorstop_server --project testdata/reqs`.
- Extension Development Host launched from this repo (`F5`), opened on the
  same fixture workspace.
- At least one open diagram (`*.doorstop.json`) via `Doorstop: New Diagram`
  or an existing one, with two or more body items added where at least one
  has a link to an item not yet on the canvas.

## Scenario 1 — Ghost items appear and disappear (User Story 1 / FR-001–006)

1. With the diagram open and body items added, click the new "Ghost
   Preview" toolbar toggle.
2. **Expect**: every item directly linked to a body item (in either
   direction) appears as a smaller node in a lightened version of its
   source document's color, and reads as clearly less prominent than body
   items (not just a marginally paler variant).
3. Drag a body item to a new position.
4. **Expect**: any ghost items tethered to it move to follow, while other
   body items stay exactly where they were.
5. Click the toggle again to turn Ghost Preview off.
6. **Expect**: all ghost items disappear immediately; body items are
   unchanged; reopen the diagram file on disk and confirm no ghost data was
   written (only body nodes/edges, per FR-011).

## Scenario 2 — Shared ghost, no duplicates (FR-006 / Edge Cases)

1. Add two body items that both link to the same external item.
2. Turn on Ghost Preview.
3. **Expect**: exactly one ghost node appears, with a tether/edge to each
   of the two body items — not two overlapping ghost nodes.

## Scenario 3 — Heading display toggle (User Story 3 / FR-009–010)

1. With the heading-display toggle off, confirm body item labels show only
   their identifier.
2. Turn the toggle on.
3. **Expect**: body item labels now also show their heading.
4. With Ghost Preview also on, toggle heading display again in both
   directions.
5. **Expect**: ghost item labels change the same way, in lockstep with body
   item labels.

## Scenario 4 — Ghost promotion opens in the secondary editor column (FR-013 / FR-015)

1. With a ghost item visible, right-click it and choose "Add to Diagram".
2. **Expect**: it becomes a real body item (full styling, subject to normal
   physics/Auto-Arrange rules, no longer removed when Ghost Preview is
   toggled off), the corresponding ghost node disappears, and its file
   opens in the diagram's secondary editor column — the same column
   clicking any other node's file already opens in, not the column the
   diagram itself is in.
3. Save the diagram and reopen it.
4. **Expect**: the promoted item persists as a normal body item.
5. Right-click a body item and choose "Add Linked Item...", creating a new
   linked item.
6. **Expect**: its file also opens in the same secondary editor column.

## Scenario 5 — Mutual exclusivity with Hierarchical Layout (FR-014, Clarifications)

1. Turn on Hierarchical Layout.
2. **Expect**: the Ghost Preview toggle is disabled while Hierarchical
   Layout is active.
3. Turn Hierarchical Layout off, then turn Ghost Preview on.
4. **Expect**: the Hierarchical Layout toggle is now disabled while Ghost
   Preview is active, and the "Disable Auto-Arrange" toggle is also
   disabled for the duration (research.md §4) — turning Ghost Preview off
   restores both controls and whatever Auto-Arrange state was active
   beforehand.

## Scenario 6 — Server unavailable while enabling Ghost Preview (FR-012 / Edge Cases)

1. Stop the Doorstop server.
2. With body items already on the canvas, click the Ghost Preview toggle.
3. **Expect**: no ghost items appear, an inline indicator communicates the
   preview is incomplete, and existing body items and their positions are
   completely unchanged — no error dialog implying data loss.

## Verification gates before marking the feature done

- `npm run check-types` and `npm run lint` pass (Constitution Principle V).
- No changes to `server/` were required or made; if any were, the relevant
  `server/tests` pytest suite must pass.
- All six scenarios above pass in the Extension Development Host.
