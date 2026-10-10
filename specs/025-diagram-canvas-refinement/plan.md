# Implementation Plan: Diagram Canvas Refinement

**Branch**: `025-diagram-canvas-refinement` | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/025-diagram-canvas-refinement/spec.md`

## Summary

Five changes to the diagram canvas, all inside the extension. None of them touches the server:

1. Move the "New Diagram" entry point into the Doorstop Commands panel and delete "Open Traceability Graph". Existing diagrams already open by clicking the file, because the custom editor is the default for `*.doorstop.json`.
2. On load, reconcile each node's stored `fileUri` against the server's `/tree` path for its UID. Corrections go through the existing custom-document change event, so the editor becomes dirty and the user saves.
3. Delete the vis-network manipulation ("Edit") toolbar. The context menu already covers every edit.
4. Size-aware layouts: per-column/per-row grid sizing, and hierarchical spacing taken from measured extents. Headings wrap at the first space after 30 characters.
5. Remove status badges, the suspect border and the legend's Status section, and stop sending status flags to the webview.

## Technical Context

**Language/Version**: TypeScript 5 (extension host), plain ES2020 JavaScript (webview)

**Primary Dependencies**: VS Code Extension API, vis-network 10.1.2 (webview, CDN). No new dependencies.

**Storage**: `*.doorstop.json` diagram files through the existing CustomEditorProvider (format unchanged)

**Testing**: `@vscode/test-cli` suites in `src/test/`: `diagramLayout.test.ts`, `extension.test.ts`, and `regressionFixture.test.ts` (real Doorstop server, end-to-end path repair)

**Target Platform**: VS Code desktop (Windows/Linux/macOS)

**Project Type**: VS Code extension plus a local Python server (server untouched)

**Performance Goals**: Reconciliation is O(nodes) over the already-fetched `/tree` map, with no extra server round trip. Layout commands should stay instant for diagrams of 50+ nodes.

**Constraints**: Diagram paths stay workspace-relative on disk. Persistence goes only through Save / Revert / backup. Layout stays delegated to vis-network.

**Scale/Scope**: About 8 files touched (`package.json`, `extension.ts`, `commandsProvider.ts`, `diagrammPanel.ts`, `webview/diagram/{main,render,layout}.js`, `diagram.html`) plus 3 test files (`diagramLayout`, `extension`, `regressionFixture`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Note |
| --- | --- | --- |
| I. Server is single source of truth | ✅ | Paths come from the existing `/tree` (`meta[uid].path`). No client-side file discovery. |
| II. No reinvention of Doorstop | ✅ | UID→path resolution is Doorstop's own tree. Duplicate UIDs make Doorstop reject the tree, which ends up in the FR-011 "not verified" path. |
| III. Error handling | ✅ | Server unavailable → render as stored, plus a warning. Unknown UID → node kept, plus a warning. No silent rewrite. |
| IV. No new dependencies | ✅ | None added. Heading wrap is a small pure function; vis `widthConstraint` was rejected (R5). |
| V. Typed, linted, tested | ✅ | `npm run compile` gate unchanged. The server is unchanged, so no pytest change is needed. |
| VI. CI-runnable test | ✅ | End-to-end floor test: real server `/tree` → `reconcilePaths` → `serializeDiagram` in the regression fixture suite (R9). Pure functions (`wrapHeading`, `gridPositions`, `hierarchicalSpacing`, `reconcilePaths`) and manifest assertions run in the existing `npm test` configs. |
| Constraint: diagram persistence | ✅ | Corrections mark the document dirty through `onDidChangeCustomDocument`. They are never written to disk during load. |
| Constraint: vis-network owns layout | ✅ | Hierarchical layout still runs in vis; only its spacing options are computed. |

**Post-design re-check**: still passes after the analysis follow-ups below. K1 (the Principle VI end-to-end gap) is closed by R9. Nothing to record under Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/025-diagram-canvas-refinement/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/ui-contract.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
package.json                         # drop showDiagram + TreeView title diagram entries; newDiagram title → "Doorstop: New Diagram"
src/
├── extension.ts                     # delete showDiagram registration; addToDiagram hint text
├── commandsProvider.ts              # + "New Diagram" node
├── diagrammPanel.ts                 # reconcilePaths + handleReady wiring; drop status fields/suspect
└── webview/diagram/
    ├── diagram.html                 # drop legend Status section
    ├── layout.js                    # wrapHeading, hierarchicalSpacing, gridPositions(extents)
    ├── render.js                    # drop buildBadge/SUSPECT_BORDER; buildLabel wraps heading
    └── main.js                      # drop manipulation block; size-aware layout calls; relabel w/o badge
src/test/
├── diagramLayout.test.ts            # wrap / grid (incl. 50-node mixed extents) / spacing; built-source checks
├── extension.test.ts                # reconcilePaths unit cases + command/menu contract (incl. addToDiagram kept)
│                                    # (packageMenus.test.ts is not wired into .vscode-test.mjs)
└── regressionFixture.test.ts        # E2E: move REQ-001.yml → /tree → reconcilePaths → serializeDiagram
```

**Structure Decision**: This is the existing single-extension layout. No new source files are added. The new pure helpers go into `layout.js`, the only webview module that loads under Node, so CI can test them.

## Implementation Notes

- `reconcilePaths` compares paths with `path.relative(a, b) === ''` so differences in drive-letter case on Windows don't count as a change (R1). It returns the input object unchanged when nothing changed, so `handleReady` does not fire a change event in that case.
- `handleReady` sends the corrected diagram to the webview **and** calls `_onDiagramChanged`. The webview never echoes a change back for a load, so it has to be called here.
- Delete `pendingLinkOps`' `addEdge` producer together with the manipulation block. Keep the map itself, because `requestLink` and the link-result handler still use it.
- `nodeExtents` already exists in `main.js`; the layout commands only change how they use it.
- Update the existing `gridPositions` tests to the new `{ extents, gap, center }` signature.
- `wrapHeading` breaks at `rest.indexOf(' ', 30)`, the first space after the first 30 characters (FR-017 as reworded).

## Analysis Follow-ups (from /speckit-analyze)

| ID | Finding | Resolution | Where |
| --- | --- | --- | --- |
| K1 | No end-to-end test for path repair (Principle VI) | Regression-fixture test against the real server | research.md R9; quickstart.md |
| W1 | FR-017 "at or after the 30th character" was off by one from the planned `indexOf(' ', 30)` | Spec reworded to "first space after the first 30 characters (index ≥ 30)" | spec.md FR-017/018, US2 AS4–5; research.md R5 |
| G1 | No automated check of SC-003 at scale or of hierarchical overlap | 50-node mixed-extent grid test; hierarchical overlap is a manual check (needs vis) | research.md R4; quickstart.md |
| I1 | Spec duplicate-UID edge case contradicted the plan | Spec edge case now defers to Doorstop and FR-011 | spec.md Edge Cases |
| T1 | "New Diagram" panel label vs "New Traceability Graph" palette title | Command title renamed to "Doorstop: New Diagram" | research.md R8; contracts/ui-contract.md |
| G2 | FR-005 (Add to Diagram kept) untested | Manifest suite asserts the context entry | research.md R8; quickstart.md |
| G3, G4, C1 | Context menu manual-only; backup path untested; source-text tests | Accepted, reasons recorded | research.md "Analysis follow-ups" |

`tasks.md` predates these follow-ups. Run `/speckit-tasks` again to bring it up to date.

## Complexity Tracking

No violations.
