# Bug Fix: pylint does not run in the main repo's CI

- **Slug**: ci-pylint
- **Fixed**: 2026-11-01
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Added a `server-lint` job to `.github/workflows/ci.yml` that mirrors the server submodule's lint job, and fixed the two over-long lines in the server tests so the new job starts green.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `.github/workflows/ci.yml` | modified | New `server-lint` job: checkout with submodules, Python 3.12 + pip cache, `pip install -e "./server[dev]"`, `pylint src/doorstop_server tests tools` with `working-directory: server` |
| `server/tests/test_tree_cache.py` | modified | Line 53 split: `settings = Settings(...)` local, as in `tests/conftest.py` |
| `server/tests/test_tree_reload.py` | modified | Line 59 split the same way |

## Tests Added or Updated

- None. The CI job is the check (as the assessment says).

## Local Verification

- `python -m pylint src/doorstop_server tests tools` (in `server/`, pylint 4.1.3, Python 3.14) → 10.00/10 except `tests/test_health.py:10 mixed-line-endings`. That one is a local checkout artifact only: `git ls-files --eol` shows `i/lf w/mixed`, `git diff` shows no change, and the committed blob has no CR. With that message disabled → 10.00/10. A Linux CI checkout gets the LF blob.
- `python -m pytest` (in `server/`) → 266 passed, 2 warnings. No changes left in `testdata/`.
- `.github/workflows/ci.yml` parsed with `yaml.safe_load`. Five jobs, `server-lint` has the expected structure.

## Deviations from Assessment

- Open question (also lint `doc/speckit-demo/build.py` and `specs/000-summary/*.py`): took the **Preferred** scope. Only `server/` is linted for now.
- Nothing committed. The server test changes are in the submodule working tree only. The submodule commit and the parent pointer bump are still to do.

## Follow-ups

- Commit the two test files in `server/`, then bump the submodule pointer in this repo.
- Decide whether the Python files outside `server/` need a lint job (constitution Principle V).
