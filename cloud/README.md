# nosignal-cloud

Cloud service for FieldFix. Accepts `HandoffReport`s from reconnecting mobile
devices, runs the Research -> Validation -> Distillation agent pipeline
(Gemini 2.5 Flash with web-search grounding), and serves the aggregated
fault-tree back to the fleet.

## Run

```bash
pip install -e ".[dev]"
cp .env.example .env  # fill in keys
uvicorn cloud.main:app --reload --port 8080
```

Run from the repo root so `cloud.main:app` resolves.

## Environment

- `GEMINI_API_KEY` — required for the Research and Validation agents (Gemini 2.5 Flash).
- `GOOGLE_SEARCH_API_KEY` — optional; used only when explicit web-search tooling is wired in instead of Gemini's built-in grounding.

Missing keys degrade to offline stub responses so the demo still boots.

## Endpoints

- `POST /sync` — body: `list[HandoffReport]`. Returns per-report processing status (`accepted`, `distilled`, `rejected`) plus the newly distilled `FaultTreeEntry` list.
- `GET /fault-trees?since=<iso-8601>` — pull-sync from mobile. `since` is optional; when set, only entries added at or after that timestamp are returned.
- `GET /health` — liveness.

## Layout

```
cloud/
  main.py                  # FastAPI app
  schemas.py               # Pydantic v2 models (mirror ARCHITECTURE.md §3.3)
  agents/
    research/agent.py      # ResearchAgent (Gemini + web search)
    validation/agent.py    # ValidationAgent (rejection short-circuits pipeline)
    distillation/agent.py  # DistillationAgent (compresses to fault-tree JSON)
    pipeline.py            # run_pipeline() orchestration
  fleet_store/store.py     # in-memory FleetKnowledgeStore (Firestore swap TODO)
  media/
    nb2_lite.py            # illustration stub
    omni_flash.py          # video stub
  tests/test_pipeline.py   # rejection + happy path
```
