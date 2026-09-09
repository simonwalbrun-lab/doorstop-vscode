from doorstop.common import DoorstopError
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class DoorstopApiError(Exception):
    """A request-level error raised by a route handler (bad input, not found, ...)."""

    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def _error_response(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message}},
    )


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(DoorstopApiError)
    async def handle_api_error(_request: Request, exc: DoorstopApiError) -> JSONResponse:
        return _error_response(exc.status_code, exc.code, exc.message)

    @app.exception_handler(DoorstopError)
    async def handle_doorstop_error(_request: Request, exc: DoorstopError) -> JSONResponse:
        return _error_response(400, "DOORSTOP_ERROR", str(exc))

    @app.exception_handler(Exception)
    async def handle_unexpected_error(_request: Request, exc: Exception) -> JSONResponse:
        return _error_response(500, "INTERNAL_ERROR", str(exc))
