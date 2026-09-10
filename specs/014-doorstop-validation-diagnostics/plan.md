# Implementation Plan: Doorstop Validation Problems In-Item

**Branch**: `014-doorstop-validation-diagnostics` | **Date**: 2026-09-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/014-doorstop-validation-diagnostics/spec.md`

## Summary

Surface Doorstop's own validation output as VS Code diagnostics anchored to the
exact field that caused each problem: warnings as yellow squiggles, errors as
errors, and one problem fanned out onto every item it concerns.

Two pieces:

1. **Server** — a new read-only `GET /validate` endpoint that runs Doorstop's own
   `Document.get_issues()` over every document, attributes each issue to the
   item(s) it belongs to, and returns it as a structured record
   (`severity`, `check`, `message`, `uids`, `relatedUid`, `field`).
2. **Extension** — a new `src/problemsProvider.ts` owning one
   `DiagnosticCollection`, which turns each record into a `vscode.Diagnostic` by
   resolving `field` + `relatedUid` to a text range in the item's file (paths and
   item formats come from the existing `GET /tree`).

**The single most important finding of this planning run**: calling Doorstop's
validation with its shipped defaults **rewrites the requirement files**. Verified
empirically against a copy of `testdata/regression` — a plain
`document.get_issues()` pass modified **7 of 9 item files**, stamping `reviewed:`
on every unreviewed item and stamping link entries, *and it silently "fixed" the
suspect link on `REQ-007` instead of reporting it*. `settings.REFORMAT`,
`REVIEW_NEW_ITEMS` and `STAMP_NEW_LINKS` all default to `True` in Doorstop 3.2
([settings.py:31-46](../../.venv/Lib/site-packages/doorstop/settings.py)). The
endpoint therefore **must** run under a read-only settings scope; with the four
settings disabled the same run changed zero files and reported the suspect link
correctly. Full evidence in [research.md §1](research.md).

**Second finding, affecting spec scope**: of the fifteen checks the spec lists,
**eleven exist in Doorstop 3.2 and map cleanly**, **three do not exist at all**
(self-link, link cycle, and a separate child-link-inactive check), and one
(parent link to an inactive item) is reported under a different message than
expected but *does* arrive at ERROR severity, satisfying the spec's intent. The
three missing checks cannot be added without re-implementing Doorstop validation
in our own code, which Constitution Principle II forbids. This plan reports what
Doorstop reports and keeps the anchor mapping in place so the checks route
correctly if a future Doorstop version emits them. Evidence and the complete
empirical message catalogue are in [research.md §2](research.md); the decision is
recorded in [Complexity Tracking](#complexity-tracking) below.

## Technical Context

**Language/Version**: Python 3.11 (server — one new router, one new schema group); TypeScript 5.x (extension host — one new provider file)

**Primary Dependencies**: Doorstop 3.2 (`Document.get_issues()`, `doorstop.settings`, `DoorstopError`/`DoorstopWarning`/`DoorstopInfo`); FastAPI; VS Code Extension API (`languages.createDiagnosticCollection`, `workspace.onDidSaveTextDocument`). **No new npm or pip package.**

**Storage**: Doorstop requirement files on disk, read only. This feature writes nothing — enforced by the read-only settings scope, not merely by convention (see Constitution Check, Principle I).

**Testing**: `npm run check-types` + `npm run lint`; new `server/tests/test_validation.py` driving the real FastAPI app against real temporary Doorstop projects (no Doorstop mocking, per Principle V); extension coverage in `src/test/regressionFixture.test.ts`, whose fixture already contains three of the checks (`EMPTY` → "no items", `REQ-009` → "linked to unknown item", `REQ-007` → "suspect link").

**Target Platform**: VS Code desktop extension (cross-platform; verified on Windows this session)

**Project Type**: Single VS Code extension + local Python server (existing repo layout); extension host only, no webview

**Performance Goals**: SC-005 requires a resolved problem to disappear within 3s for ≤500 requirements. Validation is inherently whole-tree (cycles, cross-document links and duplicate levels cannot be judged from one file), so the refresh is one `GET /validate` + one `GET /tree`, debounced at 300 ms, with file reads cached per refresh pass.

**Constraints**: Read-only (FR-017) — non-negotiable and empirically load-bearing, see Summary. No client-side re-implementation of Doorstop validation (Principles I–II): the extension receives *classified* records and only resolves them to text ranges. Failure of the fetch must clear the collection and tell the user rather than leave stale problems on screen (FR-014, Principle III).

**Scale/Scope**: One new server router + schemas, one new extension provider, one new command, one new test module. `testdata/regression` (10 items, 3 documents) is the working scale; the design holds to the low thousands.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Result |
| --- | --- | --- |
| I. Server Is the Single Source of Truth | Validation runs **inside the server** via Doorstop's own `Document.get_issues()`. The extension never validates, never parses `.doorstop.yml`, and never decides whether something is a problem — it receives classified records and resolves them to editor ranges, the same range-finding technique already accepted in [definitionProvider.ts:58-71](../../src/definitionProvider.ts#L58-L71) and `deriveProvider`. Item→file paths and item formats come from `GET /tree`, not from client-side globbing. The read-only settings scope also *protects* the single-writer discipline: without it, a read endpoint would mutate the repository behind the lock's back. | PASS |
| II. No Reinvention of Doorstop Functionality | Every issue is produced by Doorstop's own validators. This is also why the three checks Doorstop 3.2 does not implement (self-link, cycle, child-link-inactive) are **not** hand-rolled here — doing so is precisely the reinvention this principle forbids. The one hand-written piece is a message→`check` classification table; it is an adapter over Doorstop's *output strings*, required because Doorstop yields bare `Exception` objects carrying only a message and no structured type or item reference. Justified in Complexity Tracking. | PASS (with one justified adapter) |
| III. All Features Must Include Error Handling | Designed in from the start: fetch failure → collection cleared + explicit message (FR-014, US5 scenario 4); a `check` the table does not recognise → still reported at Doorstop's own severity, anchored to the item's first line (FR-011, SC-007); a `field` whose line is absent from the file → same fallback (FR-010); an item UID with no known path → reported against its document's config file rather than dropped; server-side, any unexpected exception keeps the existing structured `{"error": {...}}` shape via `register_exception_handlers`. | PASS |
| IV. No External Dependencies Without Justification | Zero new dependencies, npm or pip. | PASS |
| V. Typed, Linted, and Tested Before It Ships | New TypeScript sits under the existing `check-types`/`lint` gates. The server change touches validation and error-response shape, so it is covered by a new `server/tests/test_validation.py` exercising the real app against real temporary Doorstop projects — including an explicit **"validation does not modify any file"** test (hash every item file before and after `GET /validate`), which is the regression test for the defect found in research. No Doorstop mocking. | PASS |

*Post-Phase 1 re-check*: [data-model.md](data-model.md) and
[contracts/validation-api.md](contracts/validation-api.md) confirm the design adds
one endpoint, no new dependency, and no write path. The two points that touched
Principles I–II — message classification, and the three unimplementable checks —
are resolved in research.md §3 and §2 respectively and recorded in Complexity
Tracking. Constitution Check result is unchanged: all PASS.

## Project Structure

### Documentation (this feature)

```text
specs/014-doorstop-validation-diagnostics/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── validation-api.md     # Phase 1 output
├── checklists/
│   └── requirements.md       # From /speckit-specify
└── tasks.md             # Phase 2 output (/speckit-tasks — not created by this command)
```

### Source Code (repository root)

Existing single-extension + local-server layout; no new top-level directory.

```text
server/src/doorstop_server/
├── routers/
│   └── validation.py         # NEW — GET /validate
├── validation_rules.py       # NEW — read-only settings scope + message→check table
├── schemas.py                # CHANGED — ValidationIssue, ValidationResponse
└── app.py                    # CHANGED — include_router(validation.router)

