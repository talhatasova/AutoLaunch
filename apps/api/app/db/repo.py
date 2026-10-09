"""Every query the API runs. Callers pass a session from app.db.session; RLS scopes it."""

from uuid import UUID

from sqlalchemy import Boolean, func, insert, literal, literal_column, select, text, true, update
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.db.models import App, Directory, FounderProfile, Submission, SubmissionEvent


def _row(obj) -> dict:
    return {attr.key: getattr(obj, attr.key) for attr in obj.__mapper__.column_attrs}


async def plan(db: AsyncSession) -> str:
    return await db.scalar(select(FounderProfile.plan).limit(1)) or "free"


async def list_products(db: AsyncSession) -> list[dict]:
    rows = await db.scalars(select(App).order_by(App.created_at.desc()).limit(2))
    return [_row(row) for row in rows]


async def create_product(db: AsyncSession, values: dict) -> dict:
    return _row(await db.scalar(insert(App).values(**values).returning(App)))


async def update_product(db: AsyncSession, product_id: UUID, values: dict) -> dict | None:
    row = await db.scalar(
        update(App).where(App.id == product_id).values(**values).returning(App),
        execution_options={"synchronize_session": False},
    )
    return _row(row) if row else None


async def product_copy_source(db: AsyncSession, product_id: UUID) -> dict | None:
    row = (await db.execute(
        select(App.name, App.tagline, App.description, App.url, App.category).where(App.id == product_id)
    )).mappings().first()
    return dict(row) if row else None


def _fields_sent(directory: Directory) -> list[str]:
    form, api = directory.form_schema or {}, directory.api_config or {}
    fields = [f.get("payload_key") for f in form.get("fields", [])]
    fields += [f.get("source") for f in form.get("extra_fields", [])]
    fields += list(api.get("field_map", {}).values())
    return sorted({f for f in fields if isinstance(f, str)})


async def catalog(db: AsyncSession) -> list[dict]:
    """Directories with eligibility computed by public.directory_eligible, the one rule."""
    eligible = func.public.directory_eligible(literal_column("directories"), type_=Boolean)
    rows = await db.execute(select(Directory, eligible).order_by(Directory.name))
    return [{**_row(d), "eligible": bool(ok), "fields_sent": _fields_sent(d)} for d, ok in rows]


async def publish(db: AsyncSession, product_id: UUID, directory_ids: list[UUID] | None) -> list[dict]:
    rows = await db.scalars(select(Submission).from_statement(
        text("select * from public.publish_product(cast(:app as uuid), cast(:ids as uuid[]))")
    ), {"app": product_id, "ids": directory_ids})
    return [_row(row) for row in rows]


async def retry(db: AsyncSession, submission_id: UUID) -> dict:
    row = await db.scalar(select(Submission).from_statement(
        text("select * from public.retry_failed_submission(cast(:id as uuid))")
    ), {"id": submission_id})
    return _row(row)


async def product_submissions(db: AsyncSession, product_id: UUID) -> list[dict]:
    rows = await db.scalars(
        select(Submission).where(Submission.app_id == product_id)
        .options(joinedload(Submission.directory), selectinload(Submission.events))
        .order_by(Submission.created_at.desc())
    )
    keys = ("id", "directory_id", "status", "submitted_at", "result_url", "error_message",
            "receipt_evidence", "created_at")
    return [{
        **{k: getattr(s, k) for k in keys},
        "directories": {"name": s.directory.name, "url": s.directory.url},
        "submission_events": [
            {"kind": e.kind, "message": e.message, "created_at": e.created_at} for e in s.events
        ],
    } for s in rows]


async def events(db: AsyncSession, submission_id: UUID) -> list[dict]:
    rows = await db.execute(
        select(SubmissionEvent.id, SubmissionEvent.kind, SubmissionEvent.message,
               SubmissionEvent.payload, SubmissionEvent.created_at)
        .where(SubmissionEvent.submission_id == submission_id)
        .order_by(SubmissionEvent.created_at)
    )
    return [dict(row) for row in rows.mappings()]


async def outcomes(db: AsyncSession) -> list[dict]:
    rows = await db.execute(
        select(Submission.id, Submission.app_id, Submission.directory_id, Submission.status,
               Directory.name.label("directory_name"))
        .join(Directory, Directory.id == Submission.directory_id)
    )
    return [dict(row) for row in rows.mappings()]


async def dashboard(db: AsyncSession) -> tuple[list[dict], list[dict]]:
    """Two queries: products, then submissions with their channel and latest event."""
    products = await db.execute(select(App.id, App.name, App.url).order_by(App.created_at.desc()))
    last = (
        select(SubmissionEvent.kind, SubmissionEvent.created_at)
        .where(SubmissionEvent.submission_id == Submission.id)
        .order_by(SubmissionEvent.created_at.desc()).limit(1).lateral("last_event")
    )
    submissions = await db.execute(
        select(
            Submission.id, Submission.app_id, Submission.status, Submission.result_url,
            Submission.receipt_evidence, Submission.error_message, Submission.created_at,
            Directory.slug, Directory.name, Directory.channel_type, Directory.automation,
            Directory.price_kind,
            last.c.kind.label("last_event_kind"), last.c.created_at.label("last_event_at"),
        )
        .join(Directory, Directory.id == Submission.directory_id)
        .outerjoin(last, true())
        .order_by(Submission.created_at.desc())
    )
    return [dict(r) for r in products.mappings()], [dict(r) for r in submissions.mappings()]


async def submission_status(db: AsyncSession, submission_id: UUID) -> str | None:
    return await db.scalar(select(Submission.status).where(Submission.id == submission_id))


async def request_live_check(db: AsyncSession, submission_id: UUID, owner_id: UUID, url: str) -> bool:
    """Service role: queue the founder's URL for the worker's verifier (it reads
    receipt_evidence.candidate_url on its next pass). Ownership is checked here, not by RLS."""
    evidence = func.coalesce(Submission.receipt_evidence, literal({}, JSONB))
    queued = await db.scalar(
        update(Submission)
        .where(Submission.id == submission_id, Submission.app_id == App.id, App.user_id == owner_id,
               Submission.status.in_(("pending_review", "unconfirmed")))
        .values(
            receipt_evidence=evidence.op("||", return_type=JSONB)(literal({"candidate_url": url}, JSONB)),
            next_live_check_at=func.now(),
        )
        .returning(Submission.id),
        execution_options={"synchronize_session": False},
    )
    return queued is not None
