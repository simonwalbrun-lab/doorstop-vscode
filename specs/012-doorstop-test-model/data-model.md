# Data Model: Doorstop Regression Test Model

**Feature**: `012-doorstop-test-model` | **Date**: 2026-09-10

This feature's "data" is the fixture itself — an ordinary Doorstop project —
plus the checklist document that indexes it. Nothing here is a new runtime
type in the extension or server; it documents the shape the fixture and
checklist must have so both the manual checklist (User Stories 1–2) and the
automated suite (User Story 3) read from the same, agreed structure.

## Fixture Project (`testdata/regression/`)

| Field | Value | Purpose |
| --- | --- | --- |
| Root document prefix | `REQ` | Root/parent document (FR-001) |
| Child document prefixes | `ARCH` (populated), `EMPTY` (zero items) | Multi-level hierarchy + empty-document coverage (FR-001, FR-005) |
| Root marker | `testdata/regression/.doorstop.yml` | Makes the folder server-loadable (FR-001) |
| Child markers | `testdata/regression/children/ARCH/.doorstop.yml`, `testdata/regression/children/EMPTY/.doorstop.yml`, each with `parent: REQ` | Hierarchy relationship |
| Diagram fixture | `testdata/regression/diagram.doorstop.json` | Persisted diagram referencing a mix of fixture items (FR-007) |
| Checklist | `testdata/regression/CHECKLIST.md` | Human-readable regression checklist (FR-008) |

## Item (`REQ-NNN.yml` / `ARCH-NNN.yml`)

Standard Doorstop item fields (`header`, `text`, `links`, `derived`,
`active`, `normative`, `reviewed`, `cleared`) are used as-is — Doorstop
computes/validates them, this feature only chooses *values* that exercise
each state FR-002–FR-006 requires. No new field is introduced.

| Item | Role | States it covers |
| --- | --- | --- |
| `REQ-001` | Root item, no links out | Plain item baseline; upstream target for others |
| `REQ-002` | `text` is a single short line | Minimal-text case (FR-006) |
| `REQ-003` | `text` spans several paragraphs | Long-text case (FR-006) |
| `REQ-004` | `header` set | Heading-display coverage (FR-002) |
| `REQ-005` | Not yet reviewed (`reviewed: false`) | Pending-review case (FR-002) |
| `REQ-006` | `reviewed: true` | Already-reviewed case (FR-002) |
| `REQ-007` | Links to `REQ-001`, link's `suspect` recomputes stale after `REQ-001` is edited post-link | Suspect-link case (FR-003) |
| `REQ-008` | `reviewed: true`, its suspect link has been run through `doorstop clear` once (`cleared: true` on the link) | Cleared-suspect case (FR-002) |
| `REQ-009` | `links: [REQ-999]` where `REQ-999` does not exist anywhere in the fixture | Dangling-link case (FR-004) |
| `ARCH-001` | `derived: true`, `links: [REQ-001]` | Derived-link case (FR-002); child-document population |

`EMPTY` document intentionally contains zero item files beyond its
`.doorstop.yml` marker (FR-005).

## Diagram Fixture (`diagram.doorstop.json`)

Follows the extension's existing diagram-file schema (unchanged by this
feature — see the `007-diagram-core` feature's own data model for the
authoritative shape). Body nodes reference a mix of root and child fixture
items from the baseline set (`REQ-001`, `REQ-004`, `ARCH-001`) with at least
one persisted edge between them, so diagram creation/interaction/rendering
can be exercised without first building a diagram from scratch (FR-007).
Deliberately built only from User Story 1's baseline items (not US2's
suspect/dangling items) so the diagram fixture has no dependency on US2
being implemented first.

## Regression Checklist (`CHECKLIST.md`)

A Markdown document, not a new data type — but its structure is a contract
both this feature and future contributors rely on:

| Section | Content |
| --- | --- |
| Prerequisites | What must be true before starting (Doorstop/Python available, workspace opened at `testdata/regression`) — addresses the "server fails to start" edge case |
| One row/step per shipped feature area | Feature area name → which fixture document/item to use → the action to take → the expected observable outcome (FR-008) |
| Automated coverage note | Which steps are also covered by the automated suite (`src/test/regressionFixture.test.ts`), so a maintainer knows what's already continuously checked in CI vs. what only the manual pass verifies (FR-012, keeping the two lists in sync per spec Assumptions) |

## Automated Integration Test Suite (`src/test/regressionFixture.test.ts`)

Not a data entity, but its relationship to the fixture is part of this
model: the suite is the sole automated consumer of `testdata/regression`. It
opens that folder as its `@vscode/test-cli` workspace, starts a real
`DoorstopServer` against it (see research.md §2–3), and asserts against the
same shipped-feature behaviors the checklist's rows describe — one Mocha
`test()` per feature area that has automated coverage, cross-referenced by
name so a checklist row and a test title can be matched by a reader.

## State / Lifecycle Notes

- The fixture is **static and checked in** (research.md §4) — it is not
  regenerated per test run. Any test (manual or automated) that mutates a
  fixture file (e.g., adding an item) MUST restore it before finishing, so
  the working tree is clean after either kind of run (spec FR-009, SC-005).
- `REQ-007`'s suspect state is not something Doorstop stores as a static
  flag on the link — it recomputes from content hashes. The fixture's
  `REQ-007`/`REQ-001` pair is chosen so that state recomputes as suspect
  given the two files' checked-in content; it is not something a test needs
  to "set up" at runtime.
