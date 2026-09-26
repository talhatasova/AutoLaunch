import httpx
from fastapi.testclient import TestClient

from app.main import app, auth_client


def test_product_write_uses_founder_identity_and_database_cap(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://db.example.test")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "public-key")
    saved = []

    def respond(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == "Bearer valid-token"
        if request.url.path == "/auth/v1/user":
            return httpx.Response(200, json={
                "id": "8e144781-a985-4e1d-aa90-1180202cc7f2", "email": "founder@example.test"
            })
        assert request.url.path == "/rest/v1/apps"
        if request.method == "GET":
            return httpx.Response(200, json=saved)
        row = __import__("json").loads(request.content)
        if request.method == "PATCH":
            saved[0].update(row)
            return httpx.Response(200, json=[saved[0]])
        assert row["user_id"] == "8e144781-a985-4e1d-aa90-1180202cc7f2"
        assert row["contact_email"] == "founder@example.test"
        if len(saved) == 2:
            return httpx.Response(400, json={"message": "Free beta allows two products per founder"})
        row.update(id="8e144781-a985-4e1d-aa90-1180202cc7f2", status="ready", created_at="2026-09-26T00:00:00Z")
        saved.append(row)
        return httpx.Response(201, json=[row])

    async def fake_client():
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            yield client

    app.dependency_overrides[auth_client] = fake_client
    body = {
        "url": "https://example.test", "name": "Example", "tagline": "A useful tool", "description": "A useful tool",
        "category": "Productivity", "contact_name": "Founder",
    }
    try:
        with TestClient(app) as client:
            headers = {"Authorization": "Bearer valid-token"}
            assert client.post("/api/v1/products", json={**body, "url": "http://127.0.0.1"}, headers=headers).status_code == 422
            assert client.post("/api/v1/products", json=body, headers=headers).status_code == 201
            edited = client.patch("/api/v1/products/8e144781-a985-4e1d-aa90-1180202cc7f2", json={**body, "name": "Edited"}, headers=headers)
            assert edited.json()["name"] == "Edited"
            assert client.post("/api/v1/products", json=body, headers=headers).status_code == 201
            assert client.post("/api/v1/products", json=body, headers=headers).status_code == 409
            response = client.get("/api/v1/products", headers=headers)
            assert len(response.json()) == 2
            assert response.json()[0]["contact_email"] == "founder@example.test"
    finally:
        app.dependency_overrides.clear()
