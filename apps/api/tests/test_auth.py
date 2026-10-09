from fastapi.testclient import TestClient

from app.main import app


def test_identity_requires_a_verified_token(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://auth.example.test")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "public-key")
    with TestClient(app) as client:
        assert client.get("/health").json() == {"status": "ok"}
        missing = client.get("/api/v1/me")
        assert missing.status_code == 401
        assert missing.json()["request_id"] == missing.headers["x-request-id"]
        assert client.get("/api/v1/me", headers={"Authorization": "Bearer bad"}).status_code == 401
