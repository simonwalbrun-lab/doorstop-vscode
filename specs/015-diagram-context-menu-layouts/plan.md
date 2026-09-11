# Implementation Plan: Diagram Context Menu Actions & Static Layouts

**Branch**: `015-diagram-context-menu-layouts` | **Date**: 2026-09-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-diagram-context-menu-layouts/spec.md`

## Summary

Three changes to the traceability diagram canvas, all concentrated in the webview
layer:

1. **Context menu grows two actions on a body node** — "Remove from Diagram"
   (canvas-only; requirement and links untouched) and "Add Link to…" (a two-step
   pick-the-target flow that reuses the existing `addLink` message and server
   endpoint the drag-to-link gesture already uses).
2. **Body items become permanently static** — every body node carries
   `physics: false` for its entire life; the global physics engine only runs while
   Ghost Preview is on, so ghost items keep exactly today's behaviour. The
   Auto-Arrange toggle and all of its state disappear.
3. **Two one-shot arrangement commands** — the existing hierarchical layout becomes a
   compute-then-bake command instead of a persistent mode, and a new grid command
   places body items on a near-square grid. Because neither is a mode any more, no
   toolbar button disables any other (FR-024), and spec 011's mutual-exclusivity rule
   is retired.

No server change is needed: every mutation this feature performs (`POST
/items/{uid}/links`) already exists and is already reached from the canvas. Removal
touches only the diagram document, which is extension-side.

## Technical Context

**Language/Version**: TypeScript 5.x (extension host), ES2020 browser JavaScript
(diagram webview), Python 3.11+ (server — untouched by this feature)

**Primary Dependencies**: VS Code Extension API; `vis-network` 10.1.2 (loaded in the
webview from unpkg per the existing CSP); esbuild for bundling. **No new dependency
is introduced** (Constitution IV).

**Storage**: `*.doorstop.json` diagram documents via the existing custom editor and
its Save/Revert/backup flow. Requirement data lives in the Doorstop repository and is
only ever mutated through the Python server (Constitution I).

**Testing**: `@vscode/test-cli` suites under `src/test` (Node/Mocha inside a VS Code
host); `server/tests` pytest — not needed here, since no server code changes.

**Target Platform**: VS Code desktop extension host + webview (Chromium).

**Project Type**: VS Code extension with a webview canvas and a local Python sidecar.

**Performance Goals**: A layout command over 50 body items completes and settles in
under 2 seconds (SC-007). Removal and link creation are single-frame canvas
operations plus one server round trip for the link.

**Constraints**: Diagram files store workspace-relative paths; graph interaction stays
delegated to `vis-network` rather than hand-rolled (Constitution, Additional
Constraints). Webview scripts are plain IIFE files copied — not bundled — by
`esbuild.js`, and load in a fixed order under a nonce CSP, so any new webview file
must be added to both `diagram.html` and the copy step.

**Scale/Scope**: Diagrams of roughly 1–100 body items. Touched files:
`src/webview/diagram/{diagram.html,main.js,interactions.js,state.js}`, one new
`layout.js`, a small `diagrammPanel.ts` change for auto-placement, plus tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Assessment | Verdict |
| --- | --- | --- |
| **I. Server is the single source of truth** | Link creation from the context menu sends the existing `addLink` message, which calls `POST /items/{uid}/links`. No link logic is duplicated client-side. Removing a node changes only the diagram document — deliberately *not* a requirement mutation, per the confirmed clarification. | PASS |
| **II. No reinvention of Doorstop functionality** | Nothing here is a Doorstop capability. Diagram membership and node positions are presentation state that Doorstop has no concept of. | PASS |
| **III. All features must include error handling** | Link failure already surfaces via `linkAddResult` + `showErrorMessage`; the new flow reuses that path (FR-011). Self-link (FR-009) and cancel (FR-008) are handled explicitly in the webview. Removal has no failure mode beyond a missing node, which is a no-op. Layout on an empty canvas is an explicit no-op (FR-023). | PASS |
| **IV. No external dependencies without justification** | Zero new dependencies. Both layouts are computed with `vis-network` primitives already in use. | PASS |
| **V. Typed, linted, tested before it ships** | `npm run compile` (check-types + lint + esbuild) gates the change. No server CRUD/linking/concurrency behaviour changes, so `server/tests` needs no addition. | PASS |
| **VI. Every feature ships with a CI-runnable test** | The grid/placement geometry is extracted into `src/webview/diagram/layout.js` as a dual-mode module (attaches to `window.DoorstopDiagram` in the webview, exports via `module.exports` under Node) so the existing `src/test` vscode-test suite can `require` and assert it headlessly — deterministic, no server, no fixture state. Node-removal persistence is covered against a real temporary diagram document in the same suite. See [quickstart.md](./quickstart.md) §Automated. | PASS |

**Result**: No violations. Complexity Tracking section omitted — nothing to justify.

The one deliberate deviation worth calling out at merge time (per Governance): this
feature **removes FR-014 from spec 011** (Ghost Preview ⇄ Hierarchical Layout mutual
exclusivity). That spec has been annotated in place rather than silently changed.

## Project Structure

### Documentation (this feature)

```text
specs/015-diagram-context-menu-layouts/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── webview-messages.md   # Phase 1 output — webview ⇄ extension message contract
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── diagrammPanel.ts              # CHANGED: auto-placement flag instead of a random
│                                 #   pointer for the "Add to Diagram" command path
└── webview/diagram/
    ├── diagram.html              # CHANGED: drop #physics-toggle, add #grid-layout
    │                             #   button, add #diagram-status, load layout.js
    ├── layout.js                 # NEW: pure geometry — grid positions, free-slot
    │                             #   search. Dual-mode (window + module.exports)
    ├── main.js                   # CHANGED: static body nodes, one-shot layout
    │                             #   commands, remove physics toggle, removeNode
    │                             #   handling
    ├── interactions.js           # CHANGED: new context-menu entries, pending
    │                             #   link-target selection mode
    ├── state.js                  # CHANGED: drop physicsEnabled/physicsToggle-
    │                             #   Suspended/hierarchical, add pendingLinkSource
    ├── render.js                 # unchanged
    ├── messaging.js              # unchanged
    └── diagram.css               # CHANGED: styling for #diagram-status and the
                                  #   link-targeting cursor affordance

