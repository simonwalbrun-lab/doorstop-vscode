# Implementation Plan: YAML Header Folding

**Branch**: `034-yaml-header-folding` | **Date**: 2026-10-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/034-yaml-header-folding/spec.md`

## Summary

A folding range provider offers one fold for the YAML header of Markdown
Doorstop items. VS Code's own "fold imports on open" does the automatic folding:
the range gets kind `Imports` when the switch is on, and the extension sets
`[markdown] editor.foldingImportsByDefault: true` as a configuration default.
That covers normal and peek editors and the "no re-fold after unfold" rule
without tracking editors ([research.md](research.md) R1). A boolean setting and
two title-bar commands with `config.` when clauses form the button (R4).
Extension-only; no server change.

## Technical Context

**Language/Version**: TypeScript (VS Code extension)

**Primary Dependencies**: VS Code API (engine ^1.75); no new dependencies

**Storage**: VS Code setting `doorstop.foldYamlHeaderOnOpen`

**Testing**: `src/test` (vscode-test), new label `headerFolding`, no workspace, no server

**Target Platform**: VS Code desktop, Windows/Linux CI

**Project Type**: VS Code extension + local Python server (server untouched)

**Performance Goals**: header scan is a line loop over the file start; one `existsSync` walk-up per call

**Constraints**: must work without the server (FR-009)

**Scale/Scope**: 1 new source file (~40 lines), 3 files touched, 1 test file

## Constitution Check

| Principle | Status |
|-----------|--------|
| I. Server single source of truth | Deviation, justified below: `.doorstop.yml` presence check on the client |
| II. No reinvention of Doorstop | Pass: folding is an editor feature Doorstop does not have |
| III. Error handling | Pass: no header / malformed header returns no range; fs errors in the walk-up count as "not an item" |
| IV. No new dependencies | Pass |
| V. Typed, linted, tested | Planned |
| VI/VIII. CI test per FR with trace comments | Planned: FR-001..005, 007..009 in `headerFolding.test.ts`; FR-006 by the setting-default assertion plus the manual peek check in [quickstart.md](quickstart.md) |
| VII. Long-running visible | Pass: nothing takes longer than a second |

Re-check after design: no further violations.

## Project Structure

### Documentation (this feature)

```text
specs/034-yaml-header-folding/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/contributions.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── headerFolding.ts        # NEW: provider, isDoorstopItem walk-up, two commands
├── reviewLensProvider.ts   # export getMetadataLineRange
└── extension.ts            # registerHeaderFolding(context), outside the workspaceFolder block
package.json                # setting, configurationDefaults, 2 commands, 2 view/title entries
.vscode-test.mjs            # label headerFolding
src/test/headerFolding.test.ts
```

**Structure Decision**: one new module next to the other providers; no server change.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle I: the extension decides "is a Doorstop item" by looking for `.doorstop.yml` in an ancestor folder | FR-009: folding must work without the server; FR-007: non-Doorstop Markdown must not be folded | Server item list: unavailable without the server. Reading the prefix from `.doorstop.yml`: parses Doorstop config on the client, a bigger violation. The check only reads file existence and only decides whether a fold is offered |

FR-006 (peek editor) has no direct automated test: the extension test API cannot
reach embedded peek editors. The test asserts the mechanism (Imports kind plus the
effective `editor.foldingImportsByDefault` for Markdown), which is the same code
path VS Code uses in peek editors.
