import asyncio
import os
import ipaddress
from collections.abc import AsyncIterator
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit
from uuid import UUID

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, field_validator


app = FastAPI(title="DirectoryLaunch API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("APP_ORIGIN", "http://localhost:3000")],
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Authorization", "Content-Type"],
)


class Founder(BaseModel):
    id: UUID
    email: str


class Session(Founder):
    token: str = Field(exclude=True)


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
    created_at: str


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
    fields_sent: list[str] = []
    eligible: bool = False

    def with_eligibility(self) -> "Directory":
        current = datetime.now(timezone.utc) - timedelta(days=7)
        self.eligible = (
            self.price_kind == "free"
            and self.status == "active"
            and self.tier == 2
            and not self.requires_captcha
            and not self.requires_profile_fields
            and self.receipt_verified
            and self.rules_permit_automation
            and (not self.requires_consent or self.terms_url is not None)
            and self.automation_verified_at is not None
            and self.price_checked_at is not None
            and self.price_checked_at >= current
            and self.last_verified_at is not None
            and self.last_verified_at >= current
        )
        return self


async def auth_client() -> AsyncIterator[httpx.AsyncClient]:
    async with httpx.AsyncClient(timeout=5) as client:
        yield client


async def require_founder(
    authorization: str | None = Header(default=None),
    client: httpx.AsyncClient = Depends(auth_client),
) -> Session:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Sign in to continue")
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(401, "Sign in to continue")

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_PUBLISHABLE_KEY")
    if not url or not key:
        raise HTTPException(503, "Authentication is not configured")
    try:
        response = await client.get(
            f"{url.rstrip('/')}/auth/v1/user",
            headers={"apikey": key, "Authorization": f"Bearer {token}"},
        )
    except httpx.RequestError:
        raise HTTPException(503, "Authentication is unavailable") from None
    if response.status_code >= 500:
        raise HTTPException(503, "Authentication is unavailable")
    if response.status_code != 200:
        raise HTTPException(401, "Session expired")
    try:
        return Session.model_validate({**response.json(), "token": token})
    except ValueError:
        raise HTTPException(503, "Authentication returned an invalid user") from None


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/v1/me", response_model=Founder)
async def me(founder: Session = Depends(require_founder)) -> Founder:
    return Founder(id=founder.id, email=founder.email)


async def products_request(
    client: httpx.AsyncClient, founder: Session, method: str, path: str, **kwargs: object
) -> httpx.Response:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_PUBLISHABLE_KEY")
    if not url or not key:
        raise HTTPException(503, "Database is not configured")
    try:
        return await client.request(
            method,
            f"{url.rstrip('/')}/rest/v1/{path}",
            headers={
                "apikey": key,
                "Authorization": f"Bearer {founder.token}",
                "Prefer": "return=representation",
            },
            **kwargs,
        )
    except httpx.RequestError:
        raise HTTPException(503, "Database is unavailable") from None


@app.get("/api/v1/products", response_model=list[Product])
async def list_products(
    founder: Session = Depends(require_founder), client: httpx.AsyncClient = Depends(auth_client)
) -> list[Product]:
    response = await products_request(
        client, founder, "GET", "apps",
        params={
            "select": "id,url,name,tagline,description,category,contact_name,contact_email,logo_url,screenshot_url,status,created_at",
            "order": "created_at.desc",
            "limit": "2",
        },
    )
    if response.status_code != 200:
        raise HTTPException(503, "Could not load products")
    return [Product.model_validate(row) for row in response.json()]


@app.post("/api/v1/products", response_model=Product, status_code=201)
async def create_product(
    body: ProductInput,
    founder: Session = Depends(require_founder),
    client: httpx.AsyncClient = Depends(auth_client),
) -> Product:
    response = await products_request(
        client, founder, "POST", "apps",
        json={
            **body.model_dump(),
            "user_id": str(founder.id),
            "contact_email": founder.email,
            "status": "ready",
        },
    )
    if response.status_code == 409 or (
        response.status_code == 400 and "two products" in response.text.lower()
    ):
        raise HTTPException(409, "Free beta allows two products per founder")
    if response.status_code != 201:
        raise HTTPException(503, "Could not save product")
    return Product.model_validate(response.json()[0])


