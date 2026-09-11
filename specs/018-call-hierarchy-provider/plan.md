# Implementation Plan: Requirement Call Hierarchy

**Branch**: `018-call-hierarchy-provider` | **Date**: 2026-09-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/018-call-hierarchy-provider/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Register a VS Code `CallHierarchyProvider` for requirement files (`yaml` /
`markdown`) that maps Doorstop's link graph onto the editor's built-in peek
call hierarchy: **outgoing calls = upstream** (the UIDs under the item's
`links:`) and **incoming calls = downstream** (the items whose `links:` name
this item). Every `CallHierarchyItem` is named `UID: Heading` with the owning
document prefix as its `detail`. Both directions are read from the existing
`DoorstopIndex` (built from `GET /tree`), so no server change and no
client-side YAML parsing is needed. A new tree-row inline command,
`doorstop.showCallHierarchy`, opens the item's file at its header line, runs
the built-in `editor.showCallHierarchy`, then `editor.showOutgoingCalls` so
the peek starts in the outgoing (upstream) direction (FR-003b). Multi-level
traversal (US2), selection-to-open (US3), the direction icons on the peek's
title bar (FR-003a) and "Go Back" (FR-006) all come from the built-in widget
for free; the extension implements only the provider and the launch command.

## Technical Context

**Language/Version**: TypeScript (project-wide `typescript` ^6.0.3), VS Code
Extension API `^1.75.0` (`registerCallHierarchyProvider` has been stable
since 1.44, so no engine bump)

**Primary Dependencies**: None new — `vscode.languages.registerCallHierarchyProvider`,
the existing `DoorstopIndex` / `loadDoorstopIndex` (`src/doorstopIndex.ts`),
the existing header/link line-locating helpers in `src/definitionProvider.ts`
(to be exported rather than duplicated), and the built-in editor commands
`editor.showCallHierarchy` / `editor.showOutgoingCalls`

**Storage**: N/A — no persisted state. Each `prepare` / `provideIncoming` /
`provideOutgoing` call loads the index fresh via `GET /tree` (FR-012). The
peek's last-used direction is persisted by VS Code itself, not by us.

**Testing**: `src/test/regressionFixture.test.ts` (extension host against the
real `testdata/regression` fixture and a real Doorstop server — the suite CI
already runs, constitution VI) for the provider's success and dangling-link
paths via the built-in `vscode.prepareCallHierarchy` /
`vscode.provideIncomingCalls` / `vscode.provideOutgoingCalls` commands, plus
`src/test/packageMenus.test.ts` (static manifest assertions, no server) for
the inline icon placement. Both are driven by `npm test` → `vscode-test`,
which CI runs under `xvfb-run`.

**Target Platform**: VS Code desktop extension host (Windows/macOS/Linux) —
same as every existing language feature in the extension

**Project Type**: VS Code extension (single project)

**Performance Goals**: SC-003 — peek appears within 2 s for a workspace of up
to 1,000 items. Each provider call is one local `GET /tree` round-trip (the
same cost class as hover / F12 today) plus reading only the files needed to
locate link lines: the root item's own file for outgoing, and one file per
linker for incoming. No whole-workspace scan.

**Constraints**: MUST NOT re-parse Doorstop files or recompute links
client-side (constitution I/II) — both directions come from `DoorstopIndex`;
MUST NOT add a server endpoint (`GET /tree` already carries `links[]`,
`header`, `path`, and the document `prefix`); MUST use the built-in peek
widget, not a custom panel (spec FR-003a); MUST degrade to "No results" /
a warning message rather than throwing when the server is unreachable or a
file is missing (constitution III, spec FR-011); MUST keep
`hoverProvider.ts` and `requirementTree.ts` behaviour unchanged.

