# Data Model: Server Connection & Lifecycle

- **DoorstopServer** (`src/doorstopServer.ts`): host, port, startupTimeoutMs (15000), retryIntervalMs (100), `process`, `startPromise`, `disposed`, `recentStderr` (at most 2000 chars), in-flight GET map.
  States: Stopped, Starting (spawned, polling), Ready (health ok), Failed (exit, spawn error or timeout), back to Stopped on dispose. `restart` = stop, then start.
- **Workspace marker**: any `.doorstop.yml` matched by `**/.doorstop.yml` in the first workspace folder.
- **ErrorPayload**: `{error:{code,message}}`; in TypeScript `DoorstopApiError(code, message, status)`.
- **HealthResponse** (`server/src/doorstop_server/schemas.py`): `{status, projectRoot}`.
