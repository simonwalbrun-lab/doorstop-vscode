import asyncio

from starlette.types import ASGIApp, Receive, Scope, Send

_UNLOCKED_PATHS = {"/health"}


class SerializeRequestsMiddleware:
    """Ensures the app answers exactly one request at a time (except /health).

    Implemented as a bare ASGI middleware -- not `@app.middleware("http")`
    (Starlette's BaseHTTPMiddleware) -- because BaseHTTPMiddleware runs the
    downstream app inside a separate anyio task/stream that our
    @app.exception_handler() registrations cannot see through: an unexpected
    exception raised in a route would bypass the structured {"error": ...}
    response entirely and blow past this middleware as a raw exception. A plain
    ASGI middleware just awaits the inner app directly, so by the time control
    returns here any exception has already been turned into a normal response.

    The lock is created per middleware instance (i.e. per app / per
    create_app() call), not as a module-level global, so it's always bound to
    whatever event loop first serves that app.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self.lock = asyncio.Lock()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["path"] in _UNLOCKED_PATHS:
            await self.app(scope, receive, send)
            return
        async with self.lock:
            await self.app(scope, receive, send)