**Scale/Scope**: One new source file (`src/callHierarchyProvider.ts`), two
small exports added to `src/definitionProvider.ts`, one registration call in
`src/extension.ts`, one command + one menu entry in `package.json`, one test
block in each of two existing test files. No server changes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Assessment |
| --- | --- | --- |
| I. Server Is the Single Source of Truth | **Yes** | Upstream (`item.links`) and downstream (`index.getLinkers`) both come from the server's `GET /tree` through the shared `DoorstopIndex`. No file globbing, no YAML parsing. The only file reads are to find *which line* of an already-identified file holds a UID (editor-position bookkeeping, same precedent as feature 009). |
| II. No Reinvention of Doorstop Functionality | **Yes** | Link resolution and reverse-link discovery are Doorstop's; the extension just reads them. The hierarchy itself is a presentation of that data via the editor's own widget — nothing Doorstop offers is reimplemented. |
| III. All Features Must Include Error Handling | **Yes** | Designed in from the start (research §5): index unavailable → warning message + `undefined` (peek shows "No results"); dangling UID → unresolved entry, expansion returns `[]`; file missing when launching from the tree → error message, no peek; provider methods never throw. |
| IV. No External Dependencies Without Justification | No new dependency | VS Code API + existing modules only. |
| V. Typed, Linted, and Tested Before It Ships | **Yes** | `npm run compile` gates the change; no server change so `server/tests` is unaffected. |
| VI. Every Feature Ships With a CI-Runnable Test | **Yes** | New tests land in `regressionFixture.test.ts` (provider, real server, real fixture — already in CI's `xvfb-run -a npm test`) and `packageMenus.test.ts` (inline icon). Deterministic: the fixture link graph is fixed by contract (spec 012 `fixture-layout.md`). |

**Result**: PASS. No violations; Complexity Tracking is empty.

**Post-design re-check** (after Phase 0/1): still PASS. The design adds no
dependency, no server change, no custom UI, and no client-side parsing; the
one place it reads files (link-line location) is the same pattern feature
009 already established and justified.

## Project Structure

### Documentation (this feature)

```text
specs/018-call-hierarchy-provider/
├── spec.md               # Feature spec (clarified 2026-09-11)
├── plan.md               # This file
├── research.md           # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── call-hierarchy.md # Phase 1 output: command id, menu entry, provider behaviour
└── tasks.md              # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── callHierarchyProvider.ts   # NEW: CallHierarchyProvider (prepare / incoming / outgoing) + doorstop.showCallHierarchy command
├── definitionProvider.ts      # MODIFIED: export findHeaderLocation + findReferenceLocation (currently module-private) so the provider reuses them
├── doorstopIndex.ts           # Existing — reused as-is (getItem, getLinkers, getUri, getDocumentUid)
├── doorstopTypes.ts           # Existing — reused as-is (ItemNode.links, header; DocumentNode.prefix)
├── extension.ts               # MODIFIED: registerCallHierarchyProvider(...) next to registerDefinitionProvider(...)
├── requirementTree.ts         # Existing — untouched (RequirementTreeItem.itemData.uid / resourceUri are what the command receives)
└── test/
    ├── regressionFixture.test.ts  # MODIFIED: new suite block "Call Hierarchy (018)" — prepare/incoming/outgoing/dangling + tree command opens the file
    └── packageMenus.test.ts       # MODIFIED: asserts the inline "calls" icon is on doorstop.item rows only

package.json                   # MODIFIED: contributes.commands += doorstop.showCallHierarchy; view/item/context += inline entry (viewItem == doorstop.item)

server/                        # Untouched — GET /tree already exposes every field this feature needs
```

**Structure Decision**: Single-project VS Code extension layout, matching
feature 009 (`definitionProvider.ts`) which is the closest sibling: one new
file holding the provider plus its launch command, registered from
`extension.ts` inside the existing `if (workspaceFolder)` block so it shares
the same "only with a workspace" gating as the definition provider. Two
private helpers in `definitionProvider.ts` become exports instead of being
copied (constitution's smallest-change rule).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

None — the Constitution Check found no violations.
