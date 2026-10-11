# Contract: server process, health and error shapes

- Launch: `<python> -m doorstop_server --project <abs path> --host 127.0.0.1 --port 7867`; cwd is the workspace folder; stdin ignored.
- `GET /health` returns 200 `{ "status": "ok", "projectRoot": "<path>" }`. It never takes the request lock and never loads the tree.
- Every other route is handled one at a time.
- Errors: `{ "error": { "code": "<CODE>", "message": "<text>" } }`. Codes: domain codes from `DoorstopApiError`, `DOORSTOP_ERROR` (400), `INTERNAL_ERROR` (500). FastAPI body validation returns 422.
- Client-side startup failure text: `doorstop_server exited before becoming ready (code N, signal S).` or `Timed out waiting for Doorstop server at host:port.`, each followed by recent stderr and, on a port conflict, `portInUseHint(port)`.
