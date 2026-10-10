# Research: Document Utilities

All decisions record how the shipped code works; nothing is unresolved.

## Decision 1: Reorder runs through Doorstop's own `Document.reorder`
- Auto: `reorder(manual=False)`. Manual: `reorder(manual=True, automatic=False)` against the `index.yml` Doorstop generates.
- Rationale: Principle II. Alternative rejected: own renumbering (duplicates Doorstop).

## Decision 2: Manual reorder is an index lifecycle over three calls
- `POST .../reorder/index` generates (idempotent, never overwrites an existing index), `DELETE` discards, `POST .../reorder {mode: manual}` applies; no index gives 409 `NO_REORDER_INDEX` (FR-004).
- The extension offers Apply / Keep editing / Discard when an index exists (FR-003) and saves a dirty index editor before applying.

## Decision 3: Import format comes from the source file suffix; export/publish format from the request
- Alternative rejected: explicit format field for import (redundant).

## Decision 4: Report the path actually written (FR-008)
- `_resolve_written_path` checks the reported path, then `<dir>/documents/<name>` (Doorstop HTML nesting), else falls back to the reported path.

## Decision 5: Test layers
- Server behaviour via `pytest server/tests`; command wiring via `src/test/regressionFixture.test.ts`. New tests extend these files; trace tag format `Spec 004 FR-NNN`.
