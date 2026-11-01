# Implementation Plan: Batch Edit Items

**Branch**: `036-batch-edit-items` | **Date**: 2026-11-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/036-batch-edit-items/spec.md`

## Summary

A filter cell may carry an `edit:` section next to `filters:`. When it does,
the result table gets checkboxes and an "Apply to selected" button. The
server parses and validates the edit (at cell run and at apply) and applies
it through Doorstop in one new endpoint, `POST /batch`, which also has a dry
run for the confirmation counts. The extension adds the unsaved-files check,
the confirmation, progress, the summary and the refresh; autocomplete is
extended to the `edit:` section.

## Technical Context

**Language/Version**: TypeScript 6 on the VS Code Extension API; Python ≥ 3.9
(server)

**Primary Dependencies**: VS Code API, FastAPI, Doorstop 3.2, PyYAML. No new
packages.

**Storage**: Doorstop item files; the filter notebook file (cell text only)

**Testing**: pytest `server/tests/test_batch.py` (new), `test_filter.py`;
vscode-test label `filterNotebook` (`src/test/filterNotebook.test.ts`)

**Target Platform**: VS Code desktop, local server

**Project Type**: VS Code extension + local Python server

**Performance Goals**: 500 items in < 10 s (SC-002); suggestions < 200 ms on
1,000 items (SC-006)

**Constraints**: no partial item files; nothing written before confirmation;
mutation not cancellable once started

**Scale/Scope**: 1 new server router (~200 lines), changes in 2 server and
4 extension files; 1 new pytest file, 1 extended test file

## Constitution Check

| Principle | Status | How |
| --- | --- | --- |
| I. Server is source of truth | ✅ | Edit parsing, validation and all writes happen in the server (`POST /filter`, `POST /batch`); the extension only shows UI. One request per batch, under the existing lock. No cancellation points (R11). |
| II. No reinvention | ✅ | `Item.set`/property setters, `Document.add_item(name=)`, `remove_item`, `Tree.link_items`. Only "remove field" uses private `_data` (Doorstop has no public unset), marked `ponytail:` (R4). |
| III. Error handling | ✅ | Batch-level errors are typed (`INVALID_EDIT`, `PROTECTED_FIELD`, `MIXED_DOCUMENTS`, …) and write nothing; per-item failures are reported and the tree cache is reset (R6). |
| IV. No unjustified dependencies | ✅ | None added. |
| V. Typed, linted, tested | ✅ | `npm run compile`, pylint; server change touches CRUD → pytest against a real temp Doorstop project. |
| VI. CI-runnable test | ✅ | `test_batch.py` uses the existing `conftest.py` temp-project fixtures; extension tests use the DOM stub and fake server already in `filterNotebook.test.ts`. |
| VII. Long-running visible | ✅ | `withDelayedProgress` around dry run and real run; time in modals not counted. |
| VIII. FR → test trace | ✅ | See Test coverage; every test carries `# Spec 036 FR-…` / `// Spec 036 FR-…`. |

Post-design re-check: no violations; Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/036-batch-edit-items/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/batch-edit.md
└── tasks.md            # /speckit-tasks
```

### Source Code

```text
server/src/doorstop_server/
├── routers/filters.py     # compile_filter accepts `edit`; editable flag; list entries in vocabulary
├── routers/batch.py       # NEW: compile_edit(), plan_item(), generate children, POST /batch
├── schemas.py             # BatchRequest, BatchItemResult, BatchResponse; FilterResponse.editable
└── app.py                 # include batch router
server/tests/
└── test_batch.py          # NEW

src/
├── filterNotebook.ts      # payload query/editable; 'apply' message → applyBatch(); HELP text; onChanged param
├── filterCompletion.ts    # `edit:` key, operation snippets, field/value/document suggestions
├── doorstopTypes.ts       # BatchResponse types; FilterResponse.editable
├── extension.ts           # pass onChanged to registerFilterNotebook
├── webview/filterResults/renderer.js  # checkbox column, tick-all, "Apply to selected"
└── test/filterNotebook.test.ts        # new suites for 036
```

**Structure Decision**: flat modules like every feature. The batch logic is
its own router so `filters.py` stays a read-only evaluator; `compile_edit`
lives in `batch.py` and `filters.py` imports it. The apply flow lives in
`filterNotebook.ts` next to the other renderer messages.

## Design notes

- `plan_item(data, operations) -> (changes, outcomes)` is pure: it reads a
  dict of current values and returns new values and per-operation outcomes.
  Dry run and real run share it; only the real run calls `item.set` /
  `_data.pop` and `save()` (R3, R4).
- `compile_edit` raises before any item is touched, so an invalid edit never
  writes (FR-003). `POST /batch` re-runs it on the stored `query`.
- `generateChildren` resolves source and target documents first (all errors
  are 409s with nothing written), then processes parents in request order.
- `applyBatch(server, query, uids, onChanged)` in `filterNotebook.ts` is
  exported so the flow can be tested with a fake server and stubbed modals.

## Test coverage

| Test (file → case) | FRs |
| --- | --- |
| test_batch → set on items with/without field; untouched items' files byte-equal | 004, 011, 002 |
| test_batch → add / remove with present and absent fields | 005, 006 |
| test_batch → appendEntry (new list, existing, duplicate, not a list); removeEntry (all occurrences, missing, not a list) | 007, 008 |
| test_batch → several operations in order on one item, one save | 003 |
| test_batch → invalid edit / generate combined with field ops / bad value → 400, nothing written | 003 |
| test_batch → forbidden and standard-non-set fields → 422; `set level/text/ref/active` work | 012 |
| test_batch → generate children: exact numbers with child's digits, link, single child, named child, none, several unnamed, not-a-child, mixed documents | 009 |
| test_batch → generate `UID exists` skip vs `force` overwrite; `blank` next numbers in request order | 018, 019 |
| test_batch → dry run reports same statuses and writes nothing (incl. overwrite count) | 010 |
| test_batch → `set` keeps YAML types (int, bool, float) | 004 |
| test_batch → 500 items in under 10 s | SC-002 |
| test_batch → missing UID skipped; a failing item (read-only file) → failed, others written, next request rebuilds | 013 |
| test_filter → `edit:` accepted next to filters/order, `editable` flag; vocabulary includes list entries | 001, 003, 017 |
| filterNotebook → renderer: checkboxes only when editable, all ticked, tick-all, apply posts ticked UIDs in order with query | 001, 002 |
| filterNotebook → applyBatch: nothing selected; unsaved markdown/YAML documents (file or Document View) block with no request; notebook cells, untitled and other languages do not | 020, 002 |
| filterNotebook → applyBatch: confirm text with counts and overwrite count; cancel → no real run | 010 |
| filterNotebook → applyBatch: summary counts and details document; onChanged called | 014, 016 |
| filterNotebook → applyBatch wraps both requests in delayed progress | 015 |
| filterNotebook → completion: `edit:` key, operation snippets, field names (no forbidden), values, `generateChildren` keys and prefixes | 017 |

## Complexity Tracking

None.
