"""
cloud/api/sync.py
-----------------
Enhanced sync endpoints that the mobile SyncQueue hits when the device
regains connectivity.

Routes
  POST /api/sync/               – receive a batch of HandoffReports, run the
                                  Research→Validation→Distillation pipeline
  GET  /api/sync/fault-trees    – return all fleet-store entries (optionally
                                  filtered by ?since=<ISO-8601>)
  GET  /api/sync/queue-status   – how many pending reports are in the store
  DELETE /api/sync/fault-trees/{fault_id} – remove a poisoned entry from the
                                  fleet store (admin use)
"""
from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query

from cloud.agents.pipeline import run_pipeline
from cloud.fleet_store.store import FleetKnowledgeStore
from cloud.media.nb2_lite import generate_illustration
from cloud.media.omni_flash import generate_video
from cloud.schemas import FaultTreeEntry, HandoffReport, SyncResponse

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/sync",
    tags=["Sync"],
    responses={
        200: {"description": "Successful operation"},
        422: {"description": "Validation error"},
    },
)


def get_store() -> FleetKnowledgeStore:
    return FleetKnowledgeStore()


@router.post(
    "/",
    response_model=SyncResponse,
    summary="Sync unresolved device reports",
    description=(
        "Receives a batch of HandoffReport objects from the mobile Sync Queue. "
        "Each report is run through the Research → Validation → Distillation pipeline. "
        "Validated entries are enriched with illustrations and video clips and stored "
        "in the Fleet Knowledge Store, ready to be pulled by all devices on their next sync."
    ),
)
async def sync_reports(
    reports: list[HandoffReport],
    store: FleetKnowledgeStore = Depends(get_store),
) -> SyncResponse:
    distilled: list[FaultTreeEntry] = []
    rejected = 0

    for report in reports:
        logger.info("processing report session=%s equipment=%s", report.session_id, report.equipment_type)
        try:
            entry = await run_pipeline(report, store=store)
        except Exception:
            logger.exception("pipeline failed for session %s", report.session_id)
            rejected += 1
            continue

        if entry is None:
            rejected += 1
            continue

        # Media enrichment — failures are non-fatal (entry still stored)
        entry.illustration_path = await generate_illustration(entry)
        entry.video_path = await generate_video(entry)
        distilled.append(entry)
        logger.info("distilled entry fault_id=%s", entry.fault_id)

    return SyncResponse(
        accepted=len(reports),
        distilled=len(distilled),
        rejected=rejected,
        entries=distilled,
    )


@router.get(
    "/fault-trees",
    response_model=list[FaultTreeEntry],
    summary="Pull fleet fault-tree knowledge",
    description=(
        "Returns all fault-tree entries currently in the Fleet Knowledge Store. "
        "Devices call this after a successful sync to update their Local RAG store. "
        "Optionally filter by ?since=<ISO-8601 datetime> to get only new entries."
    ),
)
async def get_fault_trees(
    since: datetime | None = Query(
        default=None,
        description="ISO-8601 lower bound — return only entries created after this timestamp.",
    ),
    store: FleetKnowledgeStore = Depends(get_store),
) -> list[FaultTreeEntry]:
    return store.list_entries(since=since)


@router.get(
    "/queue-status",
    summary="Fleet store status",
    description="Returns the total number of fault-tree entries currently stored fleet-wide.",
)
async def queue_status(store: FleetKnowledgeStore = Depends(get_store)) -> dict:
    entries = store.list_entries()
    return {"total_entries": len(entries), "status": "ok"}


@router.delete(
    "/fault-trees/{fault_id}",
    summary="Remove a fault-tree entry",
    description="Admin endpoint — removes a single entry from the Fleet Knowledge Store by fault_id.",
)
async def delete_fault_tree(
    fault_id: str,
    store: FleetKnowledgeStore = Depends(get_store),
) -> dict:
    entries = store.list_entries()
    existing = next((e for e in entries if e.fault_id == fault_id), None)
    if existing is None:
        raise HTTPException(status_code=404, detail=f"No entry with fault_id='{fault_id}'")
    store.remove_entry(fault_id)
    return {"deleted": fault_id, "status": "ok"}
