# Implementation Plan: Go to Definition & Usage Navigation

**Branch**: `009-goto-definition-navigation` | **Date**: 2026-09-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-goto-definition-navigation/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Add native "Go to Definition" (F12) and "Find All References" (Shift+F12)
support for requirement UID tokens in `.yml`/`.md` requirement files. A UID
under `links:` (or inline) resolves to a single Location at the target
item's header line — its `header:` field for `.yml` items, its first `#`
heading for `.md` items (US1, US3). The `derived:` field key resolves to a list of
Locations — one per item that links back to the current requirement — so F12
there opens VS Code's built-in multi-result Peek/Locations view (US2). Both
directions of lookup are sourced from the server's existing `GET /tree`
response (already fetched by `DoorstopTreeProvider`) rather than re-parsing
YAML client-side, so no server changes are needed. Because both commands
return standard `vscode.Location` results, VS Code's native "Go Back"
navigation stack (Alt+Left) works for free — no custom back-navigation logic
is written (US3).

## Technical Context

**Language/Version**: TypeScript (project-wide `typescript` ^6.0.3), VS Code Extension API ^1.75.0

**Primary Dependencies**: None new — uses `vscode.languages.registerDefinitionProvider` /
`registerReferenceProvider`, the existing `DoorstopServer` client
(`src/doorstopServer.ts`, already used by `DoorstopTreeProvider` and
`deriveProvider.ts`), and `vscode.workspace.fs` for the line-locating text
scan described in `research.md` Decision 2

**Storage**: N/A — no new persisted state; every lookup is resolved fresh
per F12/Shift+F12 invocation from the server's in-memory Doorstop tree

**Testing**: `src/test/extension.test.ts` via `@vscode/test-cli` /
`@vscode/test-electron` — currently only a placeholder sample test, no real
extension-host tests exist for any navigation feature yet (hover, CodeLens
derive included). Recommended, not constitutionally required — Principle V's
mandatory-test clause is scoped to server/Python changes, and none are made
here. No server changes at all, so the existing `server/tests` pytest suite
(33 tests) is unaffected and needs no updates.

**Target Platform**: VS Code desktop extension host (Windows/macOS/Linux) —
same platform the existing hover/CodeLens features already target

**Project Type**: VS Code extension (single project) — no web/mobile split applies

**Performance Goals**: N/A beyond existing precedent — one `GET /tree`
round-trip to the local server per F12/Shift+F12 press (same cost class as
`deriveProvider`'s per-action server requests), plus reading only the
specific referencing files needed to locate a link's line, not the whole
workspace

**Constraints**: MUST NOT re-implement Doorstop YAML parsing or link
discovery client-side (Constitution Principle II) — UID→path and
who-links-to-whom data MUST come from the server's `GET /tree`; MUST NOT add
a new server endpoint (`GET /tree` already carries every field needed); MUST
leave `hoverProvider.ts`'s existing local-parsing implementation untouched
(smallest change — not a required refactor of already-shipped code); MUST
return real `vscode.Location` results (not `command:vscode.open` links) so
native back-navigation applies; MUST degrade to "no results" rather than an
error dialog when the server is unreachable or a UID/derived-line lookup
finds nothing (Constitution Principle III)

**Scale/Scope**: One new source file (`src/definitionProvider.ts`) plus a
small registration call from `src/extension.ts`; no changes to
`hoverProvider.ts`, `deriveProvider.ts`, `requirementTree.ts`, or any
server file

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Assessment |
| --- | --- | --- |
| I. Server Is the Single Source of Truth | **Yes** | UID→path resolution and reverse-link discovery are sourced from the server's `GET /tree` response, not re-parsed client-side. This is a stricter reading than the existing `hoverProvider.ts` precedent (which glob-finds files and parses YAML locally) — see `research.md` Decision 1 for why this feature deliberately does not copy that pattern. |
| II. No Reinvention of Doorstop Functionality | **Yes** | No Doorstop domain logic (link discovery, item resolution) is reimplemented — it's read directly from the tree Doorstop itself already computed server-side. The only new client-side logic is a plain-text scan to find which *line* of an already-known referencing file contains a UID, which is editor-position bookkeeping, not Doorstop semantics — see `research.md` Decision 2. |
| III. All Features Must Include Error Handling | **Yes** | A `GET /tree` failure, an unresolved UID, or a `derived:` line with zero usages MUST all resolve to "no results" (`undefined`/`[]`) with a logged warning, never a thrown error or a modal dialog on every keypress. Designed in `research.md` Decision 3 and `data-model.md`. |
| IV. No External Dependencies Without Justification | No new dependency | Uses only the VS Code API and the extension's existing `DoorstopServer` client; nothing to justify. |
| V. Typed, Linted, and Tested Before It Ships | **Yes** | `npm run compile` (check-types + lint) gates this change like any other TypeScript change. The server pytest MUST-test clause doesn't apply (no server change); an extension-host test is recommended (`research.md` Decision 3), tracked as a task rather than a hard gate. |

**Result**: PASS. No violations to justify — Complexity Tracking table below is empty.

**Post-design re-check** (after Phase 0/1, see `research.md` and `data-model.md`):
still PASS, unchanged — the chosen design (resolve everything from `GET
/tree`, scan only already-identified referencing files for line position,
return native `Location`s) introduces no new dependency, no server change,
and no reimplementation of Doorstop parsing; it's the same shape the gate
above anticipated.

## Project Structure

### Documentation (this feature)

```text
specs/009-goto-definition-navigation/
├── spec.md               # Feature spec
├── plan.md               # This file
├── research.md           # Phase 0 output
├── data-model.md         # Phase 1 output
└── quickstart.md         # Phase 1 output
# No contracts/: this feature adds no new HTTP endpoint and no new webview
# message — it consumes the already-existing GET /tree endpoint exactly as
# DoorstopTreeProvider does today, and exposes only standard VS Code
# language-feature commands (Go to Definition / Find All References), not a
# new interface of its own.
```

### Source Code (repository root)

```text
src/
├── extension.ts            # Registers the new provider (mirrors the existing registerDeriveProvider call)
├── definitionProvider.ts   # NEW: DefinitionProvider + ReferenceProvider, GET /tree-backed uid/link resolution, line-locating scan
├── doorstopServer.ts        # Existing DoorstopServer.request client — reused as-is for GET /tree
├── doorstopTypes.ts         # Existing TreeResponse/ItemNode/LinkInfo types — reused as-is
├── hoverProvider.ts         # Existing — untouched (see Constraints above)
├── requirementTree.ts       # Existing DoorstopTreeProvider — untouched; not a shared dependency, both read GET /tree independently
└── test/
    └── extension.test.ts    # Currently a placeholder; recommended location for a new definition/reference test

server/                      # Untouched — GET /tree already exposes every field this feature needs
```

**Structure Decision**: Single-project VS Code extension layout (matches the
rest of the repo). One new file, `src/definitionProvider.ts`, holds both
providers and their shared resolution helper; it is registered from
`src/extension.ts` alongside the existing `registerDeriveProvider` call,
gated the same way (only when a `workspaceFolder` is open). No new
directories, no server changes.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

None — the Constitution Check above found no violations, so this table is
intentionally empty.
