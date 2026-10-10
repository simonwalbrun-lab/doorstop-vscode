# Implementation Plan: Traceability Cross-Document Links

**Branch**: `028-traceability-cross-links` | **Date**: 2026-10-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/028-traceability-cross-links/spec.md`

## Summary

Doorstop only looks for an item's children in the documents directly below
it. Links that skip a level or cross branches are therefore dropped from the
target's child links and from `traceability.html`/`.csv`. All of that output
goes through two public Doorstop methods:

- `Item.find_child_items_and_documents`: child links in every publisher, and
  `item.child_items`, which the matrix uses.
- `Tree.get_traceability`: the matrix rows.

A new server module, `doorstop_server/publish.py`, provides one context
manager, `publish_options(matrix, child_links)`, which applies three
overrides for a single publish:

1. **Child lookup, always on.** A tree-wide reverse-link lookup (FR-005).
2. **Matrix:**
   - "complete": a copy of Doorstop's row algorithm with one guard, so a
     document column is never filled twice (FR-001..FR-004, FR-007).
   - "doorstop": Doorstop's own `get_traceability`, run with the original
     child lookup restored (FR-011).
3. **`settings.PUBLISH_CHILD_LINKS`** from the new checkbox (FR-012). This is
   the Doorstop setting that the `--no-child-links` flag sets.

Changes by component:

- **Server endpoints:** both publish endpoints read two new optional request
  fields and run inside the context manager.
- **Extension:** reads the two new settings and sends them with every publish
  request.
- **CI:** `python -m doorstop_server.publish [--traceability doorstop] <doorstop publish args>`
  runs Doorstop's own CLI inside the same context. `--no-child-links` passes
  straight through to Doorstop, so CI produces the same files (FR-009).
- **Templates:** no change.

## Technical Context

**Language/Version**: Python ≥3.9 (server), TypeScript (extension)

**Primary Dependencies**:

- doorstop ≥3.0, verified against 3.2;
- FastAPI;
- VS Code Extension API;
- stdlib `unittest.mock.patch.object` for the scoped overrides.

**Storage**: Doorstop item YAML (read only); two new VS Code settings

**Testing**:

- pytest: `server/tests/test_traceability.py` (new);
- vscode-test: `src/test/regressionFixture.test.ts`, which runs the real
  Publish command against a real server;
- node: `src/test/pdf/exportPdf.test.mjs`.

**Target Platform**: VS Code desktop on Windows/macOS/Linux; CI on Linux (GitHub Actions, GitLab)

**Project Type**: VS Code extension + local Python server

**Performance Goals**: At most one extra linear pass over all items per publish (reverse-link index built once)

**Constraints**:

- Doorstop is not modified (FR-010).
- Hierarchy-only projects produce identical matrices (FR-003).
- "doorstop" mode gives exactly Doorstop's matrix (FR-011).
- No new dependency.

**Scale/Scope**: One new server module (~80 lines), two endpoint call sites, two schema fields, two settings, three request bodies in `doorstopCommands.ts`, plus CI and README changes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
| --------- | ------ | ----- |
| I. Server is source of truth | PASS | All link and matrix logic is in the server. The extension only forwards two setting values. |
| II. No reinvention | PASS (justified) | Doorstop has no tree-wide child lookup. Its publishers, CLI, row algorithm and `PUBLISH_CHILD_LINKS` switch are reused; "doorstop" mode is Doorstop's own code. |
| III. Error handling | PASS | `patch.object` restores every override on any exit. Doorstop errors keep the existing structured path. An invalid `traceability` value is rejected by the schema (422). |
| IV. No new dependencies | PASS | stdlib only. CI installs the server package, which already depends on doorstop. |
| V. Typed/linted/tested | PASS | `npm run compile` gates the TS change. pytest runs against real temporary Doorstop projects with no Doorstop mocks. |
| VI. CI-runnable test | PASS | `server-tests`, `extension-integration-tests` and `pdf-export` jobs. |
| VII. Long-running visible | PASS | No new command; the existing publish progress applies. |
| VIII. FR-traceable tests | PASS | FR-001..FR-012 mapped below; trace comments `# Spec 028 FR-NNN` / `// Spec 028 FR-NNN`. |

**Post-design re-check**: PASS. No violations, so Complexity Tracking is empty.

### Test mapping (Principle VIII)

Tests are in `server/tests/test_traceability.py` unless the row says otherwise.

| FR | Test |
| -- | ---- |
| FR-001, FR-002 | Skip-level link REQ→TST gives the row `(REQ002, None, TST001)` via `POST /publish` HTML. |
| FR-003 | Hierarchy-only project: rows equal Doorstop's unpatched `tree.get_traceability()`. |
| FR-004 | `traceability.csv` rows equal the HTML matrix rows. |
| FR-005 | REQ page (HTML and Markdown) lists TST001 as a child link, with an HTML href to `TST.html#TST001`. Also checked through `/documents/REQ/publish`. |
| FR-006 | TST page lists all three parent UIDs. |
| FR-007 | A cycle (A1↔B1) and a same-document link: publish finishes, with no duplicate rows. |
| FR-008 | Publish with a custom template still has the cross row. `exportPdf.test.mjs` adds a skip-level link and asserts it in the `traceability.pdf` text. |
| FR-009 | `python -m doorstop_server.publish` (subprocess) with both flag combinations gives the same CSV and item pages as the endpoint with the same options. |
| FR-010 | Item files are byte-identical after publish. Doorstop methods and `PUBLISH_CHILD_LINKS` are back to their originals after the context exits, including after an error. |
| FR-011 | Server: `traceability: "doorstop"` gives exactly unpatched Doorstop CSV rows while REQ002 still lists TST001. Extension (`regressionFixture.test.ts`): the default is `complete`, and with workspace setting `doorstop` the combined-run matrix equals Doorstop's. |
| FR-012 | Server: `childLinks: false` removes child links and gives the label "Links:", with the matrix unchanged. Extension: the default is unchecked; checked, the combined-run Markdown output has no "Child links". |

## Project Structure

### Documentation (this feature)

```text
specs/028-traceability-cross-links/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/publish-cli.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
server/src/doorstop_server/
├── publish.py              # NEW: publish_options() context manager + `python -m` entry
├── schemas.py              # PublishRequest: + traceability, + childLinks
└── routers/documents.py    # both publisher.publish(...) calls inside publish_options()
server/tests/
└── test_traceability.py    # NEW: FR-001..FR-012 (server side)
package.json                # + doorstop.publish.traceability, + doorstop.publish.noChildLinks
src/doorstopCommands.ts     # read both settings once, add to all three publish request bodies
src/test/regressionFixture.test.ts  # FR-011/FR-012 extension side
src/test/pdf/exportPdf.test.mjs     # use python -m doorstop_server.publish; skip-level row in PDF
.github/workflows/ci.yml            # pdf-export job: pip install ./server instead of doorstop
README.md                           # settings + CI examples with the new command
CHANGELOG.md                        # entry
```

**Structure Decision**: One new server module and small edits to existing
files. No template change and no new package.

## Complexity Tracking

None.
