def test_health_reports_ok_and_project_root(client, project_root):
    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["projectRoot"] == str(project_root)
