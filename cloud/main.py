from __future__ import annotations

import logging
import os
from datetime import datetime

from dotenv import load_dotenv
from fastapi import FastAPI, Query

from cloud.agents.pipeline import run_pipeline
from cloud.fleet_store.store import FleetKnowledgeStore
from cloud.media.nb2_lite import generate_illustration
from cloud.media.omni_flash import generate_video
from cloud.schemas import FaultTreeEntry, HandoffReport, HealthResponse, SyncResponse

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("nosignal.cloud")

app = FastAPI(title="nosignal-cloud", version="0.1.0")
store = FleetKnowledgeStore()


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse()


@app.post("/sync", response_model=SyncResponse)
async def sync(reports: list[HandoffReport]) -> SyncResponse:
    distilled: list[FaultTreeEntry] = []
    rejected = 0

    for report in reports:
        try:
            entry = await run_pipeline(report, store=store)
        except Exception:
            logger.exception("pipeline failed for session %s", report.session_id)
            rejected += 1
            continue

        if entry is None:
            rejected += 1
            continue

        entry.illustration_path = await generate_illustration(entry)
        entry.video_path = await generate_video(entry)
        distilled.append(entry)

    return SyncResponse(
        accepted=len(reports),
        distilled=len(distilled),
        rejected=rejected,
        entries=distilled,
    )


@app.get("/fault-trees", response_model=list[FaultTreeEntry])
async def fault_trees(
    since: datetime | None = Query(default=None, description="ISO-8601 lower bound"),
) -> list[FaultTreeEntry]:
    return store.list_entries(since=since)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8080")))
