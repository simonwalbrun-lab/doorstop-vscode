# Phase 0 Research: Diagram Context Menu Actions & Static Layouts

**Feature**: `015-diagram-context-menu-layouts` | **Date**: 2026-09-10

All findings below were derived from the current implementation in
`src/webview/diagram/` and `src/diagrammPanel.ts` plus the `vis-network` 10.1.2
behaviour that code already relies on. No `NEEDS CLARIFICATION` markers remain.

---

## 1. Keeping body items permanently static while ghost items stay physics-driven

**Decision**: Every body node carries `physics: false` as a per-node property from the
moment it enters the DataSet, for its whole life. The network-level physics option is
enabled **only** while Ghost Preview is on, and disabled otherwise.

**Rationale**: `vis-network` resolves physics per node — a node with `physics: false`
is excluded from the solver even while the solver runs. Ghost items therefore keep
working exactly as they do today (`ghostPreviewData` already sets
`physics: PHYSICS_ON` at network level and pins the body items), while body items can
never be moved by the solver. Turning the network-level engine off when no ghosts are
present avoids a solver running every frame over a graph in which no node
participates, which would burn CPU and can still nudge the view.

This is a *simplification* of what the code already does: `main.js` today pins body
items with `physics: false` in three places (`addNode` when Ghost Preview is on, and
twice in the Ghost Preview toggle path) and then has to *un-pin* them in
`exitGhostPreview` by writing `physics: true` back. Making the pin unconditional
deletes the un-pin path entirely, along with `state.physicsEnabled`,
`state.physicsToggleSuspended`, `currentPhysicsOptions()`, and the `PHYSICS_OFF`
constant's role as a user preference.

**Alternatives considered**:

- *`fixed: { x: true, y: true }` instead of `physics: false`* — rejected. `fixed` also
  blocks the user's own drag, which FR-021 explicitly requires to keep working.
- *Leave the network-level engine on permanently* — rejected. It costs a running
  solver for the common case (no ghosts) and buys nothing, since no node would be
  eligible for it.
- *Keep the auto-arrange toggle but default it off* — rejected; the user asked for the
  button to be removed (FR-017), and keeping it would preserve exactly the button
  interdependency FR-024 exists to eliminate.

---

## 2. Turning the hierarchical layout into a one-shot command

**Decision**: Compute-then-bake. On invocation: (a) enable
`layout.hierarchical` with the current `{ direction: 'UD', sortMethod: 'directed' }`
options, (b) read the resulting coordinates with `network.getPositions()`, (c) disable
`layout.hierarchical` again, (d) write the captured coordinates back onto the nodes as
explicit `x`/`y` via `visNodes.update(...)`, (e) `network.redraw()`. The same
bake-and-write-back step is shared with the grid command.

**Rationale**: `vis-network`'s hierarchical layout is a *mode*: while it is enabled it
owns positioning, overrides drags, and re-runs when the graph changes — which is
precisely the persistent-mode behaviour the user asked to remove. Baking the
coordinates keeps `vis-network` as the layout engine (Constitution IV and the
"do not hand-roll graph interaction primitives" constraint) while leaving the canvas
in the plain, static, freely-draggable state everything else in this feature assumes.

The write-back mechanism is already proven in this repository: the current "Manual
Layout" branch of `setupLayoutToggle` restores `state.manualPositions` with exactly
this `visNodes.update(Object.entries(...).map(...))` shape. The change is that
positions now come from the hierarchical pass rather than from a pre-hierarchical
snapshot.

**Alternatives considered**:

- *Implement a layered (Sugiyama-style) layout by hand* — rejected under Constitution
  II/IV: `vis-network` already provides it, and a hand-rolled version would be a large
  amount of new logic to maintain and test.
- *Keep hierarchical as a mode and accept the button interdependency* — rejected;
  contradicts FR-021 and FR-024 directly.

**Known caveat to handle in implementation**: `getPositions()` must be read *after*
the layout has been applied. `setOptions` applies hierarchical layout synchronously
before returning in vis-network 10.x, but the implementation should assert non-empty,
non-identical output and fall back to leaving positions untouched rather than writing
a degenerate all-zero layout (Constitution III).

---

## 3. Grid dimensioning and spacing

**Decision**: For `n` body items, `cols = ceil(sqrt(n))` and `rows = ceil(n / cols)`.
Items are placed row-major in ascending UID order. Cell pitch is
`max(nodeWidth) + gapX` by `max(nodeHeight) + gapY`, where the per-node extents come
from `network.getBoundingBox(id)` and the gaps are fixed constants. The grid is
centred on the current viewport centre (`network.getViewPosition()`).

**Rationale**:

- `cols = ceil(sqrt(n))` with `rows = ceil(n/cols)` satisfies FR-018's "differ by at
  most one" for every `n`: n=2→2×1, n=3→2×2, n=5→3×2, n=7→3×3, n=9→3×3, n=10→4×3,
  n=50→8×7. The last row may be partially filled; that is expected and does not break
  the constraint, which is about the grid's dimensions.
- Measuring actual bounding boxes rather than assuming a fixed node size is what makes
  FR-018's "no two nodes overlapping" hold when the heading-label toggle is on and
  labels are much wider (spec Edge Cases).
