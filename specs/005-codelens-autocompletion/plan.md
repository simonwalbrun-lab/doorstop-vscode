# Implementation Plan: Editor Integration — Derive CodeLens & Link Autocompletion

**Branch**: `N/A (retroactive documentation)` | **Date**: 2026-10-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-codelens-autocompletion/spec.md`

## Summary

Retroactive plan describing the existing implementation. A `+ Derive Requirement` CodeLens (and tree context-menu entry) runs one command, `doorstop.deriveRequirement`: pick a target document from the server's `/tree` hierarchy, `POST` a new item, `POST` a link back, open the file. A completion provider offers `UID - title` suggestions (from the shared `/tree`-backed index) only inside a `links:` block, ranking recently viewed requirements first. The remaining work is test coverage and Principle VIII trace comments, not new code.

Current-state notes (spec drift, spec not edited): the Review/Suspect CodeLenses once next to the derive lens were retired by spec 017; the derive lens is unaffected. Candidate targets are deliberately wider than FR-003's "valid children": every document at the source's depth or below, each labelled with its kinship (child, grandchild, sibling, nephew, cousin, related).

## Technical Context

**Language/Version**: TypeScript on VS Code API `^1.75.0`; no Python server change (uses existing `GET /tree`, `POST /documents/{prefix}/items`, `POST /items/{uid}/links`).

**Primary Dependencies**: VS Code API only (`registerCodeLensProvider`, `registerCompletionItemProvider`); no new dependency.

**Storage**: N/A. Recently viewed UIDs are an in-memory module list (`recentlyViewedUids`) fed by `recordViewedRequirement` on active-editor change (`src/extension.ts`).

**Testing**: `vscode-test` mocha in `src/test/`, real server against `testdata/regression` (Constitution V/VI). Existing: `extension.test.ts` (kinship unit tests), `regressionFixture.test.ts` (`getDeriveTargets`, link completion), `reviewLensScan.test.ts` (derive lens present).

**Target Platform**: VS Code desktop (Windows/macOS/Linux).

**Project Type**: VS Code extension + local Python server (extension side only here).

**Performance Goals**: Lens scan and completion are wrapped in `measure()` (spec 023); no network call in `provideCodeLenses`.

**Constraints**: Hierarchy and item discovery come from the server (`/tree`), never client-parsed (Principles I, II).

**Scale/Scope**: `src/deriveProvider.ts`, `src/completionProvider.ts`, `src/doorstopIndex.ts` (shared), wiring in `src/extension.ts` (lines ~222, ~436, ~496), `package.json` (command + `view/item/context` entry).

## Constitution Check

| Principle | Assessment |
| --- | --- |
| I. Server Is Single Source of Truth | Pass. Targets, item list and mutations all go through the server. |
| II. No Reinvention | Pass. Only kinship labelling (UX policy) is client-side, over server-reported edges. |
| III. Error Handling | Pass. Server-load failure, unknown source document, no targets, and create/link failure each show a message. |
| IV. No External Dependencies | Pass. |
| V. Typed, Linted, Tested | Pass for existing code; open gaps below. |
| VI. CI-Runnable Test | Pass in part (FR-001, FR-003 covered). |
| VIII. FR-level traceability (v1.4.0) | **Gap.** No existing test carries a `Spec 005 FR-NNN` comment; FR-002, FR-004, FR-005, FR-006 (partly), FR-007, FR-008 lack a direct test. Tracked as open tasks. |

No unjustified violations; the gap is closed by tasks.md. Post-design re-check: unchanged.

## Project Structure

```text
specs/005-codelens-autocompletion/
├── plan.md, research.md, data-model.md, quickstart.md
└── contracts/derive-and-completion.md
src/deriveProvider.ts      # CodeLens + doorstop.deriveRequirement + buildDeriveTargets/getDeriveTargets
src/completionProvider.ts  # links: block completion + recently-viewed ranking
src/doorstopIndex.ts       # shared /tree-backed index (getItemTitle, loadDoorstopIndex)
src/test/{extension,regressionFixture,reviewLensScan}.test.ts
```

**Structure Decision**: single extension project; no new source files, only tests.

## FR to Implementation to Test Matrix

| FR | Implementation | Existing test | Status |
| --- | --- | --- | --- |
| 001 | `deriveProvider.ts` `provideCodeLenses` (`derived:` regex) | `reviewLensScan.test.ts` "Derive Requirement lens is unaffected..." (REQ-010.yml); marker file gets none | covered, needs trace comment |
| 002 | one command for lens arg or `RequirementTreeItem` (`resolveDeriveContext`); `package.json` menu | none | **test missing** |
| 003 | `buildDeriveTargets` / `getDeriveTargets` | `extension.test.ts` kinship suite; `regressionFixture.test.ts` Derive targets | covered, needs trace comment |
| 004 | `POST .../links` after add | none | **test missing** |
| 005 | `showTextDocument(addResult.path)` | none | **test missing** |
| 006 | `isInLinksBlock` + `getReplacementRange` | inside-block only (untitled yaml) | **partial: outside block and markdown frontmatter missing** |
| 007 | label `UID - title` via `getItemTitle` | existing test splits label on ` - ` for the UID only | **title assertion missing** |
| 008 | `recentlyViewedUids`, `sortText` | none | **test missing** |
