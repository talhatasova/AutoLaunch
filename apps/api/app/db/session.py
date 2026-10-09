"""Transactions that reproduce PostgREST's request context, so RLS and auth.uid() behave the same.

DATABASE_URL must be a session-mode connection (Supabase session pooler or direct, port 5432):
`set local` and asyncpg's prepared-statement cache both need one backend per transaction.
"""

import json
import os
from collections.abc import AsyncIterator
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from functools import cache

from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError, InterfaceError, OperationalError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


class DatabaseUnavailable(Exception):
    """The database is not configured or cannot be reached."""


class RejectedByDatabase(Exception):
    """A trigger, RPC, or policy refused the write. `message` is written for founders."""

    def __init__(self, message: str, sqlstate: str | None):
        super().__init__(message)
        self.message = message
        self.sqlstate = sqlstate


# raise_exception, check_violation, insufficient_privilege
_REJECTIONS = {"P0001", "23514", "42501"}


@cache
def _sessions() -> async_sessionmaker[AsyncSession]:
    raw = os.getenv("DATABASE_URL")
    if not raw:
        raise DatabaseUnavailable("DATABASE_URL is not set")
    url = make_url(raw).set(drivername="postgresql+asyncpg")
    engine = create_async_engine(url, pool_size=5, max_overflow=5, pool_pre_ping=True)
    return async_sessionmaker(engine, expire_on_commit=False)


def _pg_error(exc: DBAPIError) -> tuple[str | None, str]:
    cause = exc.orig.__cause__ if exc.orig is not None else None
    sqlstate = getattr(cause, "sqlstate", None) or getattr(exc.orig, "sqlstate", None)
    return sqlstate, getattr(cause, "message", None) or str(exc.orig)


@asynccontextmanager
async def _transaction(role: str, claims: dict) -> AsyncIterator[AsyncSession]:
    try:
        async with _sessions()() as session, session.begin():
            # role is one of two constants below, never caller input.
            await session.execute(text(f"set local role {role}"))
            await session.execute(
                text(
                    "select set_config('request.jwt.claims', :claims, true),"
                    " set_config('request.jwt.claim.sub', :sub, true),"
                    " set_config('request.jwt.claim.role', :role, true)"
                ),
                {"claims": json.dumps(claims), "sub": str(claims.get("sub") or ""), "role": role},
            )
            yield session
    except DBAPIError as exc:
        sqlstate, message = _pg_error(exc)
        if sqlstate in _REJECTIONS:
            raise RejectedByDatabase(message, sqlstate) from exc
        if isinstance(exc, (OperationalError, InterfaceError)):
            raise DatabaseUnavailable(message) from exc
        raise
    except OSError as exc:  # DNS, refused, timeout before a DBAPI connection exists
        raise DatabaseUnavailable(str(exc)) from exc


def user_session(claims: dict) -> AbstractAsyncContextManager[AsyncSession]:
    """One transaction as the signed-in founder: role authenticated, RLS on."""
    if not claims.get("sub"):
        raise ValueError("claims need a sub")
    # Pin the role: a bearer token can never select service_role here.
    return _transaction("authenticated", {**claims, "role": "authenticated"})


def service_session() -> AbstractAsyncContextManager[AsyncSession]:
    """One transaction as service_role: bypasses RLS. Use only for server-owned writes."""
    return _transaction("service_role", {"role": "service_role"})
