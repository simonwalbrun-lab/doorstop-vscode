# Bug Verification: server walks node_modules on every request

- **Slug**: node-modules-scan-per-request
- **Tested**: 2026-11-04
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

`_EXCLUDED_DIRS` now contains `node_modules` and `__pycache__`. The new regression test passes, and fails when the line is reverted in a scratch copy. `fingerprint()` on this repo root walks 1121 files instead of 1932, about 320 ms instead of about 490 ms. No regressions.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Fix present | grep `_EXCLUDED_DIRS =` in `server/src/doorstop_server/doorstop_tree.py` | pass | Contains node_modules and __pycache__ |
| New test | `python -m pytest tests/test_document_skip.py::test_dependency_and_cache_folders_are_not_walked` (server/) | pass | 1 passed |
| Negative control | Copied src/tests to the scratchpad, reverted the line there, ran `tests/test_document_skip.py` | pass (test fails as expected) | 1 failed, 8 passed; the assertion lists node_modules/pkg/config.yml and __pycache__ files. Repo source untouched. |
| Reproduction (timing) | one-off script, `fingerprint(".")` on repo root, old vs new set, 6 runs each, twice | pass | See below |
| Server suite | `python -m pytest` (server/) | pass | 269 passed |
| Lint | `python -m pylint src/doorstop_server tests tools` | pass | 10.00/10; only the known CRLF message on tests/test_health.py |
| Extension build | `npm run compile` | pass | check-types, eslint and esbuild OK |
| Extension integration | `npx vscode-test --label regressionFixture` | pass | 85 passing; no flakes, no leftovers |

## Output Excerpts

Timing of `fingerprint('.')` in ms, repo root with populated node_modules. The first run of a set is a cold cache.
- Old set: 1932 files; 1354 (cold), 493, 487, 490, 490, 492; second pass 486, 490, 488, 480, 489, 485.
- New set: 1121 files; 319, 322, 323, 320, 314, 314; second pass 318, 322, 321, 316, 320, 315.
- That is about 490 ms down to about 320 ms warm, roughly 35% less. About 810 files are no longer walked.

The fix.md figures (1788 to 995 files, 454 to 267 ms) were single runs. The numbers differ because the repo has changed since, but the trend is the same.

## Residual Risks

- The timing script ran without `-I`, because it needs `sys.path` to point at `server/src`. It only imports the local package and stdlib.
- Impact depends on the size of node_modules. Here the saving is about 170 ms per request. `find_skipped_documents()` was covered by the unit test, not timed.
- A document placed under node_modules or __pycache__ no longer triggers a tree refresh. This is unrealistic, and it was noted in the fix.
- `tests/test_tree_reload.py::test_fingerprint_matches_a_plain_walk` hardcodes the old set. It still passes, but it is not in sync with the new set.
- The submodule change needs a server release for PyPI users.

## Recommendation

Close the bug. It is verified: the test fails without the fix and passes with it, the measured walk is smaller and faster, and the server and extension suites are green.
