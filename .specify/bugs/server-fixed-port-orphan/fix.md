# Bug Fix: fixed port 7867 and orphaned server processes

- **Slug**: server-fixed-port-orphan
- **Fixed**: 2026-11-01
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Both parts of the preferred fix are in. The extension now starts the server with `--port 0 --exit-on-stdin-eof` and stdin as a pipe. The server binds a free port, prints `DOORSTOP_PORT=<n>` on stdout, and exits when stdin closes, which happens when the extension host dies. `DoorstopServer` reads that line, then polls `/health` and sends every request to that port.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `server/src/doorstop_server/cli.py` | modified | New `--exit-on-stdin-eof` flag (opt-in, so running the CLI by hand is unchanged). The server binds the socket itself with `socket.create_server`, prints `DOORSTOP_PORT=<n>`, then calls `uvicorn.Server(config).run(sockets=[sock])`. The watcher thread reads a private `os.dup` of stdin, and fd 0 is pointed at NUL (see Deviations). |
| `server/tests/test_cli.py` | added | Real subprocess tests: the port line, `/health` on that port, `/validate` still answering, and exit on stdin EOF. |
| `server/README.md` | modified | Documents the port line, `--port 0` and `--exit-on-stdin-eof`. |
| `src/doorstopServer.ts` | modified | Removed `DOORSTOP_SERVER_PORT`. With no `port` option the server is started with `--port 0` and the port is read from stdout (`parsePortLine`). `port` is now a public property. Spawn uses stdin `'pipe'` plus `--exit-on-stdin-eof`. Added `OUTDATED_SERVER_HINT` for an old server. An explicit `port` option behaves as before. |
| `src/extension.ts` | modified | `activate()` also exports `server` (test-only, like the other exports). |
| `src/test/regressionFixture.test.ts` | modified | Removed the "adopt whatever is on 7867" logic. The suite starts its own server on a free port and points the extension's client at it (`extensionServer.port = server.port`, also after the restart in the unreachable-save test). The dead-port client uses the literal 7874 and the fresh client uses `server.port`. Dropped the `startedOwnServer` skip. |
| `src/test/doorstopServer.test.ts` | added tests | New suite "Doorstop server port line" for `parsePortLine`. |
| `doc/architecture.md` | modified | Replaced `127.0.0.1:7867` with free port plus stdin-EOF lifetime. |

## Tests Added or Updated

- `server/tests/test_cli.py::test_port_zero_reports_the_bound_port_and_serves_health`: `--port 0` prints one parseable `DOORSTOP_PORT=<n>` line and `/health` answers on it.
- `server/tests/test_cli.py::test_server_exits_when_stdin_closes`: `/validate` (which spawns the worker process) still answers under the flag, and closing stdin ends the process with code 0 within 5 s.
- `src/test/doorstopServer.test.ts` "Doorstop server port line": parses LF and CRLF output and rejects missing or partial lines.
- The extension's real stdout-to-port path is covered end-to-end by the `regressionFixture` suite, which now depends on it. The assessment asked for a stub child that prints a port. That was not feasible because the spawn command is always `<python> -m doorstop_server ...`, and the existing stub (`process.execPath`) cannot accept `-m`.

## Local Verification

- `npm run compile`: pass (tsc, eslint, esbuild).
- `npx vscode-test --label unit`: 28 passing.
- `npx vscode-test --label doorstopServer`: 4 passing.
- `npx vscode-test --label regressionFixture`, final code, 6 runs: 4 passed with 85 passing. 2 runs had 1 failure each in "Document View (019) a failed write is reported and keeps that block dirty" (VS Code: "has changed in the meantime"). The same test also failed in 1 of 4 baseline runs with this fix's files reverted to HEAD, so it is an existing flake. One earlier run also failed once on "Problems: a suspect link is a warning" (0 warnings); it did not recur.
- Also green: `emptyFolderBootstrap` (14), `problemReporting` (12), `documentSkip` (3), `quickEntry` (25), `diagramLayout` (22).
- `server/`: `python -m pylint src/doorstop_server tests tools` gives 10.00/10 (only the known CRLF message on tests/test_health.py). `python -m pytest` gives 268 passed.
- Interpreter: `.venv/Scripts/python` imports `doorstop_server` from `server/src`, an editable install of the submodule.
- Manual orphan check: during a regressionFixture run I force-killed the extension host process. The server, its venv launcher and the validation worker were all gone within 4 s.
- No `doorstop_server`, multiprocessing or vscode-test processes are left running. `testdata/` has no changes.

## Deviations from Assessment

- **Windows hang with a pending stdin read**: the plain version (daemon thread calling `sys.stdin.buffer.read()`) made `/validate` hang forever on Windows. The validation worker (multiprocessing spawn) blocks at startup while the parent has a synchronous read pending on a pipe the child inherits. Reproduced: 200 in 1.2 s without the flag, timeout after 20 s with it. Fix: the watcher reads an `os.dup` of fd 0 (not inheritable), and fd 0 is `dup2`'d to `os.devnull`, so children get NUL. Pinned by the `/validate` assertion in `test_server_exits_when_stdin_closes`.
- **Opt-in flag**: the parent watch only runs with `--exit-on-stdin-eof`. Started by hand from a terminal, the CLI behaves as before. The `DOORSTOP_PORT=` line is always printed (one harmless line).
- **Old server compatibility**: there is no version check and no fallback to 7867. An older server rejects `--exit-on-stdin-eof` (argparse "unrecognized arguments"). The startup error then shows that stderr plus `OUTDATED_SERVER_HINT` ("Upgrade it (pip install --upgrade doorstop-vscode-server) ..."). If a server never prints its port, the timeout error says "never reported its port" with the same hint.
- **Fixed-port opt-in setting (open question)**: not added. Nothing in the repo besides the removed code and tests relied on 7867. The `.claude/settings.local.json` curl allow-entries and the upstream `doorstop-server` help in `doc/help/` are unrelated. Anyone scripting against the extension's server must now read the port from the "[Doorstop][server] DOORSTOP_PORT=" log line.
- **Bind via `socket.create_server`**: chosen over uvicorn's `Config.bind_socket()`, which sets SO_REUSEADDR on Windows as well. On Windows that would let two servers bind the same fixed port. `create_server` sets it on POSIX only, which matches uvicorn's normal path. A port-in-use error still shows up as an OSError matching `PORT_IN_USE_REGEX`.

## Follow-ups

- Publish a new `doorstop-vscode-server` to PyPI before releasing the extension. The current PyPI server will fail to start with the upgrade hint.
- `.specify/memory/constitution.md` principle X still lists "the server port is fixed at 7867" as a known violation. Update it on the next constitution amendment (not edited here).
- The flaky "a failed write is reported and keeps that block dirty" Document View test (also fails at baseline) should get its own bug.
- `portInUseHint` now only applies to an explicit `port` option. It could be simplified later.
