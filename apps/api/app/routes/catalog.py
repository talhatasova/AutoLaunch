from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth import Founder, require_founder
from app.db import repo
from app.db.session import user_session

router = APIRouter(prefix="/api/v1")


class Directory(BaseModel):
    id: UUID
    slug: str
    name: str
    url: str
    category: str
    price_kind: str
    price_note: str | None
    price_source_url: str | None
    price_checked_at: datetime | None
    obligation: str | None
    terms_url: str | None
    last_verified_at: datetime | None
    automation_verified_at: datetime | None
    receipt_verified: bool
    rules_permit_automation: bool
    requires_consent: bool
    tier: int
    requires_captcha: bool
    requires_profile_fields: list[str] = []
    status: str
    channel_type: str = "directory"
    automation: str = "manual"
    challenge_kind: str = "none"
    terms_prohibit_automation: bool = False
    needs_platform_account: bool = False
    needs_email_verification: bool = False
    fields_sent: list[str] = []
    eligible: bool = False


@router.get("/directories", response_model=list[Directory])
async def list_directories(founder: Founder = Depends(require_founder)) -> list[dict]:
    async with user_session(founder.claims) as db:
        return await repo.catalog(db)
