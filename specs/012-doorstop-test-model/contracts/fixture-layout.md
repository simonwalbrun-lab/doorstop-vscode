# Contract: Regression Fixture Layout

**Feature**: `012-doorstop-test-model` | **Date**: 2026-09-10

This is the contract both the manual regression checklist and the automated
integration suite rely on. Either consumer breaking because the other moved
a file is exactly the drift this feature exists to prevent (spec FR-010,
Assumptions).

## Fixed path

The fixture root is **`testdata/regression/`**, relative to the repository
root. Neither the manual checklist nor the automated suite may hardcode any
other path to it — the automated suite resolves it via
`path.join(__dirname, '..', '..', 'testdata', 'regression')` (or equivalent,
relative to the compiled test file), never a machine-specific absolute path.

## Required contents

| Path | Required | Notes |
| --- | --- | --- |
| `testdata/regression/.doorstop.yml` | Yes | Root document marker, prefix `REQ` |
| `testdata/regression/CHECKLIST.md` | Yes | The regression checklist (see data-model.md) |
| `testdata/regression/REQ-*.yml` | Yes, ≥10 files | Root document items (see data-model.md's Item table) |
| `testdata/regression/children/ARCH/.doorstop.yml` | Yes | Populated child document marker, `parent: REQ` |
| `testdata/regression/children/ARCH/ARCH-*.yml` | Yes, ≥1 file | Child document items |
| `testdata/regression/children/EMPTY/.doorstop.yml` | Yes | Empty child document marker, `parent: REQ`, zero item files alongside it |
| `testdata/regression/children/MD/.doorstop.yml` | Yes | Markdown-format child document marker, `parent: REQ`, `itemformat: markdown` |
| `testdata/regression/children/MD/MD-*.md` | Yes, ≥1 file | Markdown-format items (metadata in YAML frontmatter) |
| `testdata/regression/diagram.doorstop.json` | Yes | Persisted diagram fixture |

## Invariants a consumer may rely on

1. **No dangling reference except the one deliberate case.** Every `links:`
   entry resolves to an existing item UID in the fixture, except `REQ-009`'s
   link to `REQ-999`, which is intentionally absent (FR-004). A checklist
   step or test asserting "link resolves" may assume this for every other
   item.
2. **The fixture is left unchanged by a test/checklist run.** Any consumer
   that mutates a fixture file during its run MUST restore the original
   content before finishing (spec FR-009). A consumer MUST NOT assume a
   previous run's mutation was cleaned up for it — each run restores its own
   changes.
3. **No file outside `testdata/regression/` is required.** Opening exactly
   this folder as a VS Code workspace folder and starting the Doorstop
   server against it (with `python`/`python3` on `PATH`, dependencies
   installed) is sufficient — no additional setup script, network call, or
   external service.
4. **Excluded from the packaged extension.** `testdata/` MUST be present in
   the `.vscodeignore`/packaging exclude list so the fixture does not ship
   inside the published `.vsix`.