- Ascending UID order makes the arrangement deterministic, so the same diagram
  arranges the same way twice — required to test it (SC-004) and less disorienting for
  the user than insertion order, which depends on click history.
- Centring on the viewport keeps the result on screen instead of anchored at an
  arbitrary origin.

**Alternatives considered**:

- *`vis-network`'s `layout.improvedLayout` / a physics settle* — rejected; neither
  produces a grid, and both are the auto-arrange behaviour being removed.
- *Uniform fixed cell size (e.g. 200×100)* — rejected; overlaps as soon as headings
  are shown.
- *Insertion order rather than UID order* — rejected for non-determinism.

---

## 4. Two-step link-target selection

**Decision**: Choosing "Add Link to…" sets `state.pendingLinkSource = <uid>` and shows
a status banner. The existing `network.on('click')` handler checks that field
**first** and, when set, consumes the click as a target selection instead of running
its normal open-file behaviour. Escape, a click on empty canvas, or removal of the
source node clears the pending state. Valid targets are **body items other than the
source**; a ghost item or the source itself is rejected with a message and the pending
state is cleared.

**Rationale**:

- Reusing the existing click handler (rather than a separate capture-phase listener)
  keeps hit-testing in `vis-network` and guarantees the two paths cannot both fire for
  one click.
- The pending flow must intercept before the `openFile`/`activateNode` sends, since
  jumping the editor to a file mid-gesture would be surprising and would steal focus.
- **Ghost items are rejected as targets** even though they are visible on the canvas.
  A link to a ghost would be a genuine Doorstop link whose edge is drawn as
  `ephemeral: true` and therefore vanishes the instant Ghost Preview is turned off —
  indistinguishable from the mutation having failed. Promoting the ghost first (an
  action its own context menu already offers) makes the intent explicit. This is a
  narrowing of the spec's "only items currently on the canvas", recorded here as the
  implementation reading.
- On success the flow sends the **existing** `addLink` message; the existing
  `linkAddResult` handler already reports failure via `showErrorMessage` (FR-011),
  already treats a repeated link as a success (FR-010, links are a set server-side),
  and already persists via `diagramChanged`.

**Alternatives considered**:

- *A `showQuickPick` of candidate UIDs in the extension host* — rejected for the first
  cut: it leaves the canvas, and the user framed this as a canvas context-menu action.
  It remains the natural extension if linking to an off-canvas item is wanted later.
- *Reuse `vis-network`'s built-in `addEdge` manipulation mode* — rejected; that mode
  is the drag gesture this action exists to provide an alternative to, and entering it
  programmatically re-introduces the same drag.

---

## 5. Testing webview-only geometry in a suite CI already runs

**Decision**: Extract the pure geometry — grid position computation and the free-slot
search — into `src/webview/diagram/layout.js`, written to attach to
`window.DoorstopDiagram.layout` in the browser and to `module.exports` when `module`
is defined. A new `src/test/diagramLayout.test.ts` suite `require`s the built file
from `dist/webview/diagram/layout.js` and asserts the geometry headlessly; the same
suite round-trips a diagram document through `DiagramPanel.readDiagram`/write to prove
node removal persists.

**Rationale**: `esbuild.js` copies `src/webview/**` verbatim rather than bundling it,
and the files are IIFEs that assume a `window` — so none of it is reachable from the
`vscode-test` suites today. The dual-mode export is the smallest change that makes the
one piece of real logic in this feature testable, and it keeps that logic pure (input:
node ids and extents; output: coordinates) so the test needs no DOM, no server, no
fixture workspace, and no timing — meeting Constitution VI's non-interactive,
deterministic, headless-safe bar.

The rest of the feature (context-menu wiring, physics flags, button removal) is
`vis-network` and DOM glue whose correctness is a manual acceptance concern; it is
covered by the walk-through in `quickstart.md` rather than by an automated test, which
is consistent with how the existing diagram features are verified.

**Alternatives considered**:

- *Add a headless browser / jsdom harness for the whole webview* — rejected under
  Constitution IV: a new dev dependency and a new CI job to test glue code, when the
  only non-trivial logic can be tested directly.
- *Duplicate the grid math in TypeScript so it is testable* — rejected outright; two
  implementations of the same rule is exactly what Constitution II forbids in spirit.

---

## 6. Auto-placement for items added without a drop point

**Decision**: `DiagramPanel.addRequirementToDiagram` stops inventing a random
`pointer` and instead sends the node with `autoPlace: true`. The webview then picks a
free slot via an outward spiral search from the viewport centre, using the same
bounding-box extents the grid layout uses, and skipping any candidate that would
overlap an existing node.

**Rationale**: FR-015 requires a non-overlapping position, and the current
`Math.random() * 300` scatter can and does place a node directly on top of another.
The extension host cannot know node extents — only the webview can — so the decision
has to move to the webview. Reusing `layout.js` means this is covered by the same test
as the grid.

**Alternatives considered**:

- *Keep random placement and retry on collision in the extension host* — rejected; the
  host has no node geometry to collide against.
- *Always append to the end of a grid* — rejected; it would move nothing but would
  place new nodes far from the user's working area on a hand-arranged canvas.
