# Bug Assessment: fixed port 7867 and orphaned server processes

- **Slug**: server-fixed-port-orphan
- **Created**: 2026-11-01
- **Source**: pasted text
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

> fixed port and orphaned server

## Symptom

The server always listens on `127.0.0.1:7867`. Two consequences:

1. **Second project**: a second window on another project gets "port in use" and has no server. The audit-fixes-2026-10 project-root check prevents adopting the wrong server but does not make the second project work.
2. **Orphan**: if the extension host dies without `dispose()` (crash, force-kill, force-quit), uvicorn keeps running because nothing ties it to its parent. On the next start for the *same* project, `isHealthy()` matches the orphan's `projectRoot` and adopts it. The new child fails to bind and exits unnoticed. `dispose()`/`restart()` can then never stop the orphan, which may run an old server version or interpreter. For a *different* project, the orphan blocks the port until the user kills it by hand.

## Reproduction

1. Open project A and wait for "Doorstop server is ready".
2. Kill the extension host process, not the server.
3. Reopen A. It reports ready, but "Doorstop: Restart Extension" does not replace the process that is actually serving (same PID before and after).
4. Alternatively, open project B. Startup fails with the port-in-use hint.

[NEEDS CLARIFICATION: whether a normal window reload calls `deactivate`/`dispose` in time on every OS. The orphan path is derived from code; it has not been reproduced on each platform.]

## Suspected Code Paths

- `src/doorstopServer.ts:7`: `DOORSTOP_SERVER_PORT = 7867`. `options.port` exists but nothing passes it.
- `src/doorstopServer.ts:79-90`: `spawn(...)` with no parent-lifetime link. stdin is `'ignore'`.
- `src/doorstopServer.ts:121-128`: resolves on the first healthy poll, which can be a pre-existing process. The own child's later exit is ignored (`settled`).
- `src/doorstopServer.ts:275-287`: `isHealthy()` checks `projectRoot` only, not that the responder is our child.
- `server/src/doorstop_server/cli.py:13`: `--port` default 7867. No parent watch.

## Root Cause Hypothesis

A fixed, shared port plus a health check that cannot tell our process from another one for the same project. The server has no way to notice that its parent is gone. Confidence: high.

## Proposed Remediation

**Preferred**: two small changes.

1. **Parent watch (fixes orphans)**: spawn with stdin as `'pipe'`, and in `cli.py` start a daemon thread that blocks on `sys.stdin.read()` and calls `os._exit(0)` on EOF. The OS closes the pipe when the parent dies, on every platform, so orphans exit on their own. This needs no dependency.
2. **Ephemeral port (fixes multi-window)**: pass `--port 0`, have the server print the bound port on stdout once uvicorn has bound (e.g. `DOORSTOP_PORT=<n>`), and have `DoorstopServer` read that line before polling `/health`.

**Alternatives**:

- Ship only (1). It is the smaller change and fixes orphans, but two projects still cannot run at once.
- Add a `--parent-pid` flag and poll the parent. This needs `psutil` or platform-specific code, while stdin EOF needs neither.

**Files likely to change**:

- `src/doorstopServer.ts`
- `server/src/doorstop_server/cli.py` (submodule)
- server-related tests in `src/test/` and `server/tests/`

**Tests to add or update**:

- Server: start the CLI with stdin as a pipe, close it, and assert that the process exits within ~2 s.
- Server: `--port 0` prints a parseable port line, and `/health` answers on it.
- Extension: with a stub child that prints a port, `DoorstopServer` polls that port.

## Risks & Considerations

- Every consumer of `DOORSTOP_SERVER_PORT` (tests, docs, any code building server URLs) must switch to the instance's port. Grep before changing.
- The README may document port 7867 or a port-in-use troubleshooting entry. Update it.
- The submodule change needs a PyPI release. The extension must cope with an older server that does not print a port (version check or fallback to 7867).

## Open Questions

- [NEEDS CLARIFICATION: does anything outside the extension (scripts, docs, users' tooling) rely on the fixed port 7867? If so, keep it as an opt-in setting.]
