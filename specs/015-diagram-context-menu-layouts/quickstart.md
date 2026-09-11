# Quickstart & Validation: Diagram Context Menu Actions & Static Layouts

**Feature**: `015-diagram-context-menu-layouts` | **Date**: 2026-09-10

How to build, run, and prove this feature works. See
[data-model.md](./data-model.md) for the state shapes and
[contracts/webview-messages.md](./contracts/webview-messages.md) for the message
contract; neither is repeated here.

---

## Prerequisites

- Node dependencies installed: `npm install`
- A Python environment with `doorstop_server` importable — the repo `.venv` (created
  by `pip install -e .[dev]` from `server/`) or a PATH `python`/`python3`, exactly as
  `src/test/regressionFixture.test.ts` resolves it.
- The fixture workspace at `testdata/regression` (already in the repo).

---

## Build

```bash
npm run compile          # check-types + lint + esbuild (copies src/webview → dist/webview)
```

`esbuild.js` copies the webview directory verbatim, so the new
`src/webview/diagram/layout.js` lands at `dist/webview/diagram/layout.js` with no
build change. It must also be added to the script list in
`src/webview/diagram/diagram.html`, **before** `interactions.js` and `main.js` in load
order, since both consume it.

---

## Automated validation (Constitution VI)

```bash
npm test                 # runs every vscode-test label, including the new suite
```

The new `src/test/diagramLayout.test.ts` suite (registered in `.vscode-test.mjs`)
must cover at minimum:

| Assertion | Proves |
| --- | --- |
| `gridPositions` with n = 1, 2, 3, 5, 7, 9, 10, 50 yields `cols`/`rows` differing by at most one | FR-018, SC-004 |
| No two returned points are closer than the cell pitch on either axis | FR-018 "no overlap", SC-004 |
| `gridPositions([])` returns `[]` and throws nothing | FR-023 |
| Same input twice yields identical output | determinism, SC-004 |
| Returned bounding box is centred on the supplied `center` | grid stays in view |
| `findFreeSlot` with an empty `occupied` returns `center`; with a node at `center` returns a non-overlapping point | FR-015 |
| A diagram document round-tripped after dropping one node from `nodes[]` and its incident `edges[]` reloads without that node | FR-002, FR-004 |

The suite must be non-interactive, must not need a running server, and must create and
clean up any temporary diagram file it writes — the same bar
`server/tests` and `regressionFixture.test.ts` already meet.

---

## Manual acceptance walk-through

Launch the extension host (`F5` in VS Code, or the "Run Extension" launch config)
against `testdata/regression`, then create or open a `*.doorstop.json` diagram and add
several requirements to it.

### US1 — Remove an item from the diagram

1. Right-click a body node → **Remove from Diagram**.
2. ✅ The node and every line touching it disappear.
3. ✅ Save, close, reopen the diagram — the item is still gone.
4. ✅ Open the requirement's `.yml` file — it still exists and its `links:` block is
   byte-identical to before (SC-006; check with `git diff`).
5. Remove the last remaining node. ✅ Empty canvas, no error notification.

### US2 — Create a link from the context menu

1. With two unlinked body nodes on the canvas, right-click the first →
   **Add Link to…**. ✅ A status banner appears telling you to pick a target.
2. Click the second node. ✅ An arrow appears from the first to the second, and the
   first requirement's `links:` now contains the second's UID.
3. Repeat and press <kbd>Esc</kbd> instead of picking. ✅ Banner clears, nothing
   changed.
4. Repeat and click the *source* node itself. ✅ Explicit message, no self-link.
5. Repeat the successful link from step 2. ✅ Succeeds silently, still one arrow.
6. Stop the Doorstop server, then try again. ✅ Error notification names the failure;
   canvas unchanged.

### US3 — Body items never move on their own

1. Drag four nodes into a deliberate shape and note their positions.
2. Add another requirement via the tree's **Add to Diagram**. ✅ Nothing already on the
   canvas moves, and the new node lands somewhere free — not on top of an existing one.
3. Toggle **Ghost Preview** on. ✅ No body node twitches; ghosts appear and settle
   around them.
4. Drag a body node. ✅ Its ghosts follow it, other body nodes stay put.
5. Toggle Ghost Preview off, toggle **Show Headings** on and off. ✅ No body node moves
   at any point.
6. ✅ There is no Auto-Arrange button anywhere in the toolbar.
7. Save, close, reopen. ✅ Every node is exactly where you left it.

### US4 — Grid arrangement

1. Scatter nine nodes randomly, then click **Grid Layout**.
2. ✅ They form a 3×3 grid, evenly spaced, none overlapping.
3. Turn **Show Headings** on and click Grid Layout again. ✅ Spacing widens so the
   longer labels still do not overlap.
4. Drag one node away. ✅ It stays where you dropped it; the grid is not re-applied.
5. Save, close, reopen. ✅ Grid positions preserved.
6. Remove every node, then click Grid Layout. ✅ Nothing happens, no error.
7. With Ghost Preview on, click Grid Layout. ✅ Only body nodes snap to the grid;
   ghosts re-settle around them.

### US5 — Hierarchical arrangement, no button dependencies

1. Click **Hierarchical Layout**. ✅ Nodes lay out top-down along link direction.
2. ✅ Immediately after, drag a node — it moves freely and stays put.
3. ✅ While Ghost Preview is on, Hierarchical Layout is still clickable and still
   works; Ghost Preview stays on.
4. Click **Grid Layout** after a hierarchical pass. ✅ Nodes re-lay out as a grid.
5. ✅ Walk the whole toolbar in every combination of Ghost Preview and Show Headings:
   no button is ever greyed out (SC-005).

---

## Regression checks (things this feature must not break)

- Drag a requirement from an **editor** onto the canvas — still lands at the drop
  point, not auto-placed.
- Right-click a body node → **Add Linked Item…** — still creates a new item, links it,
  and jumps to it.
- Right-click an edge → **Remove Link** — still removes the real link.
- Right-click a ghost node → **Add to Diagram** — still promotes it, opens its file,
  keeps Ghost Preview on, and recomputes the ghost set.
- A Ghost Preview request that fails still shows `#ghost-preview-status` and leaves
  body items untouched (spec 011 FR-012).
