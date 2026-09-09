import asyncio
from pathlib import Path

import httpx

from doorstop_server.app import create_app
from doorstop_server.config import Settings


def test_concurrent_add_requests_are_processed_one_at_a_time(tmp_path: Path):
    """The server promises to serve one client and answer requests strictly one at a
    time (see lock.py). If that guarantee ever broke, concurrent /items calls could
    race on Document.next_number and hand out duplicate or non-sequential UIDs -
    that's the observable, black-box symptom this test checks for, rather than
    inspecting lock internals directly."""
    settings = Settings(project_root=str(tmp_path), host="127.0.0.1", port=0)
    app = create_app(settings)

    async def run() -> list[str]:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as async_client:
            create_response = await async_client.post(
                "/documents",
                json={
                    "prefix": "REQ",
                    "path": str(tmp_path / "reqs" / "REQ"),
                    "separator": "-",
                },
            )
            assert create_response.status_code == 200

            responses = await asyncio.gather(
                *[async_client.post("/documents/REQ/items", json={}) for _ in range(8)]
            )
            for response in responses:
                assert response.status_code == 200
            return [response.json()["uid"] for response in responses]

    uids = asyncio.run(run())

    assert len(set(uids)) == len(uids), f"expected no duplicate UIDs, got {uids}"
    assert sorted(uids) == [f"REQ-{n:03d}" for n in range(1, 9)]


def test_health_is_not_blocked_by_the_lock(tmp_path: Path):
    """/health is explicitly exempted from the request lock so the extension's
    readiness probe never blocks behind a slow request (see lock.py)."""
    settings = Settings(project_root=str(tmp_path), host="127.0.0.1", port=0)
    app = create_app(settings)

    async def run() -> None:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as async_client:
            create_response = await async_client.post(
                "/documents", json={"prefix": "REQ", "path": str(tmp_path / "reqs" / "REQ")}
            )
            assert create_response.status_code == 200

            # Fire a batch of item-adds and a /health check concurrently; /health
            # must still return promptly and correctly regardless of interleaving.
            results = await asyncio.gather(
                *[async_client.post("/documents/REQ/items", json={}) for _ in range(5)],
                async_client.get("/health"),
            )
            health_response = results[-1]
            assert health_response.status_code == 200
            assert health_response.json()["status"] == "ok"

    asyncio.run(run())
