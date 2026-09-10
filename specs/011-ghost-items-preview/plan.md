# Implementation Plan: Diagram Ghost Items & Content Preview

**Branch**: `011-ghost-items-preview` | **Date**: 2026-09-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/011-ghost-items-preview/spec.md`

## Summary

Add a "Ghost Preview" mode to the diagram canvas: when toggled on, every
item directly linked to an on-canvas body item (but not itself added) is
shown as a smaller, lightened, non-persisted "ghost" node, physics-driven
and tethered to its body item(s) while body items themselves stay fixed in
place. Add a hover content preview (heading + body text) for both body and
ghost nodes, a heading-display toggle shared by both, and a ghost context
menu action that promotes a ghost into a real body item (opening its file,
per this project's existing "jump to new items" convention).

Technical approach: no server changes. The `GET /tree` endpoint already
returns every item's `header`, `text`, and `links` — this feature only adds
a thin client-side (extension host + webview) layer that (1) filters the
already-cached tree data down to one-hop ghost candidates, (2) forwards the
previously-unforwarded `header`/`text` fields to the webview, and (3) adds
new vis-network rendering/physics/context-menu/toggle behavior in the
existing diagram webview files. See `research.md` for the five concrete
design decisions this rests on.

## Technical Context

**Language/Version**: TypeScript 5.x (extension host, `src/diagrammPanel.ts`); vanilla ES2020+ JS, no framework (webview, `src/webview/diagram/*.js`); Python 3.11 (server — unaffected, no changes)

**Primary Dependencies**: VS Code Extension API; vis-network (already a dependency, used for physics/manipulation/context-menu — no version change); existing FastAPI server's `GET /tree` (read-only reuse, no new endpoint)

**Storage**: `*.doorstop.json` diagram files via the existing custom editor (unchanged schema — Ghost Items are explicitly never persisted, FR-011)

**Testing**: `npm run check-types` + `npm run lint` (Constitution Principle V gate); manual verification in the Extension Development Host per `quickstart.md` (this repo has no automated webview/vis-network UI test harness for any existing diagram feature — drag-and-drop, context menus, and physics toggles are all verified the same way today); `server/tests` pytest suite is unaffected since no server code changes

**Target Platform**: VS Code desktop extension (cross-platform via VS Code API; developed/verified on Windows this session)

**Project Type**: Single VS Code extension (existing repo layout) — extension host + webview, no separate frontend/backend split for this feature

**Performance Goals**: Ghost adjacency computation is an in-memory filter over the already-fetched `/tree` payload (no new network round trip on the happy path) — must stay imperceptible (well under the SC-003 "~2 seconds" hover budget, and effectively instant for the toggle itself) for typical fixture-scale projects (tens to low hundreds of items)

**Constraints**: No new runtime dependencies (Constitution Principle IV) — hover tooltip, ghost rendering, and the new context-menu entry are implemented with vis-network APIs and hand-rolled DOM, matching the existing `interactions.js` context-menu pattern; no client-side re-implementation of Doorstop file parsing, numbering, or link/suspect computation (Constitution Principle I) — ghost adjacency is a filter over server-computed data only, per `research.md` §1

**Scale/Scope**: Diagram canvases in practice hold on the order of tens of body items; ghost sets are bounded to one-hop adjacency (per spec Assumptions) so stay in the same order of magnitude

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Result |
| --- | --- | --- |
| I. Server Is the Single Source of Truth | Ghost adjacency, hover content, and all item metadata come exclusively from the existing `GET /tree` response, already fetched through the server. No file is read or parsed client-side beyond what `diagrammPanel.ts` already does for body items today. Set-filtering already-server-sourced data (same pattern as the tree-view spike earlier this session) does not re-implement discovery/parsing/hierarchy logic. | PASS |
| II. No Reinvention of Doorstop Functionality | No Doorstop capability (linking, numbering, suspect detection) is reimplemented; ghost promotion explicitly reuses the existing `handleDroppedData` code path rather than duplicating it (research.md §5). | PASS |
| III. All Features Must Include Error Handling | FR-012 already specifies the failure path (tree fetch fails → leave body items untouched, show incomplete indicator); the `ghostPreviewData {incomplete: true}` contract in `contracts/diagram-message-protocol.md` implements this explicitly, not as a follow-up. | PASS |
| IV. No External Dependencies Without Justification | No new npm or Python package. Hover tooltip and ghost context-menu entry reuse existing hand-rolled DOM patterns already in `interactions.js`/`diagram.css`. | PASS |
| V. Typed, Linted, and Tested Before It Ships | All new/changed code is TypeScript (extension) or plain JS (webview, not subject to `check-types`, consistent with existing webview files); `check-types`/`lint` gates apply to the TS changes. No server code changes, so no new `server/tests` obligation. Webview behavior is verified manually per `quickstart.md`, the same standard already applied to this repo's other diagram features (physics toggle, drag-and-drop, canvas context menu) — no regression in rigor. | PASS |

No violations; **Complexity Tracking is not needed** for this feature.

*Post-Phase 1 re-check*: `data-model.md` and `contracts/diagram-message-protocol.md` confirm no server schema or endpoint changes, and no new dependencies were introduced while designing the message protocol or data shapes. Constitution Check result is unchanged: all PASS.

## Project Structure

### Documentation (this feature)

```text
specs/011-ghost-items-preview/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── diagram-message-protocol.md  # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not created by this command)
```

### Source Code (repository root)

This feature touches only the existing diagram subsystem of the single
extension project — no new top-level directories.

```text
src/
├── diagrammPanel.ts          # Extension host: extend NodeMeta with header/text,
│                              #   add ghost-adjacency computation, new message
│                              #   handlers (requestGhostPreview, promoteGhost)
├── extension.ts              # Unchanged (no new command registration needed —
│                              #   Ghost Preview is a webview-internal toggle, not
│                              #   a command-palette/tree-context entry)
└── webview/
    └── diagram/
        ├── diagram.html      # Add Ghost Preview + heading-display toggle buttons
        ├── diagram.css        # Style new toggles, ghost node/edge visuals, hover tooltip
        ├── state.js           # Add ghostPreviewEnabled, headingDisplayEnabled,
        │                      #   visGhostNodes, visGhostEdges, physicsToggleSuspended
        ├── render.js          # Ghost node styling (size/lightened color), label
        │                      #   rendering respecting the heading-display toggle
        ├── interactions.js    # Ghost item context-menu entry ("Add to Diagram"),
        │                      #   hover-preview show/hide wiring
        └── main.js            # requestGhostPreview/ghostPreviewData/promoteGhost
                                #   handlers, physics fixed/tethered logic, mutual
                                #   exclusion with #layout-toggle/#physics-toggle

server/   # No changes — GET /tree already returns everything this feature needs
```

**Structure Decision**: Existing single-project VS Code extension layout is
reused as-is. This feature is additive within `src/diagrammPanel.ts` and
`src/webview/diagram/`; no new modules, packages, or server routes are
introduced, per the research.md decisions to reuse rather than duplicate
existing mechanisms.

## Complexity Tracking

*Not applicable — no Constitution Check violations.*
