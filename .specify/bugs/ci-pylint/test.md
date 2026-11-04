# Bug Verification: pylint does not run in the main repo's CI

- **Slug**: ci-pylint
- **Tested**: 2026-11-04
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

`server-lint` job exists in `.github/workflows/ci.yml` and is correct (submodules checkout, py3.12, `pip install -e ./server[dev]`, pylint with `working-directory: server`). Local pylint is 10.00/10 apart from a CRLF checkout artifact; pytest passes. The fix is committed (parent 1ed8ee7, submodule pointer 4793d4e, clean).

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | pylint in `server/`: the two long lines no longer flagged | pass | CI run itself not exercised (no GitHub run) |
| Workflow validity | `yaml.safe_load` of ci.yml; inspected job | pass | 5 jobs; `server-lint` correct, working-directory finds pyproject.toml |
| Lint | `python -m pylint src/doorstop_server tests tools` (server/) | pass w/ caveat | 10.00/10; only C0327 on tests/test_health.py:10, rc=16 locally |
| CRLF claim | `git ls-files --eol tests/test_health.py`; CR count in HEAD blob | pass | `i/lf w/mixed`; blob has 0 CRs, so Linux CI will not see it |
| Regression suite | `python -m pytest -q` (server/) | pass | 269 passed, 2 warnings |

## Output Excerpts

- pylint: `rated at 10.00/10`, only `C0327 mixed-line-endings` at tests\test_health.py:10
- pytest: `269 passed, 2 warnings in 105.04s`
- Submodule and testdata/ clean after run.

## Residual Risks

- Real GitHub Actions run not performed; Python 3.12 vs local 3.14 pylint differences possible.
- Python files outside `server/` (doc/speckit-demo/build.py, specs/000-summary/*.py) remain unlinted (open question, out of scope).

## Recommendation

Close the bug; confirm on first CI run.
