from fastapi import APIRouter, Request

from doorstop_server.schemas import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
    settings = request.app.state.settings
    return HealthResponse(status="ok", projectRoot=settings.project_root)
