from fastapi import APIRouter, Depends

from app.auth import Founder, require_founder
from app.db import repo
from app.db.session import user_session

router = APIRouter(prefix="/api/v1")


@router.get("/me")
async def me(founder: Founder = Depends(require_founder)) -> dict:
    async with user_session(founder.claims) as db:
        plan = await repo.plan(db)
    return {"id": founder.id, "email": founder.email, "plan": plan}
