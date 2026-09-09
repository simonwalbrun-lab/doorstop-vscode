from pathlib import Path


def test_create_document_returns_prefix_and_path(client, project_root):
    doc_path = project_root / "reqs" / "REQ"

    response = client.post("/documents", json={"prefix": "REQ", "path": str(doc_path)})

    assert response.status_code == 200
    body = response.json()
    assert body["prefix"] == "REQ"
    assert Path(body["path"]).resolve() == doc_path.resolve()
    assert (doc_path / ".doorstop.yml").exists()


def test_create_document_with_duplicate_prefix_fails(client, document, project_root):
    response = client.post(
        "/documents", json={"prefix": "REQ", "path": str(project_root / "reqs" / "REQ2")}
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "DOORSTOP_ERROR"


def test_create_child_document_with_parent(client, document, project_root):
    response = client.post(
        "/documents",
        json={
            "prefix": "SYS",
            "path": str(project_root / "reqs" / "SYS"),
            "parentPrefix": document["prefix"],
        },
    )

    assert response.status_code == 200
    assert response.json()["prefix"] == "SYS"


def test_add_item_creates_file_and_returns_uid(client, document):
    response = client.post(f"/documents/{document['prefix']}/items", json={})

    assert response.status_code == 200
    body = response.json()
    assert body["uid"] == "REQ-001"
    assert Path(body["path"]).exists()
    assert body["level"] == "1.0"


def test_add_item_with_explicit_level(client, document):
    response = client.post(f"/documents/{document['prefix']}/items", json={"level": "2.3"})

    assert response.status_code == 200
    assert response.json()["level"] == "2.3"


def test_add_item_on_unknown_document_returns_400(client):
    response = client.post("/documents/NOPE/items", json={})

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "DOORSTOP_ERROR"


def test_reorder_auto(client, document):
    client.post(f"/documents/{document['prefix']}/items", json={})
    client.post(f"/documents/{document['prefix']}/items", json={})

    response = client.post(f"/documents/{document['prefix']}/reorder", json={"mode": "auto"})

    assert response.status_code == 200
    assert response.json() == {"prefix": document["prefix"], "mode": "auto"}


def test_reorder_manual_without_index_returns_409(client, document):
    response = client.post(f"/documents/{document['prefix']}/reorder", json={"mode": "manual"})

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "NO_REORDER_INDEX"


def test_reorder_index_lifecycle(client, document):
    client.post(f"/documents/{document['prefix']}/items", json={})

    ensure = client.post(f"/documents/{document['prefix']}/reorder/index")
    assert ensure.status_code == 200
    index_path = Path(ensure.json()["indexPath"])
    assert index_path.exists()

    # Ensuring again while an index already exists must not regenerate/overwrite it.
    ensure_again = client.post(f"/documents/{document['prefix']}/reorder/index")
    assert ensure_again.status_code == 200
    assert ensure_again.json()["indexPath"] == ensure.json()["indexPath"]

    apply_response = client.post(f"/documents/{document['prefix']}/reorder", json={"mode": "manual"})
    assert apply_response.status_code == 200
    # Doorstop deletes the scratch index file once it has been applied.
    assert not index_path.exists()


def test_reorder_index_discard(client, document):
    client.post(f"/documents/{document['prefix']}/reorder/index")

    response = client.delete(f"/documents/{document['prefix']}/reorder/index")

    assert response.status_code == 204
    reorder_after_discard = client.post(
        f"/documents/{document['prefix']}/reorder", json={"mode": "manual"}
    )
    assert reorder_after_discard.status_code == 409


def test_export_then_import_round_trip(client, document, tmp_path):
    client.post(f"/documents/{document['prefix']}/items", json={})
    export_path = tmp_path / "export.yml"

    export_response = client.post(
        f"/documents/{document['prefix']}/export",
        json={"format": "yaml", "destinationPath": str(export_path)},
    )
    assert export_response.status_code == 200
    assert export_path.exists()

    # Doorstop only allows a single root document (no parentPrefix); every other
    # document needs one -- see test_create_document_with_duplicate_prefix_fails's
    # sibling case in test_create_child_document_with_parent.
    other_doc_path = tmp_path / "reqs" / "REQ2"
    client.post(
        "/documents",
        json={"prefix": "REQ2", "path": str(other_doc_path), "parentPrefix": document["prefix"]},
    )

    import_response = client.post(
        "/documents/REQ2/import", json={"sourcePath": str(export_path)}
    )

    assert import_response.status_code == 200
    assert import_response.json()["prefix"] == "REQ2"
    tree_after = client.get("/tree").json()
    imported_doc = next(d for d in tree_after["documents"] if d["prefix"] == "REQ2")
    assert len(imported_doc["items"]) == 1


def test_publish_markdown_writes_to_requested_path(client, document, tmp_path):
    client.post(f"/documents/{document['prefix']}/items", json={})
    destination = tmp_path / "publish.md"

    response = client.post(
        f"/documents/{document['prefix']}/publish",
        json={"format": "markdown", "destinationPath": str(destination)},
    )

    assert response.status_code == 200
    assert response.json()["path"] == str(destination)
    assert destination.exists()


def test_publish_html_nests_under_documents_subfolder(client, document, tmp_path):
    """Doorstop's HTML publisher writes the actual file to
    <dirname(destination)>/documents/<name>, not to `destination` itself. Pinning
    this documented quirk so a Doorstop upgrade that changes it doesn't silently
    break the extension's "open the published file" flow."""
    client.post(f"/documents/{document['prefix']}/items", json={})
    destination = tmp_path / "publish.html"

    response = client.post(
        f"/documents/{document['prefix']}/publish",
        json={"format": "html", "destinationPath": str(destination)},
    )

    assert response.status_code == 200
    nested = destination.parent / "documents" / destination.name
    assert nested.exists()
