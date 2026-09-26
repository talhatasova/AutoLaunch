import httpx
from fastapi.testclient import TestClient

from app.main import app, auth_client


def test_founder_evidence_needs_public_verification_before_live(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://db.example.test")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "public-key")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-key")
    monkeypatch.setenv("WEB_INTERNAL_URL", "https://web.example.test")
    monkeypatch.setenv("INTERNAL_VERIFY_KEY", "internal-key")
    writes = []
    submission_id = "8e144781-a985-4e1d-aa90-1180202cc7f2"

    def respond(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/auth/v1/user":
            return httpx.Response(200, json={"id": submission_id, "email": "founder@example.test"})
        if request.url.path == "/rest/v1/submissions" and request.method == "GET":
            return httpx.Response(200, json=[{
                "id": submission_id, "app_id": submission_id,
                "directory_id": submission_id, "status": "pending_review",
            }])
        if request.url.path == "/rest/v1/apps":
            return httpx.Response(200, json=[{"url": "https://product.example.test"}])
        if request.url.path == "/rest/v1/directories":
            return httpx.Response(200, json=[{"url": "https://directory.example.test"}])
        if request.url.path == "/api/internal/verify-listing":
            assert request.headers["x-internal-key"] == "internal-key"
            if "fake" in request.content.decode():
                return httpx.Response(422)
            return httpx.Response(200, json={
                "url": "https://directory.example.test/product", "checked_at": "2026-09-26T00:00:00Z"
            })
        if request.url.path == "/rest/v1/rpc/confirm_live_listing":
            assert request.headers["apikey"] == "service-key"
            assert "authorization" not in request.headers
            assert __import__("json").loads(request.content)["p_owner_id"] == submission_id
            writes.append(request.content)
            return httpx.Response(200, json={"id": submission_id})
        raise AssertionError(request.url)

    async def fake_client():
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            yield client

    app.dependency_overrides[auth_client] = fake_client
    try:
        with TestClient(app) as client:
            headers = {"Authorization": "Bearer valid-token"}
            url = f"/api/v1/submissions/{submission_id}/verify-live"
            assert client.post(url, json={"url": "https://fake.test"}, headers=headers).status_code == 422
            assert writes == []
            response = client.post(url, json={"url": "https://directory.example.test/product"}, headers=headers)
            assert response.status_code == 200
            assert response.json()["status"] == "live"
            assert len(writes) == 1
    finally:
        app.dependency_overrides.clear()
