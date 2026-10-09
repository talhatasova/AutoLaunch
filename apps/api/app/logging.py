"""Structured JSON logs. Never pass tokens, secrets, or request bodies to a logger."""

import json
import logging
import sys
from contextvars import ContextVar
from datetime import datetime, timezone

# One mutable dict per request: the auth dependency adds user_id to it, and the dict is
# shared by reference even when Starlette copies the context into a child task.
request_context: ContextVar[dict] = ContextVar("request_context")

_RESERVED = set(vars(logging.makeLogRecord({}))) | {"message", "asctime"}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        line = {
            "ts": datetime.fromtimestamp(record.created, timezone.utc).isoformat(),
            "level": record.levelname.lower(),
            "logger": record.name,
            "msg": record.getMessage(),
            **request_context.get({}),
            **{k: v for k, v in vars(record).items() if k not in _RESERVED},
        }
        if record.exc_info:
            line["exc"] = self.formatException(record.exc_info)
        return json.dumps(line, default=str)


def configure() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(logging.INFO)
    # uvicorn's own access log would duplicate the per-request line in plain text.
    logging.getLogger("uvicorn.access").disabled = True
    logging.getLogger("httpx").setLevel(logging.WARNING)
    for name in ("uvicorn", "uvicorn.error"):
        logging.getLogger(name).handlers[:] = []
        logging.getLogger(name).propagate = True
