import httpx
from fastapi.testclient import TestClient

from app.main import app, auth_client


def test_analytics_counts_receipts_separately_from_live(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://db.example.test")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "public-key")

    def respond(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/auth/v1/user":
            return httpx.Response(200, json={
                "id": "8e144781-a985-4e1d-aa90-1180202cc7f2", "email": "founder@example.test"
            })
        assert request.url.path == "/rest/v1/submissions"
        return httpx.Response(200, json=[
            {"id": "a", "app_id": "p", "directory_id": "d", "status": "pending_review", "directories": {"name": "Directory"}},
            {"id": "b", "app_id": "p", "directory_id": "d", "status": "live", "directories": {"name": "Directory"}},
        ])

    async def fake_client():
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            yield client

    app.dependency_overrides[auth_client] = fake_client
    try:
        with TestClient(app) as client:
            response = client.get("/api/v1/analytics", headers={"Authorization": "Bearer valid-token"})
            assert response.status_code == 200
            assert response.json()["counts"]["pending_review"] == 1
            assert response.json()["counts"]["live"] == 1
            assert response.json()["by_directory"][0]["total"] == 2
            assert response.json()["by_product"][0]["live"] == 1
    finally:
        app.dependency_overrides.clear()
