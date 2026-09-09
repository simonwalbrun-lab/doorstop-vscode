# doorstop-vscode-server

A small FastAPI server that wraps the [Doorstop](https://pypi.org/project/doorstop/) Python API directly (instead of shelling out to the `doorstop` CLI). It is designed to serve exactly one client — the Doorstop VS Code extension — and answers requests strictly one at a time; there is no concurrent request handling.

## Install (editable, for development)

```bash
pip install -e .[dev]
```

## Run

```bash
python -m doorstop_server --project <path-to-doorstop-project-root> --host 127.0.0.1 --port 7867
```

or, after installing:

```bash
doorstop-vscode-server --project <path-to-doorstop-project-root> --host 127.0.0.1 --port 7867
```

## API

See `src/doorstop_server/routers/` for the endpoint implementations. `GET /health` is the only route that is not serialized behind the request lock.

## Tests

The test suite exercises the real FastAPI app against a temporary Doorstop project (no mocking of Doorstop itself), so it doubles as a pinned-down contract for the HTTP interface — every request/response shape, status code, and error format a test asserts on is something the extension can rely on.

```bash
pip install -e .[dev]
pytest
```

- `tests/conftest.py` — shared fixtures (`client`, `project_root`, `document`) and a `set_item_text` helper for mutating an item directly via the Doorstop API (bypassing the server) to simulate out-of-band edits.
- `tests/test_serialization.py` — proves the one-request-at-a-time guarantee black-box: fires concurrent `/items` calls and checks for zero UID collisions/gaps, rather than inspecting the lock directly.
- `tests/test_errors.py` — pins down the structured `{"error": {"code", "message"}}` shape for both expected (`DoorstopError`) and unexpected exceptions.
