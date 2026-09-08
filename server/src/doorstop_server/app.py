from fastapi import FastAPI

from doorstop_server.config import Settings
from doorstop_server.errors import register_exception_handlers
from doorstop_server.lock import serialize_requests
from doorstop_server.routers import documents, health, items, review, tree


def create_app(settings: Settings) -> FastAPI:
    app = FastAPI(title="doorstop-vscode-server")
    app.state.settings = settings

    app.middleware("http")(serialize_requests)
    register_exception_handlers(app)

    app.include_router(health.router)
    app.include_router(documents.router)
    app.include_router(items.router)
    app.include_router(review.router)
    app.include_router(tree.router)

    return app
