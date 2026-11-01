# Bug Assessment: server walks node_modules (and the whole project) on every request

- **Slug**: node-modules-scan-per-request
- **Created**: 2026-11-01
- **Source**: pasted text
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

> node_modules scan on every request

## Symptom

Every request that needs the tree first runs `fingerprint()`, a full `os.scandir` walk of the project root that stats every `.yml/.yaml/.md` file. `GET /tree` also runs `find_skipped_documents()`, a second full `os.walk`, whenever its response cache misses. Both skip only `.git`, `.tox`, `.venv`, and `venv`, so `node_modules` is walked, along with folders like `__pycache__`. `node_modules` typically holds thousands of `README.md`/`*.yml` files. In this repository it has 286 top-level packages. Request latency grows with the size of folders that cannot hold Doorstop documents. Expected behavior: those folders are not walked.

## Reproduction

1. Open a Doorstop project with a populated `node_modules` (this repo works).
2. Enable timing and compare the `load` phase per request with `node_modules` present and with it renamed away. [NEEDS CLARIFICATION: measured numbers. The extra work is confirmed from code, not timed.]

## Suspected Code Paths

- `server/src/doorstop_server/doorstop_tree.py:14`: `_EXCLUDED_DIRS = {".git", ".tox", ".venv", "venv"}`.
- `server/src/doorstop_server/doorstop_tree.py:34-64` (`fingerprint`): called on every request from `server/src/doorstop_server/deps.py:31` (`_shared_tree`).
- `server/src/doorstop_server/doorstop_tree.py:131-144` (`find_skipped_documents`): called from `routers/tree.py:89` on a cache miss and from `errors.py:37` on every "no item with UID" error.

## Root Cause Hypothesis

The exclusion list was written for a Python project and misses JavaScript and cache folders. Confidence: high for the extra work. Medium for user-visible impact, which depends on the size of `node_modules`.

## Proposed Remediation

**Preferred**: Add `node_modules` and `__pycache__` to `_EXCLUDED_DIRS`. It is one line, and both walks use the set.

**Alternatives**:

- Also skip every dot-directory. That covers `.mypy_cache`, `.pytest_cache`, and `.idea` too, but it needs a check that no project keeps documents in a dot-folder.
- Fingerprint only the document folders known from the last build, plus a cheap scan for new `.doorstop.yml` files. This is a larger change (spec 032 territory).

**Files likely to change**:

- `server/src/doorstop_server/doorstop_tree.py` (submodule)
- `server/tests/test_tree_cache.py` or `server/tests/test_document_skip.py`

**Tests to add or update**:

- A project fixture with `node_modules/pkg/` containing a `.yml` and a `.doorstop.skip` document: `fingerprint()` does not include its files, and `find_skipped_documents()` does not report it.

## Risks & Considerations

- `doorstop.build` does its own discovery. If Doorstop would load a document under `node_modules`, the fingerprint would stop seeing its changes. That is unrealistic, but note it in CHANGELOG.
- This is a submodule change, so it needs a server release for PyPI users.

## Open Questions

- None.
