# Research: Server Connection & Lifecycle (retroactive)

Decisions are recovered from the code, not newly made. No NEEDS CLARIFICATION remain.

- **Transport**: local HTTP on fixed `127.0.0.1:7867`. Simple and testable with `fetch`. Consequence: port conflicts are reported with `portInUseHint`; there is no fallback port.
- **Readiness**: poll `/health` every 100 ms for up to 15 s. Failure text includes the last 2000 chars of stderr.
- **Process model**: `spawn(shell:false, windowsHide:true)`; stop with SIGTERM, SIGKILL after 5 s; `dispose()` resolves only after exit so the port is free.
- **Serialisation**: bare ASGI middleware with an `asyncio.Lock` (not `BaseHTTPMiddleware`, which would bypass exception handlers). `/health` is exempt. uvicorn `workers=1`.
- **Errors**: `{error:{code,message}}` with domain codes, `DOORSTOP_ERROR` (400), `INTERNAL_ERROR` (500).
- **Interpreter**: `ms-python.python` `environments.getActiveEnvironmentPath`.
- **Testing choice**: lifecycle tests drive `DoorstopServer` against a real `python -m doorstop_server` on a non-default port, plus a tiny stub Python script for failure modes (exit early, bind the port, never become healthy), so they run in the existing CI job. FR-011 uses the FastAPI `TestClient` fixtures in `server/tests/conftest.py`.
