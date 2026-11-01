# Bug Assessment: pylint does not run in the main repo's CI

- **Slug**: ci-pylint
- **Created**: 2026-11-01
- **Source**: pasted text
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

> add pylint to CI

## Symptom

The constitution (Principle V, `.specify/memory/constitution.md:139-145`) says that pylint must lint `server/` and that lint must run in `.github/workflows/ci.yml`. The main repo's CI never runs pylint. A server change in this repo that breaks lint can merge with CI green. The `server` submodule's own CI (`server/.github/workflows/ci.yml:9-19`) runs `pylint src/doorstop_server tests tools`, but only on pushes to the server repository.

## Reproduction

1. Add a line longer than 120 characters to `server/src/doorstop_server/*.py`.
2. Push a branch of this repo. All four jobs in `.github/workflows/ci.yml` pass.

Pylint is already red today. A local run (pylint 4.1.3, Python 3.14) reports:

- `server/tests/test_tree_cache.py:53` line-too-long (138/120)
- `server/tests/test_tree_reload.py:59` line-too-long (131/120)
- `server/tests/test_health.py:10` mixed-line-endings. This is probably a Windows `autocrlf` checkout artifact and may not appear on Linux CI. [NEEDS CLARIFICATION: confirm on a clean Linux checkout]

## Suspected Code Paths

- `.github/workflows/ci.yml` (`server-tests` job). It already installs `./server[dev]`, which includes `pylint>=3` (`server/pyproject.toml:26`), but it runs only pytest.
- `server/.github/workflows/ci.yml:9-19`. The lint job to mirror.

## Root Cause Hypothesis

The lint job was added to the submodule's workflow but never copied into the parent repo's workflow. Confidence: high.

## Proposed Remediation

**Preferred**: Add a `server-lint` job to `.github/workflows/ci.yml`: checkout with `submodules: true`, setup-python 3.12 with pip cache, `pip install -e "./server[dev]"`, then `pylint src/doorstop_server tests tools` with `working-directory: server`, so pylint finds `pyproject.toml` the way it does in the submodule CI. Fix the two long lines in the server submodule first, or the new job starts red.

**Alternatives**:

- Add a step to the existing `server-tests` job. It reuses the install, but a lint failure then hides whether the tests passed.

**Files likely to change**:

- `.github/workflows/ci.yml`
- `server/tests/test_tree_cache.py`, `server/tests/test_tree_reload.py` (submodule commit + pointer bump)

**Tests to add or update**:

- None. The CI job is the check. Verify with a local pylint run reporting 10.00/10.

## Risks & Considerations

- The fix for the long lines is a commit in the `server` submodule, and the parent repo needs a pointer bump.
- CI uses Python 3.12 and the local run used 3.14. Pylint/astroid results can differ slightly between versions.

## Open Questions

- [NEEDS CLARIFICATION: should the job also lint `doc/speckit-demo/build.py` and `specs/000-summary/*.py`? These are Python files outside `server/`, and the constitution requires a linter for every language in the repo.]
