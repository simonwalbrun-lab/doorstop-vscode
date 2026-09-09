# Implementation Plan: Treeview Auto-Reveal Toggle

**Branch**: `010-treeview-auto-reveal-toggle` | **Date**: 2026-09-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-treeview-auto-reveal-toggle/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Add a title-bar toggle to the Doorstop Explorer tree that turns the existing
automatic "reveal the active requirement" behavior on or off. That behavior
is implemented twice today, in two separate functions that both call
`treeView.reveal(...)`: `syncActiveRequirement` (wired to
`vscode.window.onDidChangeActiveTextEditor`, which fires on both normal tab
switching and hover-popup link clicks, since those open a file via
`command:vscode.open`) and the `doorstop.activateRequirement` command handler
(invoked explicitly by the diagram panel on node click and after "Add Linked
Item..."). The fix is a guard at the top of each, backed by one persisted
boolean preference and a two-command icon-swap pattern for the title-bar
button — no new dependency, no server interaction.

## Technical Context

**Language/Version**: TypeScript (project-wide `typescript` ^6.0.3), VS Code Extension API ^1.75.0

**Primary Dependencies**: None new — `vscode.commands.executeCommand('setContext', ...)`, `vscode.ExtensionContext.globalState` (VS Code's built-in per-user `Memento`), and `package.json` `contributes.commands` / `contributes.menus['view/title']`, all already used elsewhere in this codebase for similar things

**Storage**: One boolean in `context.globalState` (key `doorstop.autoRevealEnabled`) — per-user, not per-workspace, matching the "personal editing habit" framing in spec.md's Assumptions; no file/server storage involved

**Testing**: `src/test/extension.test.ts` via `@vscode/test-cli` / `@vscode/test-electron` (same harness used by spec 008's backup-recovery fix). Recommended (not constitutionally required for extension-side code): one test asserting `treeView.reveal` is *not* called when the preference is off, for both gated code paths.

**Target Platform**: VS Code desktop extension host (Windows/macOS/Linux) — unchanged

**Project Type**: VS Code extension (single project) — no web/mobile split applies

**Performance Goals**: N/A — a single boolean check added to two already-existing functions; no measurable perf impact

**Constraints**: MUST default to "on" so existing users see zero behavior change until they touch the new button (spec.md Key Entities); MUST work even before the server/tree has finished loading (FR-007 — this is pure local UI state, no server round-trip); the button's icon MUST update within the same click that toggles it (no perceptible delay, since it's a synchronous `setContext` call)

**Scale/Scope**: Two gated call sites in `src/extension.ts` (`syncActiveRequirement`, the `doorstop.activateRequirement` handler), two new command registrations + a `setContext` call, one `globalState` key, and four `package.json` contribution entries (2 commands, 2 `view/title` menu entries with complementary `when` clauses). No server/Python changes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Assessment |
| --- | --- | --- |
| I. Server Is the Single Source of Truth | No | Pure client-side UI preference; no server/API interaction (FR-007 requires exactly this). |
| II. No Reinvention of Doorstop Functionality | No | No Doorstop domain logic (documents/items/links) is touched. |
| III. All Features Must Include Error Handling | Weakly | Low-risk change (a boolean guard clause; `Memento` reads/writes and `setContext` don't realistically throw), but the guard MUST still fail safe — if the preference can't be read for any reason, default to "on" (today's behavior) rather than silently breaking reveal. Designed below. |
| IV. No External Dependencies Without Justification | No new dependency | Uses only VS Code APIs already depended on; nothing to justify. |
| V. Typed, Linted, and Tested Before It Ships | **Yes** | `npm run compile` (check-types + lint) gates this like any TypeScript change. Server pytest clause doesn't apply. An extension-host test is recommended, tracked as a task rather than a hard gate (same stance as spec 008's plan). |

**Result**: PASS. No violations to justify — Complexity Tracking table below is empty.

**Post-design re-check** (after Phase 0/1, see `research.md` and `data-model.md`):
still PASS — the chosen design (read `globalState` with a safe "on" default,
mirror it into a `setContext` key for the menu `when` clauses) introduces no
dependency, server call, or Doorstop-domain logic that would change the
table above.

## Project Structure

### Documentation (this feature)

```text
specs/010-treeview-auto-reveal-toggle/
├── spec.md               # Feature spec (already written)
├── plan.md               # This file
├── research.md           # Phase 0 output
├── data-model.md          # Phase 1 output
├── quickstart.md          # Phase 1 output
└── contracts/
    └── commands.md         # Phase 1 output — the new command/context-key/globalState contract
```

### Source Code (repository root)

```text
src/
├── extension.ts          # syncActiveRequirement + doorstop.activateRequirement handler (both gated);
│                          # new doorstop.toggleAutoReveal / doorstop.enableAutoReveal commands registered here
└── test/
    └── extension.test.ts  # existing placeholder; recommended location for a new reveal-suppressed test

package.json               # contributes.commands (+2), contributes.menus['view/title'] (+2)
server/                     # untouched — no server-side change in this feature
```

**Structure Decision**: Single-project VS Code extension layout (matches the
rest of the repo and spec 008's plan). Everything lives in the two files
already responsible for the reveal behavior and its registration
(`src/extension.ts`) plus the manifest (`package.json`); no new modules,
services, or directories are needed.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

None — the Constitution Check above found no violations, so this table is
intentionally empty.
