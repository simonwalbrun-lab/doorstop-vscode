# Implementation Plan: Review & Suspect-Link CodeLenses

**Branch**: `013-review-suspect-codelenses` | **Date**: 2026-09-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/013-review-suspect-codelenses/spec.md`

## Summary

Add three inline CodeLens actions to Doorstop requirement files, alongside the
existing "+ Derive Requirement" lens:

1. **"Do Review"** on the `reviewed:` field → `POST /review` with
   `{scope: "item", target: <uid>}`.
2. **"Clear All Suspicions"** directly above the `links:` field, shown only when
   the item actually has link entries → `POST /clear` with
   `{scope: "item", target: <uid>}`.
3. **"Clear the Suspicion"** on each individual link entry → `POST /clear` with
   `{scope: "item", target: <uid>, parents: [<parentUid>]}`.

Technical approach: **no new server endpoints and no server code changes.** The
existing `POST /review` and `POST /clear` routes already cover all three
actions, including the per-link case — `ReviewClearRequest.parents` maps onto
Doorstop's own `Item.clear(parents=[...])`, which stamps only the links whose
UID appears in the filter list (verified against
`.venv/Lib/site-packages/doorstop/core/item.py:879-884`). The whole feature is a
new extension-host file, `src/reviewLensProvider.ts`, registering one
`CodeLensProvider` plus three commands. See [research.md](research.md) for the
six design decisions this rests on.

**Additionally in scope (user instruction on this planning run): remediate the
existing derive CodeLens.** The audit requested — "check the current 'Derive
Requirement' CodeLens if it sticks to using the doorstop server" — found that it
**does not**, and this plan carries the fix. `deriveProvider.ts` performs its
mutations through the server correctly, but computes *which documents exist* and
*which are valid derive targets* entirely client-side: it globs the workspace
for `.doorstop.yml` markers, parses them with `js-yaml`, and re-implements
parent/child depth resolution in TypeScript
([deriveProvider.ts:89-148](../../src/deriveProvider.ts#L89-L148)). That is
document discovery, config parsing and hierarchy computation duplicated outside
the server — squarely what Constitution Principles I and II forbid, and the
`GET /tree` response already carries every field needed to replace it
(`prefix`, `markerPath`, `parentPrefix`). Full finding and remediation design in
[research.md §5](research.md). `definitionProvider.ts` is already the correct
in-repo pattern to follow and even documents it in a comment.

## Technical Context

**Language/Version**: TypeScript 5.x (extension host, `src/reviewLensProvider.ts`, `src/deriveProvider.ts`); Python 3.11 (server — **no changes**, existing routes reused)

**Primary Dependencies**: VS Code Extension API (`languages.registerCodeLensProvider`, `commands.registerCommand`); the existing FastAPI server's `POST /review`, `POST /clear`, `GET /tree` (read-only reuse). No new npm or pip package.

**Storage**: Doorstop requirement files on disk, written exclusively by the server via Doorstop's own `@auto_save` path. The extension never writes requirement text.

**Testing**: `npm run check-types` + `npm run lint` (Constitution Principle V gate); extension-host integration tests in `src/test/regressionFixture.test.ts`, which drives the **real** Doorstop server against `testdata/regression` — this feature is automatable there, unlike the webview-only diagram features; `server/tests/test_review.py` gains one positive test for the `parents` filter (see Constitution Check).

**Target Platform**: VS Code desktop extension (cross-platform; developed and verified on Windows this session)

**Project Type**: Single VS Code extension (existing repo layout) — extension host only; no webview and no frontend/backend split for this feature

**Performance Goals**: `provideCodeLenses` must stay a pure text scan of the open document with **zero network calls** (research.md §2), so opening a requirement file is not gated on server availability or latency — this is what satisfies SC-005. Cost is O(lines) over one file.

**Constraints**: No new runtime dependencies (Principle IV). No client-side re-implementation of Doorstop review/suspect/link semantics (Principles I–II) — the extension locates *text ranges* and reads the UID token off a line to anchor a lens; every decision about what a link means, whether it is suspect, and what clearing it does stays in Doorstop via the server. Failure paths (server down, unknown parent UID, dirty editor) are designed in from the start, not retrofitted (Principle III).

**Scale/Scope**: One requirement file at a time; real items carry a handful of links (the `testdata/regression` fixture's densest item has one). Three new commands, one new provider file, one remediated provider file.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Result |
| --- | --- | --- |
| I. Server Is the Single Source of Truth | All three mutations go through `POST /review` / `POST /clear`; the extension never edits requirement YAML. The lens *anchoring* reads the open document's text to find the `reviewed:` line, the `links:` line, and each link entry's line — this is editor range-finding, the same technique already accepted in `deriveProvider` (`/^\s*derived\s*:/`) and `definitionProvider` (`findLineMatching`), not a second implementation of Doorstop's data model. The parent UID read off a link line is treated as *user input to be validated server-side*, never as authoritative: `POST /clear` resolves it via `tree.find_item()` and rejects unknown UIDs with 400. **This plan also removes an existing violation** rather than adding one — see the derive remediation in research.md §5. | PASS |
| II. No Reinvention of Doorstop Functionality | Review and suspect-clearing are Doorstop capabilities (`Item.review()`, `Item.clear(parents=...)`) invoked through the server unchanged. No stamp comparison, no suspect computation, no link resolution is written in TypeScript. The remediation deletes the hand-rolled `.doorstop.yml` parsing and parent-depth walk from `deriveProvider.ts` in favour of server-computed `GET /tree` data. | PASS |
| III. All Features Must Include Error Handling | Every failure path is specified before implementation: server unreachable → explicit error naming the failure (FR-009); unknown/dangling parent UID → the server's structured 400 `DOORSTOP_ERROR` surfaced verbatim (US3 scenario 3); dirty editor → modal confirm, never a silent overwrite of unsaved edits (FR-010, research.md §3); tree fetch failure during the remediated derive flow → explicit message instead of a silently empty document list (research.md §5). | PASS |
| IV. No External Dependencies Without Justification | Zero new dependencies. The remediation *removes* a `js-yaml` usage from `deriveProvider.ts`. | PASS |
| V. Typed, Linted, and Tested Before It Ships | All new code is TypeScript under the existing `check-types` / `lint` gates. No server source changes, but this feature makes the previously-untested `parents` filter a load-bearing dependency, so `server/tests/test_review.py` gains a positive selective-clear test (currently only the unknown-parent 400 case is covered). Extension behaviour is covered in `src/test/regressionFixture.test.ts` against the real server and fixture — no mocking of Doorstop. | PASS |

No violations to justify; **Complexity Tracking is not needed** for this feature.

*Post-Phase 1 re-check*: [data-model.md](data-model.md) and
[contracts/codelens-actions.md](contracts/codelens-actions.md) confirm the
design introduces no server schema change, no new endpoint, and no new
dependency. The one design point that touched Principle I — reading link UIDs
from document text — is resolved in research.md §2 with server-side validation
as the authority. Constitution Check result is unchanged: all PASS.

## Project Structure

### Documentation (this feature)

```text
specs/013-review-suspect-codelenses/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── codelens-actions.md   # Phase 1 output
├── checklists/
│   └── requirements.md       # From /speckit-specify
└── tasks.md             # Phase 2 output (/speckit-tasks — not created by this command)
```

### Source Code (repository root)

This feature touches only the extension host of the existing single-extension
layout. No new top-level directory is introduced.

```text
src/
├── reviewLensProvider.ts     # NEW — the CodeLens provider + 3 commands
├── deriveProvider.ts         # CHANGED — remediation: source documents from GET /tree
├── extension.ts              # CHANGED — register the new provider (guarded by workspaceFolder, next to registerDeriveProvider)
├── doorstopServer.ts         # unchanged — request()/DoorstopApiError reused
├── doorstopTypes.ts          # unchanged — TreeResponse reused by the remediation
└── test/
    └── regressionFixture.test.ts   # CHANGED — integration coverage for the 3 actions

