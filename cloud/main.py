from __future__ import annotations

import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from cloud.api.sync import router as sync_router
from cloud.api.training import router as training_router
from cloud.schemas import HealthResponse

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("nosignal.cloud")

app = FastAPI(
    title="no-signal Cloud API",
    version="0.1.0",
    description=(
        "Cloud backend for **no-signal** — the offline multi-turn diagnostic agent for field technicians.\n\n"
        "## Endpoints\n"
        "- **`/api/sync`** — Mobile devices POST unresolved HandoffReports here when connectivity "
        "is restored; GET `/api/sync/fault-trees` to pull updated knowledge back to Local RAG.\n"
        "- **`/api/training`** — Continuous-learning endpoints: fetch fresh web knowledge, "
        "ingest offline conversation logs, and generate fleet-wide training summaries.\n"
        "- **`/health`** — Simple liveness probe.\n\n"
        "Swagger UI: **/docs** | ReDoc: **/redoc**"
    ),
    contact={"name": "no-signal Team", "url": "https://github.com/AloysJehwin/no-signal"},
    license_info={"name": "MIT"},
)

# Allow mobile apps / dev UIs to call us
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sync_router)
app.include_router(training_router)


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health() -> HealthResponse:
    """Liveness probe — returns `{"status": "ok"}` when the server is up."""
    return HealthResponse()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8080")))
