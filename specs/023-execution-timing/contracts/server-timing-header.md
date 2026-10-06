# Contract: `Server-Timing` response header

The server sets this header on every HTTP response: success, handled errors
(the structured `{"error": ...}` responses for `DoorstopApiError` and
`DoorstopError`), and `/health`. The one exception is a 500 from the
catch-all `Exception` handler: Starlette runs that handler in its outermost
middleware, outside `SerializeRequestsMiddleware`, so that response goes
out without the header. The extension then records the request without
stages.
It uses the W3C Server Timing syntax
(<https://www.w3.org/TR/server-timing/>).

```http
Server-Timing: wait;dur=0.04, load;dur=81.30, work;dur=12.71, route;desc="GET /items/{uid}/links"
```

| Metric | Field | Meaning |
| --- | --- | --- |
| `wait` | `dur` (ms, float) | Time spent waiting to acquire the request-serialization lock (`lock.py`). Always `0` for unlocked paths (`/health`). |
| `load` | `dur` (ms, float) | Time spent reading the project from disk. That is `doorstop.build(...)` via `get_tree()`, plus `tree.load()` via `load_items()` in routes that read every item (`/tree`, `/validate`, `/filter`). It is `0` if the route does not depend on the tree, and the times are added if either runs more than once. |
| `work` | `dur` (ms, float) | Everything from lock acquired until `http.response.start`, minus `load`. Includes the route body, item files Doorstop still loads lazily in routes without `load_items()`, and response serialization. |
| `route` | `desc` (quoted string) | `<METHOD> <route template>`. Falls back to the raw path when no route matched (404). |

## Guarantees

- `wait + load + work` equals the server-side total, so the stages cover it with no gap
  (SC-005).
- A client MUST tolerate the header being absent (older server) or containing unknown
  metrics. The extension ignores unparseable entries and never fails a request because
  of this header (FR-012).
- The header carries no data from the requirements themselves. It only reveals route
  templates, which are public anyway.
