import httpx
from fastapi.testclient import TestClient

from app.main import app, auth_client


def test_identity_requires_a_verified_token(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://auth.example.test")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "public-key")

    def auth_response(request: httpx.Request) -> httpx.Response:
        assert request.url == "https://auth.example.test/auth/v1/user"
        assert request.headers["apikey"] == "public-key"
        if request.headers["authorization"] != "Bearer valid-token":
            return httpx.Response(401)
        return httpx.Response(
            200,
            json={"id": "8e144781-a985-4e1d-aa90-1180202cc7f2", "email": "founder@example.test"},
        )

    async def fake_client():
        async with httpx.AsyncClient(transport=httpx.MockTransport(auth_response)) as client:
            yield client

    app.dependency_overrides[auth_client] = fake_client
    try:
        with TestClient(app) as client:
            assert client.get("/health").json() == {"status": "ok"}
            assert client.get("/api/v1/me").status_code == 401
            assert client.get("/api/v1/me", headers={"Authorization": "Bearer bad"}).status_code == 401
            response = client.get("/api/v1/me", headers={"Authorization": "Bearer valid-token"})
            assert response.status_code == 200
            assert response.json()["email"] == "founder@example.test"
    finally:
        app.dependency_overrides.clear()