server/tests/
└── test_validation.py        # NEW — real-project coverage, incl. the no-write test

src/
├── problemsProvider.ts       # NEW — DiagnosticCollection, anchoring, refresh triggers
├── doorstopTypes.ts          # CHANGED — ValidationIssue / ValidationResponse types
├── extension.ts              # CHANGED — register provider (guarded by workspaceFolder)
├── doorstopServer.ts         # unchanged — request() / DoorstopApiError reused
└── test/
    └── regressionFixture.test.ts   # CHANGED — problems appear on the fixture's 3 known issues

package.json                  # CHANGED — one command: "Doorstop: Re-check Problems"
```

**Structure Decision**: The feature splits along the existing seam — all Doorstop
knowledge in `server/`, all VS Code knowledge in `src/`. The new server module
`validation_rules.py` is deliberately separate from the router so the settings
scope and the message table are unit-testable without HTTP, and so the one piece
with a Doorstop-version coupling lives in a single named file.

## Complexity Tracking

> Two design points deviate from the simplest reading and are justified here.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| A hand-written message→`check` classification table in `validation_rules.py` (string matching on Doorstop's own message templates) | Doorstop 3.2 yields issues as bare `DoorstopError`/`DoorstopWarning`/`DoorstopInfo` objects carrying **only a message string** — no check id, no item reference, no field ([item_validator.py:43-113](../../.venv/Lib/site-packages/doorstop/core/validators/item_validator.py)). FR-006/FR-007/FR-008 require anchoring each problem to a specific field, which is impossible without identifying the check. Some adapter is unavoidable. | Reading the issue's type alone gives severity but not the field, so anchoring would collapse to "first line of the item" and FR-007/FR-008 would be unmet. Re-deriving each condition ourselves is exactly the reinvention Principle II forbids and would drift from Doorstop's real output. Placing the table in the extension instead was rejected under Principle I: message parsing is Doorstop knowledge and belongs server-side, in one place. Unknown messages degrade to `check: "unknown"` rather than failing. |
| Three spec'd checks (self-link, link cycle, child-link-inactive) are **not implemented** | They do not exist in Doorstop 3.2's validation. `check_for_cycle` runs only at link-creation time from `link_items()` ([tree.py:288-329](../../.venv/Lib/site-packages/doorstop/core/tree.py)); a self-link is rejected at creation ("link would be self reference") but never re-checked; and `linked to inactive item` is unreachable because `tree.find_item()` skips inactive items, so an inactive parent surfaces as the ERROR `linked to unknown item`. All three confirmed empirically — see [research.md §2](research.md). | Implementing them in our server or extension would duplicate Doorstop validation logic in a second place, which Principle II prohibits outright and which caused the very view/state divergence Principle I exists to prevent. The anchor mappings for all three are retained in the contract so they route correctly if Doorstop adds them. **This is a scope reduction against the spec and needs the user's acknowledgement** — see the Completion Report. |
