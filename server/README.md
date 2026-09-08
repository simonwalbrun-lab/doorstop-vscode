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
