"""ORM mirror of supabase/migrations. The migrations are the source of truth: when a
migration changes a mapped table, change the model in the same commit. Never autogenerate."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import ARRAY, Boolean, DateTime, ForeignKey, SmallInteger, Text, text
from sqlalchemy.dialects.postgresql import ENUM, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def _enum(name: str, *values: str) -> ENUM:
    return ENUM(*values, name=name, create_type=False)


APP_STATUS = _enum("app_status", "draft", "ready", "launching", "done", "submitted")
DIRECTORY_STATUS = _enum("directory_status", "active", "broken")
SUBMISSION_METHOD = _enum("submission_method", "api", "form", "manual")
SUBMISSION_STATUS = _enum(
    "submission_status", "queued", "running", "succeeded", "failed", "needs_manual",
    "pending_review", "unconfirmed", "live", "not_published",
)
EVENT_KIND = _enum(
    "submission_event_kind", "queued", "started", "field_filled", "submitted", "succeeded",
    "challenge_detected", "manual_required", "selector_missing", "retry_scheduled", "failed",
    "receipt", "unconfirmed", "live", "not_published",
)
_NEW_ID = text("gen_random_uuid()")
_NOW = text("now()")


class Base(DeclarativeBase):
    type_annotation_map = {datetime: DateTime(timezone=True), dict: JSONB, str: Text}


class App(Base):
    __tablename__ = "apps"
    __table_args__ = {"schema": "public"}

    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=_NEW_ID)
    user_id: Mapped[UUID]
    url: Mapped[str]
    name: Mapped[str]
    tagline: Mapped[str | None]
    description: Mapped[str | None]
    logo_url: Mapped[str | None]
    screenshot_url: Mapped[str | None]
    status: Mapped[str] = mapped_column(APP_STATUS, server_default="draft")
    scraped_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(server_default=_NOW)
    category: Mapped[str | None]
    contact_name: Mapped[str | None]
    contact_email: Mapped[str | None]
    public_contact_email: Mapped[str | None]
    launch_post: Mapped[str | None]
    long_description: Mapped[str | None]
    company_profile: Mapped[dict | None]


class Directory(Base):
    __tablename__ = "directories"
    __table_args__ = {"schema": "public"}

    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=_NEW_ID)
    slug: Mapped[str]
    name: Mapped[str]
    url: Mapped[str]
    submission_url: Mapped[str]
    tier: Mapped[int] = mapped_column(SmallInteger)
    submission_method: Mapped[str] = mapped_column(SUBMISSION_METHOD)
    requires_captcha: Mapped[bool] = mapped_column(Boolean, server_default="false")
    category: Mapped[str]
    domain_rating: Mapped[int | None] = mapped_column(SmallInteger)
    api_config: Mapped[dict | None]
    form_schema: Mapped[dict | None]
    evidence: Mapped[dict]
    last_verified_at: Mapped[datetime | None]
    status: Mapped[str] = mapped_column(DIRECTORY_STATUS, server_default="active")
    created_at: Mapped[datetime] = mapped_column(server_default=_NOW)
    requires_consent: Mapped[bool] = mapped_column(server_default="false")
    requires_profile_fields: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}")
    price_kind: Mapped[str] = mapped_column(server_default="unknown")
    price_note: Mapped[str | None]
    price_source_url: Mapped[str | None]
    price_checked_at: Mapped[datetime | None]
    obligation: Mapped[str | None]
    terms_url: Mapped[str | None]
    automation_verified_at: Mapped[datetime | None]
    automation_checked_at: Mapped[datetime | None]
    automation_check_note: Mapped[str | None]
    receipt_verified: Mapped[bool] = mapped_column(server_default="false")
    rules_permit_automation: Mapped[bool] = mapped_column(server_default="false")
    channel_type: Mapped[str] = mapped_column(server_default="directory")
    automation: Mapped[str] = mapped_column(server_default="manual")
    terms_prohibit_automation: Mapped[bool] = mapped_column(server_default="false")
    challenge_kind: Mapped[str] = mapped_column(server_default="none")
    needs_platform_account: Mapped[bool] = mapped_column(server_default="false")
    needs_email_verification: Mapped[bool] = mapped_column(server_default="false")
    live_lookup: Mapped[dict | None]
    recipe: Mapped[dict | None]


class Submission(Base):
    __tablename__ = "submissions"
    __table_args__ = {"schema": "public"}

    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=_NEW_ID)
    app_id: Mapped[UUID] = mapped_column(ForeignKey("public.apps.id"))
    directory_id: Mapped[UUID] = mapped_column(ForeignKey("public.directories.id"))
    status: Mapped[str] = mapped_column(SUBMISSION_STATUS, server_default="queued")
    submitted_at: Mapped[datetime | None]
    result_url: Mapped[str | None]
    error_message: Mapped[str | None]
    attempt_count: Mapped[int] = mapped_column(server_default="0")
    next_attempt_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(server_default=_NOW)
    consent_granted_at: Mapped[datetime | None]
    approved_payload: Mapped[dict | None]
    approved_at: Mapped[datetime | None]
    obligation_confirmed_at: Mapped[datetime | None]
    receipt_evidence: Mapped[dict | None]
    live_checked_at: Mapped[datetime | None]
    next_live_check_at: Mapped[datetime | None]
    live_check_deadline: Mapped[datetime | None]
    challenge_cost_cents: Mapped[int] = mapped_column(server_default="0")
    inbox_address: Mapped[str | None]

    directory: Mapped[Directory] = relationship(lazy="raise")
    events: Mapped[list["SubmissionEvent"]] = relationship(
        lazy="raise", order_by="SubmissionEvent.created_at"
    )


class SubmissionEvent(Base):
    __tablename__ = "submission_events"
    __table_args__ = {"schema": "public"}

    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=_NEW_ID)
    submission_id: Mapped[UUID] = mapped_column(ForeignKey("public.submissions.id"))
    kind: Mapped[str] = mapped_column(EVENT_KIND)
    message: Mapped[str] = mapped_column(server_default="")
    payload: Mapped[dict | None]
    created_at: Mapped[datetime] = mapped_column(server_default=_NOW)


class FounderProfile(Base):
    __tablename__ = "founder_profiles"
    __table_args__ = {"schema": "public"}

    user_id: Mapped[UUID] = mapped_column(primary_key=True)
    plan: Mapped[str] = mapped_column(server_default="free")
    created_at: Mapped[datetime] = mapped_column(server_default=_NOW)