src/test/
└── diagramLayout.test.ts         # NEW: layout geometry + removal persistence
                                  #   (wired into .vscode-test.mjs as a new label)

.vscode-test.mjs                  # CHANGED: register the new suite
esbuild.js                        # unchanged (copies src/webview/** wholesale)
```

**Structure Decision**: The existing extension layout is kept as-is. All behaviour
lives in the webview module set that already owns the canvas; the only new file is
`layout.js`, split out purely so the geometry is reachable from a headless CI test
(Constitution VI) rather than trapped behind a browser `window` object. No new
abstraction layer is introduced.

## Phase 0 — Research

See [research.md](./research.md). Five questions were resolved:

1. How to keep body nodes permanently static while ghost nodes stay physics-driven.
2. How to turn `vis-network`'s hierarchical layout from a persistent mode into a
   one-shot command without hand-rolling a layered layout.
3. Grid dimensioning and spacing that satisfies "differ by at most one" and
   "no overlap at the widest label in use".
4. How the two-step link-target selection interacts with the existing single-click
   (open file) and double-click handlers, and whether ghost nodes are valid targets.
5. How to test webview-only geometry in a suite CI already runs.

No `NEEDS CLARIFICATION` markers remain.

## Phase 1 — Design & Contracts

- [data-model.md](./data-model.md) — the webview state objects this feature adds,
  changes, and deletes, plus the unchanged on-disk diagram schema.
- [contracts/webview-messages.md](./contracts/webview-messages.md) — the
  webview ⇄ extension message contract: one new outbound message shape, one changed
  payload field, and the existing messages this feature reuses verbatim.
- [quickstart.md](./quickstart.md) — how to build, run, and validate the feature,
  covering both the automated CI test and the manual acceptance walk-through mapped to
  the spec's user stories.

### Post-design Constitution re-check

Re-evaluated after the artifacts above were written: still **PASS** on all six
principles. The design added no dependency, no server surface, and no duplicated
Doorstop logic; the single new file exists to satisfy Principle VI rather than to
introduce an abstraction.
