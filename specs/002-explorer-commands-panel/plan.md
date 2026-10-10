# Implementation Plan: Requirements Explorer & Commands Panel

**Branch**: `N/A (retroactive documentation)` | **Date**: 2026-10-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-explorer-commands-panel/spec.md`

**Note**: This feature is already implemented. This plan documents the existing
design (read from `src/` and `server/`) and the remaining work: closing the
Constitution v1.4.0 Principle VIII gap (one traced, CI-run test per FR).

## Summary

A sidebar `doorstop.treeView` shows each Doorstop document as a root with its
items nested by outline depth (`DoorstopTreeProvider`, `src/requirementTree.ts`,
data from server `GET /tree`). Clicking a node runs `vscode.open` on its file;
`doorstop.refresh` reloads; `syncActiveRequirement` (`src/extension.ts`) reveals
the active editor's node. A second view `doorstop.commandsView`
(`DoorstopCommandsProvider`, `src/commandsProvider.ts`) lists action rows that
each carry a `command`. `doorstop.createDoc` (`src/doorstopCommands.ts`) asks
for prefix, folder, then a parent via `chooseParentPrefix` and POSTs
`/documents`.

**Spec drift**: the spec's last Assumption says FR-009..FR-011 are not
implemented yet. They are: `chooseParentPrefix` and the `createDoc` flow exist
and have tests. The assumption is stale (spec.md untouched here; fix it
separately).

## Technical Context

**Language/Version**: TypeScript (strict) extension; Python 3 FastAPI server

**Primary Dependencies**: VS Code Extension API, Doorstop (via server); no new dependencies

**Storage**: N/A (Doorstop files owned by the server)

**Testing**: vscode-test/mocha (`src/test/*.test.ts`, labelled configs in `.vscode-test.mjs`), pytest (`server/tests`); both run in CI (`.github/workflows/ci.yml`)

**Target Platform**: VS Code desktop

**Project Type**: VS Code extension + local server

**Performance Goals**: N/A

**Constraints**: Server is source of truth (Principle I); tree load is wrapped in `measure('tree.load')`

**Scale/Scope**: Tree must handle any document/item count (SC-001)

## Constitution Check (v1.4.0)

| Principle | Status |
|---|---|
| I Server is source of truth | PASS - tree built from `/tree`; parent set via `parentPrefix` to server |
| II No reinvention | PASS - `levelDepth` mirrors Doorstop `Item.depth`; creation delegated to Doorstop |
| III Error handling | PASS - unreachable server shows one error toast (`serverErrorShown`); Doorstop refusal surfaced by `run()` |
| IV No new deps | PASS |
| V Typed/linted | PASS (existing) |
| VI CI-runnable test | PASS - suites in CI |
| VII Long-running visible | PASS - `run()` and Refresh use `withDelayedProgress` (spec 026) |
| VIII FR -> traced test | **GAP** - 0 of 11 FRs carry a `Spec 002 FR-NNN` trace comment; FR-001..008 mostly lack provider-level tests. See coverage map. |

Gate result: no unjustified violations; the VIII gap is tracked as open tasks.

## FR coverage map (existing state)

| FR | Implementation | Existing test | Gap |
|---|---|---|---|
| 001 roots | `fetchItems` roots | `regressionFixture` "Explorer tree loads all three fixture documents" (raw `/tree`, not provider) | provider-level test + trace |
| 002 nesting | `levelDepth`, `attachHierarchy`, `sortItems` | server `test_tree_items_are_sorted_by_level` (order only) | nesting test + trace |
| 003 open on click | `RequirementTreeItem.command = vscode.open` | none | new test |
| 004 refresh | `refresh()`, `doorstop.refresh` | none direct | new test |
| 005 reveal | `syncActiveRequirement`, `setActiveResource` | `extension.test` auto-reveal gate (spec 010) | positive lookup test + trace |
| 006 commands panel | `DoorstopCommandsProvider` | `filterNotebook.test` (022 FR-002), `extension.test` New Diagram | full-action test + trace |
| 007 create doc | `doorstop.createDoc` | `regressionFixture` "creates under the chosen parent"; server `test_create_document_returns_prefix_and_path` | trace |
| 008 server error | `fetchItems` catch | none | new test |
| 009 parent pick | `chooseParentPrefix` | `regressionFixture` "distinguishes None from a dismissed pick" + "under chosen parent" | trace |
| 010 None -> root | `parentPrefix === null` -> no `parentPrefix` sent | same test (null result) and "second root refusal"; server root creation test | trace; add assertion the request omits `parentPrefix` |
| 011 dismiss cancels | `undefined` -> return | "creates nothing when the parent pick is dismissed" | trace |

## Project Structure

### Documentation

```text
specs/002-explorer-commands-panel/
  spec.md  plan.md  research.md  data-model.md  quickstart.md  tasks.md
```

No `contracts/`: the feature adds no new external interface; it uses existing
server routes `GET /tree` and `POST /documents` (covered by `server/tests`).

### Source (existing)

```text
src/requirementTree.ts      # tree provider, levelDepth, item/root nodes
src/commandsProvider.ts     # commands panel rows
src/doorstopCommands.ts     # doorstop.createDoc, doorstop.refresh, chooseParentPrefix
src/extension.ts            # createTreeView x2, syncActiveRequirement
src/test/{extension,filterNotebook,regressionFixture}.test.ts
server/tests/{test_tree,test_documents}.py
```

## Remaining work

1. Add trace comments `Spec 002 FR-NNN` to the existing covering tests.
2. Add tests for FR-001..006, 008 (provider-level, stub `DoorstopServer`, no
   fixture) in a new `src/test/explorerTree.test.ts` registered as its own
   label in `.vscode-test.mjs`; FR-010 request-omits-parent assertion in
   `regressionFixture.test.ts`.
3. Re-run full CI suites.

## Complexity Tracking

None.
