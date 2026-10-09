import ipaddress
import logging
import time
from collections import defaultdict, deque
from datetime import datetime
from urllib.parse import urlsplit
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app import launch_text
from app.auth import Founder, require_founder
from app.db import repo
from app.db.session import RejectedByDatabase, user_session

router = APIRouter(prefix="/api/v1")
log = logging.getLogger(__name__)

# ponytail: per-process memory, so the real ceiling is limit x instances; move to Postgres/Redis when scaled out.
_LAUNCH_TEXT_LIMIT, _LAUNCH_TEXT_WINDOW = 10, 3600
_launch_text_calls: dict[UUID, deque[float]] = defaultdict(deque)


def _launch_text_allowed(user_id: UUID) -> bool:
    now, calls = time.monotonic(), _launch_text_calls[user_id]
    while calls and now - calls[0] > _LAUNCH_TEXT_WINDOW:
        calls.popleft()
    if len(calls) >= _LAUNCH_TEXT_LIMIT:
        return False
    calls.append(now)
    return True


class ProductInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    url: str = Field(max_length=2048)
    name: str = Field(min_length=1, max_length=120)
    tagline: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=5000)
    category: str = Field(min_length=1, max_length=100)
    contact_name: str = Field(min_length=1, max_length=120)
    logo_url: str | None = Field(default=None, max_length=2048)
    screenshot_url: str | None = Field(default=None, max_length=2048)
    public_contact_email: str | None = Field(default=None, max_length=320)
    launch_post: str | None = Field(default=None, max_length=300)
    long_description: str | None = Field(default=None, max_length=5000)

    @field_validator("url", "logo_url", "screenshot_url")
    @classmethod
    def public_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        parsed = urlsplit(value)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("Enter a public http or https URL")
        host = parsed.hostname.lower().rstrip(".")
        if host == "localhost" or host.endswith(".localhost") or host.endswith(".local"):
            raise ValueError("Enter a public website URL")
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            pass
        else:
            if not address.is_global:
                raise ValueError("Enter a public website URL")
        return value


class Product(ProductInput):
    id: UUID
    contact_email: str
    status: str
    created_at: datetime


class PublishRequest(BaseModel):
    directory_ids: list[UUID] | None = Field(default=None, max_length=200)


@router.get("/products", response_model=list[Product])
async def list_products(founder: Founder = Depends(require_founder)) -> list[dict]:
    async with user_session(founder.claims) as db:
        return await repo.list_products(db)


@router.post("/products", response_model=Product, status_code=201)
async def create_product(body: ProductInput, founder: Founder = Depends(require_founder)) -> dict:
    values = {**body.model_dump(), "user_id": founder.id, "contact_email": founder.email, "status": "ready"}
    try:
        async with user_session(founder.claims) as db:
            return await repo.create_product(db, values)
    except RejectedByDatabase as exc:
        if "two products" in exc.message.lower():
            raise HTTPException(409, "Free beta allows two products per founder") from None
        raise


@router.patch("/products/{product_id}", response_model=Product)
async def edit_product(
    product_id: UUID, body: ProductInput, founder: Founder = Depends(require_founder)
) -> dict:
    try:
        async with user_session(founder.claims) as db:
            product = await repo.update_product(
                db, product_id, body.model_dump(exclude_unset=True, exclude={"url"})  # url is not editable
            )
    except RejectedByDatabase as exc:
        if "Sent product details cannot change" in exc.message:
            raise HTTPException(
                409, "Sent product details cannot change. Edit the live listing at the directory."
            ) from None
        raise
    if product is None:
        raise HTTPException(404, "Product not found")
    return product


@router.post("/products/{product_id}/publish", status_code=201)
async def publish_product(
    product_id: UUID, body: PublishRequest | None = None, founder: Founder = Depends(require_founder)
) -> list[dict]:
    ids = body.directory_ids if body else None
    try:
        async with user_session(founder.claims) as db:
            created = await repo.publish(db, product_id, ids)
    except RejectedByDatabase as exc:
        low = exc.message.lower()
        if "not found" in low:
            raise HTTPException(404, "Product not found") from None
        if "sign in" in low or exc.sqlstate == "42501":
            raise HTTPException(403, "You do not have access to this product") from None
        raise HTTPException(409, exc.message) from None  # plan cap, ineligible channel, incomplete details
    # ponytail: no job/submission column holds request_id yet; this line (it carries
    # request_id) links the request to the submissions. Add a column when the worker needs it.
    log.info("product published", extra={
        "product_id": str(product_id), "submission_ids": [str(s["id"]) for s in created],
    })
    return created


@router.post("/products/{product_id}/launch-text")
async def generate_launch_text(product_id: UUID, founder: Founder = Depends(require_founder)) -> dict:
    if not _launch_text_allowed(founder.id):
        raise HTTPException(429, "Too many launch-text requests. Try again later.", headers={"Retry-After": "3600"})
    async with user_session(founder.claims) as db:
        product = await repo.product_copy_source(db, product_id)
    if product is None:
        raise HTTPException(404, "Product not found")
    return await launch_text.generate(product)


@router.get("/products/{product_id}/submissions")
async def product_submissions(product_id: UUID, founder: Founder = Depends(require_founder)) -> list[dict]:
    async with user_session(founder.claims) as db:
        return await repo.product_submissions(db, product_id)
