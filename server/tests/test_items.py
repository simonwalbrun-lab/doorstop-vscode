def test_link_and_unlink_items(client, document):
    parent = client.post(f"/documents/{document['prefix']}/items", json={}).json()
    child = client.post(f"/documents/{document['prefix']}/items", json={}).json()

    link_response = client.post(f"/items/{child['uid']}/links", json={"parentUid": parent["uid"]})
    assert link_response.status_code == 200
    assert link_response.json() == {"child": child["uid"], "parent": parent["uid"]}

    tree = client.get("/tree").json()
    child_node = next(i for d in tree["documents"] for i in d["items"] if i["uid"] == child["uid"])
    # A freshly created link has no stamp yet (only /clear sets one), so it starts suspect.
    assert child_node["links"] == [{"uid": parent["uid"], "suspect": True}]

    unlink_response = client.delete(f"/items/{child['uid']}/links/{parent['uid']}")
    assert unlink_response.status_code == 204

    tree_after = client.get("/tree").json()
    child_node_after = next(
        i for d in tree_after["documents"] for i in d["items"] if i["uid"] == child["uid"]
    )
    assert child_node_after["links"] == []


def test_self_link_is_rejected(client, document):
    item = client.post(f"/documents/{document['prefix']}/items", json={}).json()

    response = client.post(f"/items/{item['uid']}/links", json={"parentUid": item["uid"]})

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "DOORSTOP_ERROR"


def test_link_to_unknown_parent_returns_400(client, document):
    item = client.post(f"/documents/{document['prefix']}/items", json={}).json()

    response = client.post(f"/items/{item['uid']}/links", json={"parentUid": "REQ-999"})

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "DOORSTOP_ERROR"
