# Implementation Plan: Diagram Hot-Exit Backup Recovery

**Branch**: `008-diagram-interaction` | **Date**: 2026-09-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-diagram-interaction/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Spec 008 documents the diagram canvas as already shipped, with one exception
flagged under **Follow-up Tasks**: `openCustomDocument` in `src/extension.ts`
ignores `openContext.backupId`, so VS Code's hot-exit backup (faithfully
written by `backupCustomDocument` on every canvas change) is never read back.
Unsaved canvas edits — most visibly dragged node positions — are silently lost
on a VS Code crash or window reload, even though the backup file exists on
disk the whole time. This plan covers only that fix, per the scope the user
selected: everything else in spec 008 (FR-001 through FR-016) is already
implemented and needs no planning.

## Technical Context

**Language/Version**: TypeScript (project-wide `typescript` ^6.0.3), VS Code Extension API ^1.75.0

**Primary Dependencies**: None new — uses only `vscode.CustomEditorProvider`'s existing `CustomDocumentOpenContext.backupId` and `vscode.workspace.fs`, both already in use elsewhere in `src/extension.ts`

**Storage**: The diagram file itself (`*.doorstop.json`, workspace-relative paths) and the hot-exit backup file VS Code manages at `context.destination` (write side, already implemented) / `openContext.backupId` (read side, missing today)

**Testing**: `src/test/extension.test.ts` via `@vscode/test-cli` / `@vscode/test-electron` — currently only a placeholder sample test (`assert.strictEqual(-1, [1,2,3].indexOf(5))`), no real extension-host tests exist yet for any feature. Recommended (not constitutionally required — Principle V's mandatory-test clause is scoped to server/Python changes): add one real integration test here, since this is exactly the kind of fix that silently regresses if unexercised.

**Target Platform**: VS Code desktop extension host (Windows/macOS/Linux) — this is the platform this fix already targets today

**Project Type**: VS Code extension (single project) — no web/mobile split applies

**Performance Goals**: N/A — one extra file read/parse on diagram open, only when a backup exists; no measurable perf target

**Constraints**: MUST NOT change the on-disk diagram JSON format; MUST NOT change behavior when no backup exists (today's default path stays identical); MUST fall back to the original file, not throw, if the backup exists but is unreadable/corrupt (Constitution Principle III)

**Scale/Scope**: One function (`openCustomDocument` in `src/extension.ts`); reuses the existing `DoorstopDiagramPanel.readDiagram` static helper rather than duplicating its JSON-parsing/path-normalization logic. No server/Python changes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Assessment |
| --- | --- | --- |
| I. Server Is the Single Source of Truth | No | Purely extension-host file I/O (VS Code's own backup mechanism); no server/API interaction at all. |
| II. No Reinvention of Doorstop Functionality | No | No Doorstop domain logic (documents/items/links) is touched — this is a VS Code `CustomEditorProvider` contract detail. |
| III. All Features Must Include Error Handling | **Yes** | This is the crux of the fix: reading a backup MUST have an explicit, safe fallback (original file) if the backup is missing, unreadable, or fails to parse — never a thrown error that blocks opening the diagram. Designed below in Phase 0/1. |
| IV. No External Dependencies Without Justification | No new dependency | Uses only the VS Code API already depended on; nothing to justify. |
| V. Typed, Linted, and Tested Before It Ships | **Yes** | `npm run compile` (check-types + lint) gates this change like any other TypeScript change. The server pytest MUST-test clause doesn't apply (no server change); an extension-host test is recommended, tracked as a task rather than a hard gate. |

**Result**: PASS. No violations to justify — Complexity Tracking table below is empty.

**Post-design re-check** (after Phase 0/1, see `research.md` and `data-model.md`):
still PASS, unchanged — the chosen design (try backup → fall back to original
file on any failure, reusing `readDiagram`) is exactly what Principle III
required going in; nothing in Phase 0/1 introduced a new dependency, server
interaction, or Doorstop-domain logic that would change the table above.

## Project Structure

### Documentation (this feature)

```text
specs/008-diagram-interaction/
├── spec.md               # Feature spec (already written; documents the whole canvas-interaction feature)
├── plan.md               # This file — scoped to the backup-recovery fix only
├── research.md           # Phase 0 output
├── data-model.md         # Phase 1 output
└── quickstart.md         # Phase 1 output
# No contracts/: this fix has no external interface (no new HTTP endpoint, no
# new webview message) — it's purely inside openCustomDocument's own contract
# with VS Code, which already exists and isn't changing shape.
```

### Source Code (repository root)

```text
src/
├── extension.ts          # diagramEditorProvider.openCustomDocument — the one function being changed
├── diagrammPanel.ts       # DoorstopDiagramPanel.readDiagram — reused as-is to parse the backup file
└── test/
    └── extension.test.ts  # currently a placeholder; recommended location for a new backup-restore test

server/                    # untouched — no server-side change in this fix
```

**Structure Decision**: Single-project VS Code extension layout (matches the
rest of the repo). The fix touches exactly one function in `src/extension.ts`
and reuses `DoorstopDiagramPanel.readDiagram` from `src/diagrammPanel.ts`
unchanged; no new files, modules, or directories are needed.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

None — the Constitution Check above found no violations, so this table is
intentionally empty.
