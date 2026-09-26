from datetime import datetime, timedelta, timezone

from app.main import Directory


def test_directory_needs_current_complete_certification():
    now = datetime.now(timezone.utc)
    row = {
        "id": "8e144781-a985-4e1d-aa90-1180202cc7f2",
        "slug": "example", "name": "Example", "url": "https://example.test",
        "category": "startup", "price_kind": "free", "price_note": None,
        "price_source_url": None, "price_checked_at": now.isoformat(),
        "obligation": None, "terms_url": None, "tier": 2,
        "requires_captcha": False, "status": "active", "receipt_verified": True,
        "rules_permit_automation": True, "requires_consent": False,
        "automation_verified_at": now.isoformat(), "last_verified_at": now.isoformat(),
    }
    assert Directory.model_validate(row).with_eligibility().eligible
    for change in (
        {"price_kind": "unknown"}, {"receipt_verified": False},
        {"rules_permit_automation": False}, {"tier": 3},
        {"automation_verified_at": None},
        {"last_verified_at": (now - timedelta(days=8)).isoformat()},
    ):
        assert not Directory.model_validate({**row, **change}).with_eligibility().eligible
