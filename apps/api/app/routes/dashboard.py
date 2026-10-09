from fastapi import APIRouter, Depends

from app.auth import Founder, require_founder
from app.db import repo
from app.db.session import user_session

router = APIRouter(prefix="/api/v1")

_DISPLAY = {
    "queued": "Queued", "running": "Sending", "pending_review": "Submitted", "succeeded": "Submitted",
    "live": "Live", "unconfirmed": "Needs attention", "needs_manual": "Needs attention",
    "failed": "Failed", "not_published": "Not published",
}
_COUNT_KEY = {
    "queued": "queued", "running": "sending", "pending_review": "submitted", "succeeded": "submitted",
    "live": "live", "unconfirmed": "needs_attention", "needs_manual": "needs_attention",
    "failed": "failed", "not_published": "not_published",
}
_DIRECTORY_KEYS = ("slug", "name", "channel_type", "automation", "price_kind")


@router.get("/analytics")
async def analytics(founder: Founder = Depends(require_founder)) -> dict:
    async with user_session(founder.claims) as db:
        rows = await repo.outcomes(db)
    statuses = ("queued", "running", "pending_review", "unconfirmed", "live", "failed")
    counts = {status: sum(row["status"] == status for row in rows) for status in statuses}
    by_directory: dict = {}
    by_product: dict = {}
    for row in rows:
        item = by_directory.setdefault(row["directory_id"], {
            "directory_id": row["directory_id"], "name": row["directory_name"],
            "total": 0, "live": 0, "pending_review": 0, "unconfirmed": 0, "failed": 0,
        })
        product_item = by_product.setdefault(row["app_id"], {
            "product_id": row["app_id"], "total": 0,
            "live": 0, "pending_review": 0, "unconfirmed": 0, "failed": 0,
        })
        for bucket in (item, product_item):
            bucket["total"] += 1
            if row["status"] in bucket:
                bucket[row["status"]] += 1
    return {
        "total": len(rows), "counts": counts,
        "by_directory": sorted(by_directory.values(), key=lambda item: item["name"]),
        "by_product": list(by_product.values()),
    }


@router.get("/dashboard")
async def dashboard(founder: Founder = Depends(require_founder)) -> dict:
    async with user_session(founder.claims) as db:
        product_rows, submission_rows = await repo.dashboard(db)
    products = {
        p["id"]: {**p, "counts": dict.fromkeys(set(_COUNT_KEY.values()), 0), "submissions": []}
        for p in product_rows
    }
    attention = []
    for row in submission_rows:
        product = products.get(row["app_id"])
        if product is None:
            continue
        status = row["status"]
        directory = {key: row[key] for key in _DIRECTORY_KEYS}
        product["submissions"].append({
            "id": row["id"],
            "directory": directory,
            "status": status,
            "display_state": _DISPLAY.get(status, status),
            "receipt_url": (row["receipt_evidence"] or {}).get("observed_url"),
            "live_url": row["result_url"] if status == "live" else None,
            "last_event_at": row["last_event_at"] or row["created_at"],
            "last_event_kind": row["last_event_kind"],
        })
        product["counts"][_COUNT_KEY.get(status, "failed")] += 1
        if _COUNT_KEY.get(status) == "needs_attention":
            attention.append({
                "submission_id": row["id"], "product_id": product["id"], "product_name": product["name"],
                "directory": directory, "status": status,
                "reason": row["error_message"] or "We could not confirm this listing is live",
            })
    return {"products": list(products.values()), "needs_attention": attention}
