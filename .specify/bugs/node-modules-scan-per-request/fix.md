# Bug Fix: server walks node_modules (and the whole project) on every request

- **Slug**: node-modules-scan-per-request
- **Fixed**: 2026-11-01
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Added `node_modules` and `__pycache__` to `_EXCLUDED_DIRS` (Preferred remediation), so neither `fingerprint()` nor `find_skipped_documents()` walks them.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `server/src/doorstop_server/doorstop_tree.py` | modified | Added two entries to `_EXCLUDED_DIRS`. Updated the comment above it, because the set is no longer exactly the list doorstop's builder skips |
| `server/tests/test_document_skip.py` | added test | New regression test |

## Diff Highlights

```python
# The folders doorstop.core.builder.build() skips, plus dependency/cache folders that never hold documents.
_EXCLUDED_DIRS = {".git", ".tox", ".venv", "venv", "node_modules", "__pycache__"}
```

## Tests Added or Updated

- `server/tests/test_document_skip.py::test_dependency_and_cache_folders_are_not_walked`: `node_modules/pkg/` and `__pycache__/` each contain a `.doorstop.yml`, a `.doorstop.skip` and a `.yml` file. The test checks that `fingerprint()` lists none of their files, that `find_skipped_documents()` returns `[]`, and that `GET /tree` shows no `skippedDocuments`. It failed before the fix and passes after it.

## Local Verification

- `python -m pytest` (in `server/`): 269 passed.
- `python -m pylint src/doorstop_server tests tools`: 10.00/10. The only message is the known local CRLF artifact, mixed-line-endings in `tests/test_health.py`.
- Manual timing: `fingerprint('.')` on this repo root, warm cache, one run each:
  - Before: 1788 files in 454 ms
  - After: 995 files in 267 ms

  This resolves the assessment's [NEEDS CLARIFICATION] about measured numbers.

## Deviations from Assessment

- None. The Preferred remediation was taken (non-interactive run). The dot-directory and known-folders alternatives were not applied.
- No CHANGELOG entry was added. `server/` has no changelog of its own, and the run instructions say to add one only if it does.

## Follow-ups

- If a CHANGELOG entry is wanted, add it to the main repo's CHANGELOG. Note that a document placed under `node_modules`/`__pycache__` would no longer trigger a tree refresh. This is unrealistic, because doorstop's own build would still find it.
- The fix needs a server release for PyPI users (submodule change).
- `tests/test_tree_reload.py::test_fingerprint_matches_a_plain_walk` hardcodes the old exclusion set. It still passes because it creates neither folder, so it was left unchanged.