@app.patch("/api/v1/products/{product_id}", response_model=Product)
async def edit_product(
    product_id: UUID,
    body: ProductInput,
    founder: Session = Depends(require_founder),
    client: httpx.AsyncClient = Depends(auth_client),
) -> Product:
    response = await products_request(
        client, founder, "PATCH", "apps",
        params={"id": f"eq.{product_id}"}, json=body.model_dump(),
    )
    if response.status_code == 400 and "Sent product details cannot change" in response.text:
        raise HTTPException(409, "Sent product details cannot change. Edit the live listing at the directory.")
    if response.status_code != 200:
        raise HTTPException(503, "Could not update product")
    if not response.json():
        raise HTTPException(404, "Product not found")
    return Product.model_validate(response.json()[0])


@app.get("/api/v1/directories", response_model=list[Directory])
async def list_directories(
    founder: Session = Depends(require_founder), client: httpx.AsyncClient = Depends(auth_client)
) -> list[Directory]:
    response = await products_request(
        client, founder, "GET", "directories",
        params={
            "select": "id,slug,name,url,category,price_kind,price_note,price_source_url,price_checked_at,obligation,terms_url,last_verified_at,automation_verified_at,receipt_verified,rules_permit_automation,requires_consent,requires_profile_fields,tier,requires_captcha,status,form_schema,api_config",
            "order": "name.asc",
        },
    )
    if response.status_code != 200:
        raise HTTPException(503, "Could not load directories")
    result = []
    for row in response.json():
        fields = [field.get("payload_key") for field in (row.get("form_schema") or {}).get("fields", [])]
        fields += [field.get("source") for field in (row.get("form_schema") or {}).get("extra_fields", [])]
        fields += list((row.get("api_config") or {}).get("field_map", {}).values())
        result.append(Directory.model_validate({
            **row, "fields_sent": sorted({field for field in fields if isinstance(field, str)})
        }).with_eligibility())
    return result


class ApprovalTarget(BaseModel):
    directory_id: UUID
    consent: bool = False
    obligation_confirmed: bool = False


class Approval(BaseModel):
    targets: list[ApprovalTarget] = Field(min_length=1, max_length=2)
    reviewed_contact_email: str = Field(min_length=3, max_length=320)


@app.post("/api/v1/products/{product_id}/submissions", status_code=201)
async def approve_submissions(
    product_id: UUID,
    body: Approval,
    founder: Session = Depends(require_founder),
    client: httpx.AsyncClient = Depends(auth_client),
) -> list[dict]:
    response = await products_request(
        client, founder, "POST", "rpc/approve_targets",
        json={
            "p_app_id": str(product_id),
            "p_targets": [target.model_dump(mode="json") for target in body.targets],
            "p_reviewed_contact_email": body.reviewed_contact_email,
        },
    )
    if response.status_code == 400:
        try:
            message = response.json().get("message", "Selection cannot be approved")
        except ValueError:
            message = "Selection cannot be approved"
        raise HTTPException(409, message)
    if response.status_code != 200:
        raise HTTPException(503, "Could not approve submissions")
    return response.json()


@app.get("/api/v1/products/{product_id}/submissions")
async def product_submissions(
    product_id: UUID,
    founder: Session = Depends(require_founder),
    client: httpx.AsyncClient = Depends(auth_client),
) -> list[dict]:
    response = await products_request(
        client, founder, "GET", "submissions",
        params={
            "select": "id,directory_id,status,submitted_at,result_url,error_message,receipt_evidence,created_at,directories(name,url),submission_events(kind,message,created_at)",
            "app_id": f"eq.{product_id}",
            "order": "created_at.desc",
        },
    )
    if response.status_code != 200:
        raise HTTPException(503, "Could not load submissions")
    return response.json()


@app.post("/api/v1/submissions/{submission_id}/retry")
async def retry_submission(
    submission_id: UUID,
    founder: Session = Depends(require_founder),
    client: httpx.AsyncClient = Depends(auth_client),
) -> dict:
    response = await products_request(
        client, founder, "POST", "rpc/retry_failed_submission",
        json={"p_submission_id": str(submission_id)},
    )
    if response.status_code == 400:
        raise HTTPException(409, response.json().get("message", "This submission cannot be retried"))
    if response.status_code != 200:
        raise HTTPException(503, "Could not retry submission")
    return response.json()


class ListingEvidence(BaseModel):
    url: str = Field(max_length=2048)


