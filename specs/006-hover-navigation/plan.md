# Implementation Plan: Hover Previews & Navigation

**Branch**: N/A (retroactive documentation) | **Date**: 2026-10-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/006-hover-navigation/spec.md`

## Summary

Retroactive plan describing the EXISTING implementation. A VS Code
`HoverProvider` shows an item preview (header, level, text, optional upstream
links, ref) when hovering a requirement UID, and a reverse-link list when
hovering a `derived:` line. UID links in the popup are `command:vscode.open`
links; opening the file changes the active editor, which the tree view's
`onDidChangeActiveTextEditor` sync reveals. Remaining work: close Principle VIII
gaps (FR-002, FR-003 and FR-005 lack a dedicated test; all FRs lack trace
comments).

Note on spec 011: its FR-007/008 removed the *diagram canvas* hover preview
only. The editor hover provider described here is unaffected and still present.

## Technical Context

**Language/Version**: TypeScript 5.x (extension host); Python server unchanged

**Primary Dependencies**: VS Code API (`registerHoverProvider`, `MarkdownString`); shared `DoorstopIndex` fed by `GET /tree`

**Storage**: N/A

**Testing**: `@vscode/test-electron` integration tests against the regression fixture (`src/test/regressionFixture.test.ts`, `src/test/extension.test.ts`), run in CI

**Target Platform**: VS Code desktop

**Project Type**: Single VS Code extension

**Performance Goals**: Index is cached; tree request only after a hoverable position is detected; wrapped in `measure('hover')`

**Constraints**: No client-side parsing of requirement files (Principle I); no new dependencies

**Scale/Scope**: One provider file (~120 lines) plus tree-sync in `src/extension.ts`

## Existing Implementation Map

| FR | Code | Existing test |
|----|------|---------------|
| FR-001 | `src/hoverProvider.ts` `renderItemPreview`, `UID_REGEX` word-range match | `regressionFixture.test.ts` "Hover on a link UID previews the server's text..." |
| FR-002 | `renderItemPreview(..., showUpstreamLinks)`; suppressed when `LINK_ENTRY_LINE_REGEX`/`LINKS_FIELD_LINE_REGEX` matches | none |
| FR-003 | `makeClickableLink` -> `command:vscode.open?<server path>`; `isTrusted = true` | partly: same test asserts link points at server-reported path; click-to-open not exercised |
| FR-004 | `DERIVED_LINE_REGEX`, `renderReverseLinks` via `index.getLinkers` | "Hover on a derived: line lists the items that link to this one" |
| FR-005 | `src/extension.ts` `syncActiveRequirement` on `onDidChangeActiveTextEditor`, `treeView.reveal` | `extension.test.ts` auto-reveal toggle test covers only the guard, not the actual reveal/selection |

Edge cases in code: unknown UID -> `renderItemPreview` returns `undefined` (no
hover); empty text -> "*No requirement text defined.*"; UID-shaped token in
prose still matches `UID_REGEX` but only yields a hover if the server index
knows it; long text is rendered untruncated (VS Code hover scrolls).

## Constitution Check (v1.4.0)

| Principle | Result |
|-----------|--------|
| I Server is source of truth | PASS - all data from `loadDoorstopIndex` (`GET /tree`); provider never reads files |
| II No reinvention | PASS |
| III Error handling | PASS - missing index/item returns no hover instead of throwing |
| IV No new dependencies | PASS |
| V/VI Typed, linted, tested | PASS for FR-001/004; GAP for FR-002/003/005 (tasks below) |
| VII Long-running visibility | N/A - hover is sub-second, editor-native |
| VIII Per-FR trace comments | GAP - no `Spec 006 FR-NNN` comments exist yet (specs predating v1.4.0 not retrofitted; this plan opts in) |

Complexity Tracking: none.

## Project Structure

```text
specs/006-hover-navigation/  spec.md plan.md research.md data-model.md quickstart.md tasks.md
src/hoverProvider.ts         hover provider (existing)
src/extension.ts             tree sync on active editor change (existing)
src/test/regressionFixture.test.ts, src/test/extension.test.ts   tests
```

No `contracts/`: the feature exposes only VS Code API surfaces, no external interface.
