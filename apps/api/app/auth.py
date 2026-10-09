"""Bearer-token verification. Local JWKS check first; Supabase /auth/v1/user as the fallback."""

import logging
import os
import time
from collections.abc import AsyncIterator
from uuid import UUID

import httpx
import jwt
from fastapi import Depends, Header, HTTPException
from pydantic import BaseModel, Field

from app.logging import request_context

log = logging.getLogger(__name__)

_ASYMMETRIC = {"RS256", "ES256", "EdDSA"}
_JWKS_TTL = 600  # seconds; an unknown kid refetches at most once a minute
_jwks: dict = {"keys": {}, "fetched": 0.0}


class Founder(BaseModel):
    id: UUID
    email: str
    claims: dict = Field(exclude=True)


async def auth_client() -> AsyncIterator[httpx.AsyncClient]:
    async with httpx.AsyncClient(timeout=5) as client:
        yield client


async def _signing_key(client: httpx.AsyncClient, base: str, kid: str):
    """The JWKS key for kid, or None when local verification is unavailable."""
    age = time.monotonic() - _jwks["fetched"]
    if age > _JWKS_TTL or (kid not in _jwks["keys"] and age > 60):
        try:
            response = await client.get(f"{base}/auth/v1/.well-known/jwks.json")
            response.raise_for_status()
            keys = jwt.PyJWKSet.from_dict(response.json()).keys
            _jwks.update(keys={k.key_id: k for k in keys}, fetched=time.monotonic())
        except (httpx.HTTPError, ValueError, KeyError, TypeError, jwt.PyJWKSetError) as exc:
            log.warning("jwks unavailable, using auth server", extra={"error": type(exc).__name__})
            _jwks["fetched"] = time.monotonic()  # do not refetch on every request while down
    return _jwks["keys"].get(kid)


async def _from_auth_server(client: httpx.AsyncClient, base: str, token: str) -> dict:
    key = os.getenv("SUPABASE_PUBLISHABLE_KEY")
    if not key:
        raise HTTPException(503, "Authentication is not configured")
    try:
        response = await client.get(
            f"{base}/auth/v1/user", headers={"apikey": key, "Authorization": f"Bearer {token}"}
        )
    except httpx.RequestError:
        raise HTTPException(503, "Authentication is unavailable") from None
    if response.status_code >= 500:
        raise HTTPException(503, "Authentication is unavailable")
    if response.status_code != 200:
        raise HTTPException(401, "Session expired")
    try:
        user = response.json()
        return {"sub": user["id"], "email": user.get("email") or "", "role": "authenticated",
                "aud": "authenticated"}
    except (ValueError, KeyError, TypeError):
        raise HTTPException(503, "Authentication returned an invalid user") from None


async def require_founder(
    authorization: str | None = Header(default=None),
    client: httpx.AsyncClient = Depends(auth_client),
) -> Founder:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Sign in to continue")
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(401, "Sign in to continue")
    base = (os.getenv("SUPABASE_URL") or "").rstrip("/")
    if not base:
        raise HTTPException(503, "Authentication is not configured")

    try:
        header = jwt.get_unverified_header(token)
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Session expired") from None
    alg, kid = header.get("alg"), header.get("kid")
    key = await _signing_key(client, base, kid) if alg in _ASYMMETRIC and kid else None
    if key is not None:
        try:
            claims = jwt.decode(
                token, key, algorithms=[key.algorithm_name], audience="authenticated",
                issuer=f"{base}/auth/v1",
                options={"require": ["exp", "sub"]},
            )
        except jwt.InvalidTokenError:
            raise HTTPException(401, "Session expired") from None
    else:  # legacy HS256 project, unknown kid, or JWKS down
        claims = await _from_auth_server(client, base, token)

    try:
        founder = Founder(id=claims["sub"], email=claims.get("email") or "", claims=claims)
    except ValueError:
        raise HTTPException(401, "Session expired") from None
    request_context.get({})["user_id"] = str(founder.id)
    return founder