server/
├── src/doorstop_server/      # UNCHANGED — no new endpoint, no schema change
└── tests/test_review.py      # CHANGED — add positive test for the `parents` filter

testdata/regression/
└── REQ-010.yml (or similar)  # NEW fixture — an item with two links, so "clear one, leave the other" is testable

package.json                  # CHANGED — contributes.commands entries for the 3 new commands
```

**Structure Decision**: A **new file** `src/reviewLensProvider.ts` rather than
extending `deriveProvider.ts`. Two reasons: FR-012 (coexistence with the derive
lens) is satisfied for free because VS Code merges lenses from all registered
providers for a document, so the derive lens needs no modification to keep
working; and it keeps the derive remediation (§5) a reviewable change isolated
from the new feature. The three commands are registered in the same file as the
provider, matching the established `registerDeriveProvider` /
`registerDefinitionProvider` shape.

## Phase 0 — Research

See [research.md](research.md). Six decisions, all resolved — no NEEDS
CLARIFICATION markers remain:

1. Reuse `POST /review` + `POST /clear`; no new endpoint (per-link clear is
   already expressible via `parents`).
2. Anchor lenses by text scan, keep the server authoritative for meaning.
3. Dirty-editor policy: modal confirm, then save, then act.
4. Post-action refresh: rely on VS Code's auto-reload of clean documents plus
   the existing tree refresh callback.
5. **Derive CodeLens audit + remediation** (the user's additional instruction).
6. Item identity and file-surface detection: filename basename, `.yml` and `.md`
   as today.

## Phase 1 — Design & Contracts

- [data-model.md](data-model.md) — the four entities from the spec expressed as
  what the provider actually computes per document: `RequirementLensContext`,
  `LinkEntryAnchor`, and the two request shapes.
- [contracts/codelens-actions.md](contracts/codelens-actions.md) — the command
  IDs, their argument payloads, and the exact server request/response contract
  each one produces, including error codes.
- [quickstart.md](quickstart.md) — how to validate all three actions plus the
  remediated derive flow against `testdata/regression`.
