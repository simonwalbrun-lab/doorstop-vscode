# Bug Verification: fixed port 7867 and orphaned server processes

- **Slug**: server-fixed-port-orphan
- **Tested**: 2026-11-04
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

Both halves hold. `--port 0` prints one `DOORSTOP_PORT=<n>` line and serves /health; two servers for two projects ran side by side on different ports. With `--exit-on-stdin-eof`, killing the parent (or closing the pipe) ends the server and worker and frees the port within seconds. Without the flag nothing changes. All suites pass; no defects found.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Ephemeral port | `python -m doorstop_server --project <copy of testdata/regression> --port 0` | pass | one line `DOORSTOP_PORT=59824`, /health 200 |
| Two servers at once | two copies of testdata/regression, `--port 0` each | pass | ports 59824 and 59828, both /health 200 |
| Orphan: parent killed | helper parent holds stdin pipe, spawns server with `--exit-on-stdin-eof`, parent killed | pass | server pid gone and port free after 4.2 s; no python processes left |
| Orphan: pipe closed | `--exit-on-stdin-eof`, `stdin.close()` | pass | exit code 0 in <1 s, port freed |
| No flag unaffected | CLI with inherited stdin, no flag | pass | still alive after 3 s, /health 200 |
| pylint | server/: `python -m pylint src/doorstop_server tests tools` | pass | 10.00/10 (known CRLF message in tests/test_health.py) |
| pytest | server/: `python -m pytest` | pass | 269 passed |
| Compile | `npm run compile` | pass | exit 0 |
| unit | `npx vscode-test --label unit` | pass | 28 passing |
| doorstopServer | `npx vscode-test --label doorstopServer` | pass | 4 passing |
| regressionFixture | `npx vscode-test --label regressionFixture` | pass | 85 passing, first run, no flake, testdata clean |
| Leftover 7867 / DOORSTOP_SERVER_PORT | grep in src, media, doc, server | pass | see below |

## Output Excerpts

- `after parent kill: server alive False port free True secs 4.2`
- `269 passed`; `85 passing (41s)`

## Remaining 7867 / DOORSTOP_SERVER_PORT references

- `DOORSTOP_SERVER_PORT`: none anywhere. src, media: none (no `tests/` dir at repo root).
- `server/src/doorstop_server/cli.py:16`: `--port` default is still 7867 (help "0 picks a free port"); intended.
- `server/README.md:14,20`: example commands still use `--port 7867`.
- `server/tests/test_health.py:13`: Host header literal `localhost:7867`.
- `server/src/doorstop_vscode_server.egg-info/PKG-INFO`: generated copy of the README.
- `doc/help/*.md`: upstream doorstop CLI help dumps (unrelated).
- `.specify/memory/constitution.md` principle X reportedly still says the port is fixed (per fix.md follow-up; not re-grepped).

## Residual Risks

- Real extension-host kill was not re-exercised here (covered by fix.md manual check); simulated with a parent python process on Windows only.
- The new server must be published to PyPI before extension release (old server rejects the flag).
- The README example still shows 7867; harmless but stale.

## Recommendation

Close the bug. Optionally refresh the README example and update constitution principle X.
