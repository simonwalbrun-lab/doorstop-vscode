from pathlib import Path

from .conftest import set_item_text


def test_tree_reflects_documents_and_items(client, document):
    item = client.post(f"/documents/{document['prefix']}/items", json={}).json()

    response = client.get("/tree")

    assert response.status_code == 200
    body = response.json()
    assert len(body["documents"]) == 1
    doc = body["documents"][0]
    assert doc["prefix"] == document["prefix"]
    assert doc["markerPath"].endswith(".doorstop.yml")
    assert len(doc["items"]) == 1
    assert doc["items"][0]["uid"] == item["uid"]
    assert doc["items"][0]["links"] == []
    assert doc["items"][0]["active"] is True
    assert doc["items"][0]["normative"] is True
    assert doc["items"][0]["derived"] is False


def test_tree_reports_document_parent_relationship(client, document, project_root):
    client.post(
        "/documents",
        json={
            "prefix": "SYS",
            "path": str(project_root / "reqs" / "SYS"),
            "parentPrefix": document["prefix"],
        },
    )

    body = client.get("/tree").json()

    sys_doc = next(d for d in body["documents"] if d["prefix"] == "SYS")
    assert sys_doc["parentPrefix"] == document["prefix"]
    req_doc = next(d for d in body["documents"] if d["prefix"] == document["prefix"])
    assert req_doc["parentPrefix"] is None


def test_tree_link_becomes_suspect_after_parent_content_changes(client, document, project_root):
    parent = client.post(f"/documents/{document['prefix']}/items", json={}).json()
    child = client.post(f"/documents/{document['prefix']}/items", json={}).json()
    client.post(f"/items/{child['uid']}/links", json={"parentUid": parent["uid"]})
    client.post("/clear", json={"scope": "item", "target": child["uid"]})

    cleared_tree = client.get("/tree").json()
    cleared_node = next(
        i for d in cleared_tree["documents"] for i in d["items"] if i["uid"] == child["uid"]
    )
    assert cleared_node["links"] == [{"uid": parent["uid"], "suspect": False}]

    set_item_text(project_root, parent["uid"], "changed after the link was cleared")

    updated_tree = client.get("/tree").json()
    updated_node = next(
        i for d in updated_tree["documents"] for i in d["items"] if i["uid"] == child["uid"]
    )
    assert updated_node["links"] == [{"uid": parent["uid"], "suspect": True}]


def test_tree_link_to_dangling_parent_is_suspect(client, document):
    parent = client.post(f"/documents/{document['prefix']}/items", json={}).json()
    child = client.post(f"/documents/{document['prefix']}/items", json={}).json()
    client.post(f"/items/{child['uid']}/links", json={"parentUid": parent["uid"]})
    client.post("/clear", json={"scope": "item", "target": child["uid"]})

    # Remove the parent item's file directly, leaving a dangling link.
    Path(parent["path"]).unlink()

    body = client.get("/tree").json()
    node = next(i for d in body["documents"] for i in d["items"] if i["uid"] == child["uid"])
    assert node["links"] == [{"uid": parent["uid"], "suspect": True}]
