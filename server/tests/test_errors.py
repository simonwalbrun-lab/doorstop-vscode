from fastapi.testclient import TestClient

from doorstop_server.deps import get_tree


def test_doorstop_error_becomes_structured_400(client):
    response = client.post("/documents/DOES-NOT-EXIST/items", json={})

    assert response.status_code == 400
    body = response.json()
    assert set(body.keys()) == {"error"}
    assert set(body["error"].keys()) == {"code", "message"}
    assert body["error"]["code"] == "DOORSTOP_ERROR"
    assert isinstance(body["error"]["message"], str) and body["error"]["message"]


def test_unexpected_exception_becomes_structured_500(client):
    """Any exception that isn't a DoorstopApiError/DoorstopError must still come back
    as the same structured {"error": {code, message}} shape, not a raw traceback -
    this is the whole point of a stable interface for the extension to parse."""
    app = client.app

    def broken_tree():
        raise RuntimeError("boom")

    app.dependency_overrides[get_tree] = broken_tree
    try:
        # Starlette's ServerErrorMiddleware builds the correct response *and* still
        # re-raises the original exception afterward for Exception-class handlers
        # (so real ASGI servers can log it) - the client already received the right
        # response either way; raise_server_exceptions=False just stops TestClient
        # from also surfacing that re-raise to the test itself.
        no_raise_client = TestClient(app, raise_server_exceptions=False)
        response = no_raise_client.get("/tree")
    finally:
        app.dependency_overrides.pop(get_tree, None)

    assert response.status_code == 500
    body = response.json()
    assert body["error"]["code"] == "INTERNAL_ERROR"
    assert "boom" in body["error"]["message"]


def test_validation_error_on_bad_request_body_returns_422(client, document):
    response = client.post(
        f"/documents/{document['prefix']}/reorder", json={"mode": "not-a-real-mode"}
    )

    # Pydantic/FastAPI's own request validation, not our error handler - still worth
    # pinning down since the client relies on 422 (not 400/500) for bad input.
    assert response.status_code == 422
