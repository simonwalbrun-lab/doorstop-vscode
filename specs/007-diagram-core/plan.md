# Implementation Plan: Traceability Diagram - Core Editor & Persistence

**Branch**: N/A (retroactive) | **Date**: 2026-10-10 | **Spec**: [spec.md](./spec.md)

## Summary

Retroactive plan. The feature is fully implemented: a `CustomEditorProvider`
(`doorstop.diagram`) for `*.doorstop.json`, a "New Diagram" command, workspace-
relative node paths, and a load-time `/tree` fetch that enriches the canvas and
falls back to the saved file on failure. Later specs extended it (008 hot-exit
backup + interaction, 015 layouts/removal, 025 reconcile-by-UID, badge removal).
Remaining work is **test traceability only** (Constitution v1.4.0 Principle VIII):
add `Spec 007 FR-NNN` trace comments and fill FR test gaps. No production-code change.

## Technical Context

**Language/Version**: TypeScript ^6, VS Code API ^1.75
**Primary Dependencies**: vis-network (webview), existing `DoorstopServer` HTTP client; none new
**Storage**: `*.doorstop.json` (`{nodes:[{id,fileUri,title,x,y}], edges:[{from,to,arrows}]}`)
**Testing**: `@vscode/test-cli` suites in `src/test/` (`extension.test.ts`, `diagramLayout.test.ts`, `regressionFixture.test.ts` with live server fixture)
**Target Platform**: VS Code desktop
**Project Type**: VS Code extension + Python server (server unchanged)
**Constraints**: file format stable; server failure must never blank the canvas
**Scale/Scope**: `src/extension.ts` (command + editor provider), `src/diagrammPanel.ts` (serialize/read, `loadDiagram`, `refreshItemMeta`, `withAuthoritativeEdges`), `src/webview/diagram/*`

## Constitution Check

| Principle | Result |
| --- | --- |
| I Server is source of truth | PASS - status/links fetched from `GET /tree` at load, never cached in the file |
| II No reinvention | PASS - no Doorstop logic in the extension |
| III Error handling | PASS - fetch failure falls back + one-time warning (FR-006); create failure shows error |
| IV Dependencies | PASS - none added |
| V Typed/linted/tested | PASS pending compile |
| VI CI-runnable test | PASS - tests exist |
| VII Long-running visible | PASS - load wrapped in `withDelayedProgress` |
| VIII FR traceability | **GAP** - no test carries a `Spec 007 FR-NNN` comment; FR-001, 003 (save/revert), 005, 006, 007 lack direct tests. Closed by tasks.md |

Post-design: unchanged. No complexity violations.

## Project Structure

```text
specs/007-diagram-core/  plan.md research.md data-model.md quickstart.md tasks.md
src/extension.ts         doorstop.newDiagram, custom editor provider (open/save/saveAs/revert/backup)
src/diagrammPanel.ts     serializeDiagram, readDiagram(OrBackup), loadDiagram flow, withAuthoritativeEdges
src/webview/diagram/     canvas rendering (document-colour legend; badges removed by spec 025)
src/test/                extension.test.ts, diagramLayout.test.ts, regressionFixture.test.ts
```

## FR-to-implementation / test map

| FR | Implementation | Existing test | Gap |
| --- | --- | --- | --- |
| 001 | `doorstop.newDiagram` writes empty diagram, `vscode.openWith` | contribution check only (extension.test "New Diagram is still contributed") | behavioural test |
| 002 | `serializeDiagram`, relative-path normalization in drop handler | round trip (diagramLayout "persistence after node removal"), 025 reconcile | relative-path assertion |
| 003 | `saveCustomDocument(As)`, `revertCustomDocument`, `backupCustomDocument` | backup recovery (spec 008 suite) | save + revert tests |
| 004 | `readDiagram` | round trip test | trace comment |
| 005 | `refreshItemMeta`, `loadDiagram` message (meta, documents) | none direct; 025 test asserts badges are gone | meta/colour test. NOTE: spec text says badges; spec 025 FR-020-022 removed them - spec 007 needs amendment |
| 006 | `loadDiagram` fallback with `_metaWarningShown` | none | test |
| 007 | `withAuthoritativeEdges` (private) | none | test (needs exposure or message-level test) |
