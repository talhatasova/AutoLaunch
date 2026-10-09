import logging
import os
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from app import logging as app_logging
from app.db.session import DatabaseUnavailable, RejectedByDatabase
from app.logging import request_context
from app.routes import account, catalog, dashboard, products, submissions

app_logging.configure()
log = logging.getLogger("app.request")

app = FastAPI(title="DirectoryLaunch API")
for module in (account, products, catalog, submissions, dashboard):
    app.include_router(module.router)


def _error(status: int, detail, headers: dict | None = None) -> JSONResponse:
    request_id = request_context.get({}).get("request_id")
    return JSONResponse(
        {"detail": jsonable_encoder(detail), "request_id": request_id}, status, headers=headers
    )


@app.exception_handler(HTTPException)
async def http_error(_: Request, exc: HTTPException) -> JSONResponse:
    return _error(exc.status_code, exc.detail, exc.headers)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    return _error(422, exc.errors())


@app.exception_handler(RejectedByDatabase)
async def rejected(_: Request, exc: RejectedByDatabase) -> JSONResponse:
    return _error(409, exc.message)


@app.exception_handler(DatabaseUnavailable)
async def database_down(_: Request, exc: DatabaseUnavailable) -> JSONResponse:
    log.error("database unavailable", extra={"error": str(exc)})
    return _error(503, "Database is unavailable")


@app.middleware("http")
async def request_log(request: Request, call_next):
    incoming = request.headers.get("x-request-id", "")
    request_id = incoming if 0 < len(incoming) <= 128 and incoming.isprintable() else uuid.uuid4().hex
    context = {"request_id": request_id}
    token = request_context.set(context)
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        log.exception("unhandled error")
        response = _error(500, "Something went wrong. Quote the request id if you contact support.")
    finally:
        request_context.reset(token)
    response.headers["x-request-id"] = request_id
    log.info("request", extra={
        **context,
        "method": request.method,
        "path": request.url.path,  # no query string: it can carry tokens
        "status": response.status_code,
        "duration_ms": round((time.perf_counter() - started) * 1000, 1),
    })
    return response


# Added last so it is outermost: error responses get CORS headers too.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("APP_ORIGIN", "http://localhost:3000")],
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Authorization", "Content-Type", "X-Request-Id"],
    expose_headers=["X-Request-Id"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
