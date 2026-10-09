from urllib.parse import urlsplit
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.auth import Founder, require_founder
from app.db import repo
from app.db.session import RejectedByDatabase, service_session, user_session

router = APIRouter(prefix="/api/v1")


class ListingEvidence(BaseModel):
    url: str = Field(max_length=2048)

    @field_validator("url")
    @classmethod
    def https_url(cls, value: str) -> str:
        parsed = urlsplit(value.strip())
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("Enter the https URL of the public listing")
        return parsed.geturl()


@router.get("/submissions/{submission_id}/events")
async def submission_events(submission_id: UUID, founder: Founder = Depends(require_founder)) -> list[dict]:
    async with user_session(founder.claims) as db:
        return await repo.events(db, submission_id)


@router.post("/submissions/{submission_id}/retry")
async def retry_submission(submission_id: UUID, founder: Founder = Depends(require_founder)) -> dict:
    try:
        async with user_session(founder.claims) as db:
            return await repo.retry(db, submission_id)
    except RejectedByDatabase as exc:
        raise HTTPException(409, exc.message or "This submission cannot be retried") from None


@router.post("/submissions/{submission_id}/verify-live")
async def verify_live(
    submission_id: UUID, body: ListingEvidence, founder: Founder = Depends(require_founder)
) -> dict:
    """Hands the founder's URL to the worker, which owns the one listing verifier."""
    async with user_session(founder.claims) as db:
        status = await repo.submission_status(db, submission_id)
    if status is None:
        raise HTTPException(404, "Submission not found")
    if status not in {"pending_review", "unconfirmed"}:
        raise HTTPException(409, "This submission is not awaiting publication evidence")
    async with service_session() as db:
        queued = await repo.request_live_check(db, submission_id, founder.id, body.url)
    if not queued:
        raise HTTPException(409, "Submission changed while verifying")
    return {"status": "checking", "url": body.url}
