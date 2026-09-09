from pathlib import Path

import doorstop
import pytest
from fastapi.testclient import TestClient

from doorstop_server.app import create_app
from doorstop_server.config import Settings


@pytest.fixture
def project_root(tmp_path: Path) -> Path:
    return tmp_path


@pytest.fixture
def client(project_root: Path) -> TestClient:
    settings = Settings(project_root=str(project_root), host="127.0.0.1", port=0)
    app = create_app(settings)
    return TestClient(app)


@pytest.fixture
def document(client: TestClient, project_root: Path) -> dict:
    """Creates a root document with prefix 'REQ' and returns its response body."""
    doc_path = project_root / "reqs" / "REQ"
    # Doorstop's default separator is empty (UIDs like "REQ001"); set "-" explicitly
    # so test UIDs read as "REQ-001", matching typical real-world Doorstop projects.
    response = client.post(
        "/documents", json={"prefix": "REQ", "path": str(doc_path), "separator": "-"}
    )
    assert response.status_code == 200, response.text
    return response.json()


def set_item_text(project_root: Path, uid: str, text: str) -> None:
    """Mutates an item's text directly via the Doorstop API, bypassing the server -
    used to simulate a parent item changing after a link was created, without
    assuming anything about the on-disk YAML/Markdown format."""
    tree = doorstop.build(cwd=str(project_root), root=str(project_root), request_next_number=None)
    item = tree.find_item(uid)
    item.text = text