@app.post("/api/v1/submissions/{submission_id}/verify-live")
async def verify_live(
    submission_id: UUID,
    body: ListingEvidence,
    founder: Session = Depends(require_founder),
    client: httpx.AsyncClient = Depends(auth_client),
) -> dict:
    owned = await products_request(
        client, founder, "GET", "submissions",
        params={"select": "id,app_id,directory_id,status", "id": f"eq.{submission_id}"},
    )
    if owned.status_code != 200 or not owned.json():
        raise HTTPException(404, "Submission not found")
    submission = owned.json()[0]
    if submission["status"] not in {"pending_review", "unconfirmed"}:
        raise HTTPException(409, "This submission is not awaiting publication evidence")

    product_response, directory_response = await asyncio.gather(
        products_request(client, founder, "GET", "apps", params={
            "select": "url", "id": f"eq.{submission['app_id']}"
        }),
        products_request(client, founder, "GET", "directories", params={
            "select": "url", "id": f"eq.{submission['directory_id']}"
        }),
    )
    if product_response.status_code != 200 or directory_response.status_code != 200:
        raise HTTPException(503, "Could not load listing context")
    if not product_response.json() or not directory_response.json():
        raise HTTPException(404, "Listing context not found")

    verifier_url = os.getenv("WEB_INTERNAL_URL")
    verifier_key = os.getenv("INTERNAL_VERIFY_KEY")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    supabase_url = os.getenv("SUPABASE_URL")
    if not verifier_url or not verifier_key or not service_key or not supabase_url:
        raise HTTPException(503, "Listing verification is not configured")
    try:
        checked = await client.post(
            f"{verifier_url.rstrip('/')}/api/internal/verify-listing",
            headers={"x-internal-key": verifier_key},
            json={
                "listing_url": body.url,
                "product_url": product_response.json()[0]["url"],
                "directory_url": directory_response.json()[0]["url"],
            },
        )
    except httpx.RequestError:
        raise HTTPException(503, "Listing verification is unavailable") from None
    if checked.status_code != 200:
        raise HTTPException(422, "Could not verify that this directory has a public listing for the product")
    evidence = checked.json()
    try:
        updated = await client.post(
            f"{supabase_url.rstrip('/')}/rest/v1/rpc/confirm_live_listing",
            headers={
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
            },
            json={
                "p_submission_id": str(submission_id), "p_owner_id": str(founder.id),
                "p_url": evidence["url"], "p_checked_at": evidence["checked_at"],
            },
        )
    except httpx.RequestError:
        raise HTTPException(503, "Could not save live listing") from None
    if updated.status_code == 400:
        raise HTTPException(409, "Submission changed while verifying")
    if updated.status_code != 200:
        raise HTTPException(503, "Could not save live listing")
    return {"status": "live", **evidence}


@app.get("/api/v1/analytics")
async def analytics(
    founder: Session = Depends(require_founder),
    client: httpx.AsyncClient = Depends(auth_client),
) -> dict:
    response = await products_request(
        client, founder, "GET", "submissions",
        params={"select": "id,app_id,directory_id,status,directories(name)"},
    )
    if response.status_code != 200:
        raise HTTPException(503, "Could not load outcomes")
    rows = response.json()
    statuses = ("queued", "running", "pending_review", "unconfirmed", "live", "failed")
    counts = {status: sum(row["status"] == status for row in rows) for status in statuses}
    by_directory: dict[str, dict] = {}
    by_product: dict[str, dict] = {}
    for row in rows:
        item = by_directory.setdefault(row["directory_id"], {
            "directory_id": row["directory_id"],
            "name": (row.get("directories") or {}).get("name", "Directory"),
            "total": 0, "live": 0, "pending_review": 0, "unconfirmed": 0, "failed": 0,
        })
        item["total"] += 1
        if row["status"] in item:
            item[row["status"]] += 1
        product_item = by_product.setdefault(row["app_id"], {
            "product_id": row["app_id"], "total": 0,
            "live": 0, "pending_review": 0, "unconfirmed": 0, "failed": 0,
        })
        product_item["total"] += 1
        if row["status"] in product_item:
            product_item[row["status"]] += 1
    return {
        "total": len(rows), "counts": counts,
        "by_directory": sorted(by_directory.values(), key=lambda item: item["name"]),
        "by_product": list(by_product.values()),
    }
