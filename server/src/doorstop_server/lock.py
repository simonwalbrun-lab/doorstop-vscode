import asyncio

from starlette.requests import Request
from starlette.responses import Response

# One process-wide lock, held for the full duration of every request except
# /health. This serializes at the middleware layer -- request N+1 cannot even
# begin parsing until request N's response has been fully produced -- which is
# the strongest, simplest reading of "answer requests one at a time".
REQUEST_LOCK = asyncio.Lock()

_UNLOCKED_PATHS = {"/health"}


async def serialize_requests(request: Request, call_next) -> Response:
    if request.url.path in _UNLOCKED_PATHS:
        return await call_next(request)
    async with REQUEST_LOCK:
        return await call_next(request)
