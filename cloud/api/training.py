"""
cloud/api/training.py
----------------------
Continuous-learning endpoints.

Concept
-------
When the device reconnects, it POSTs offline conversation logs and the symptom
topics it expects to encounter. The cloud uses Gemini (web-search grounded) to
fetch up-to-date repair knowledge and generates new FaultTreeEntry objects that
are pushed back to Local RAG on the device's next sync.

Credentials are loaded from cloud/secrets.json (gitignored, never committed).
See cloud/secrets.json.example for the expected shape.

Routes
  POST /api/training/continuous-learn      – fetch web knowledge + mint FaultTreeEntry
  POST /api/training/offline-conversations – ingest offline logs; extract learning signal
  POST /api/training/gemma-infer           – run inference on Cloud-hosted Gemma 3 4B
  GET  /api/training/status                – fleet + model status
  POST /api/training/retrain-from-fleet    – LoRA-style summary from fleet data
"""
from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException

from cloud.fleet_store.store import FleetKnowledgeStore
from cloud.fleet_store.training_logs import GcsTrainingLogStore
from cloud.schemas import FaultTreeEntry, Hypothesis, TrainingData, TrainingResponse, TrainingLog

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Load credentials from secrets.json (gitignored)
# ──────────────────────────────────────────────────────────────────────────────

_SECRETS_PATH = Path(__file__).resolve().parent.parent / "secrets.json"


def _load_secrets() -> dict[str, Any]:
    """Load credentials from secrets.json; fall back gracefully if missing."""
    if _SECRETS_PATH.exists():
        with _SECRETS_PATH.open() as f:
            return json.load(f)
    logger.warning("secrets.json not found at %s — falling back to env vars", _SECRETS_PATH)
    return {}


_secrets = _load_secrets()

# Gemini AI Studio (research + distillation backbone)
_GEMINI_API_KEY: str = _secrets.get("gemini_api_key") or os.getenv("GEMINI_API_KEY", "")
_GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/"
    f"models/gemini-flash-latest:generateContent?key={_GEMINI_API_KEY}"
)

# Gemma 3 4B — hosted on Cloud Run (GPU: NVIDIA L4)
_GEMMA_CLOUD_RUN_URL: str = (
    _secrets.get("cloud_run_gemma_url")
    or os.getenv("GEMMA_CLOUD_RUN_URL", "")
)

_GCS_LOG_BUCKET: str | None = _secrets.get("gcs_log_bucket")
log_store = GcsTrainingLogStore(bucket_name=_GCS_LOG_BUCKET)


router = APIRouter(
    prefix="/api/training",
    tags=["Continuous Learning"],
    responses={
        200: {"description": "Successful operation"},
        422: {"description": "Validation error"},
    },
)


def get_store() -> FleetKnowledgeStore:
    return FleetKnowledgeStore()


# ──────────────────────────────────────────────────────────────────────────────
# Core helpers: call Gemini / Gemma and parse JSON
# ──────────────────────────────────────────────────────────────────────────────

async def _gemini_generate(prompt: str, endpoint_name: str = "unknown") -> str:
    """Call gemini-flash-latest and return the raw text response."""
    if not _GEMINI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY not configured. Add it to cloud/secrets.json.",
        )
    
    error_msg = None
    response_text = ""
    payload = {"contents": [{"parts": [{"text": prompt}]}]}
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                _GEMINI_URL,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            resp.raise_for_status()
            data = resp.json()
        response_text = data["candidates"][0]["content"]["parts"][0]["text"]
    except Exception as exc:
        error_msg = str(exc)
        raise
    finally:
        log = TrainingLog(
            log_id=uuid.uuid4().hex[:8],
            timestamp=datetime.now(timezone.utc),
            endpoint=endpoint_name,
            model_used="gemini-flash-latest",
            prompt=prompt,
            raw_response=response_text,
            error=error_msg,
        )
        log_store.add_log(log)

    return response_text


async def _gemma_generate(prompt: str, endpoint_name: str = "unknown") -> str:
    """Call the Gemma 3 4B model on Cloud Run (Ollama-compatible endpoint)."""
    if not _GEMMA_CLOUD_RUN_URL:
        raise HTTPException(
            status_code=503,
            detail="GEMMA_CLOUD_RUN_URL not configured. Add it to cloud/secrets.json.",
        )
    
    error_msg = None
    response_text = ""
    payload = {"model": "gemma3:4b", "prompt": prompt, "stream": False}
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{_GEMMA_CLOUD_RUN_URL}/api/generate",
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            resp.raise_for_status()
            data = resp.json()
        response_text = data.get("response", "")
    except Exception as exc:
        error_msg = str(exc)
        raise
    finally:
        log = TrainingLog(
            log_id=uuid.uuid4().hex[:8],
            timestamp=datetime.now(timezone.utc),
            endpoint=endpoint_name,
            model_used="gemma3:4b",
            prompt=prompt,
            raw_response=response_text,
            error=error_msg,
        )
        log_store.add_log(log)

    return response_text


def _extract_json(text: str) -> str:
    """Strip markdown fences from a model response if present."""
    if "```json" in text:
        text = text.split("```json", 1)[1].split("```", 1)[0]
    elif "```" in text:
        text = text.split("```", 1)[1].split("```", 1)[0]
    return text.strip()


def _build_fault_tree_prompt(query: str, equipment_type: str) -> str:
    return (
        f"You are a field-service diagnostics expert. "
        f"Search for the latest repair knowledge for '{equipment_type}' equipment "
        f"regarding this problem: '{query}'.\n\n"
        "Return a JSON ARRAY (no extra text, no markdown) of fault-tree entries. "
        "Each entry must follow this exact schema:\n"
        "[\n"
        "  {\n"
        '    "fault_id": "<equipment>_<issue>_<short_uuid>",\n'
        '    "symptoms": ["<symptom1>", "<symptom2>"],\n'
        '    "hypotheses": [\n'
        "      {\n"
        '        "name": "<hypothesis_name>",\n'
        '        "diagnostic_step": "<single verifiable step>",\n'
        '        "expected_result": "<what a pass looks like>",\n'
        '        "if_confirmed": "<repair action>",\n'
        '        "if_ruled_out": "<next hypothesis or escalate>"\n'
        "      }\n"
        "    ],\n"
        '    "safety_flags": []\n'
        "  }\n"
        "]\n\n"
        "Include 2-4 hypotheses per entry. Return ONLY the JSON array."
    )


def _build_conversation_learning_prompt(conversation: dict) -> str:
    turns = conversation.get("turns", [])
    history = "\n".join(
        f"[{t.get('role','?')}]: {t.get('content','')}" for t in turns
    )
    equipment = conversation.get("equipment_type", "unknown")
    return (
        f"This is an offline diagnostic conversation for '{equipment}' equipment.\n\n"
        f"{history}\n\n"
        "Extract any resolved diagnostic steps and structure them as a JSON ARRAY "
        "of fault-tree entries using the same schema as before. "
        "If nothing conclusive was reached, return an empty array []. "
        "Return ONLY the JSON array."
    )


# ──────────────────────────────────────────────────────────────────────────────
# Routes
# ──────────────────────────────────────────────────────────────────────────────

@router.post(
    "/continuous-learn",
    response_model=TrainingResponse,
    summary="Fetch new web knowledge and mint fault-tree entries",
    description=(
        "Sends a diagnostic query to Gemini (web-search grounded) and parses the "
        "response into structured FaultTreeEntry objects that are added to the "
        "Fleet Knowledge Store. Devices will receive these on their next sync."
    ),
)
async def continuous_learn(
    data: TrainingData,
    store: FleetKnowledgeStore = Depends(get_store),
) -> TrainingResponse:
    prompt = _build_fault_tree_prompt(data.query, data.equipment_type)
    logger.info("continuous-learn: query=%r equipment=%s", data.query, data.equipment_type)

    try:
        raw = await _gemini_generate(prompt, endpoint_name="/api/training/continuous-learn")
        parsed = json.loads(_extract_json(raw))
    except Exception as exc:
        logger.exception("continuous-learn: gemini call or parse failed")
        raise HTTPException(status_code=502, detail=f"Gemini error: {exc}") from exc

    new_entries: list[FaultTreeEntry] = []
    for item in parsed:
        try:
            entry = FaultTreeEntry(
                fault_id=item.get("fault_id", f"{data.equipment_type}_{uuid.uuid4().hex[:8]}"),
                symptoms=item.get("symptoms", []),
                hypotheses=[Hypothesis(**h) for h in item.get("hypotheses", [])],
                safety_flags=item.get("safety_flags", []),
                source_session_id=None,
                created_at=datetime.now(timezone.utc),
            )
            store.add_entry(entry)
            new_entries.append(entry)
        except Exception:
            logger.exception("continuous-learn: failed to parse entry %s", item)

    return TrainingResponse(
        status="success",
        new_entries_generated=len(new_entries),
        data=new_entries,
    )


@router.post(
    "/offline-conversations",
    response_model=TrainingResponse,
    summary="Ingest offline conversation logs and extract learning signal",
    description=(
        "Accepts a list of raw offline conversation objects (each with an 'equipment_type' "
        "and 'turns' list). Gemini extracts any resolved diagnostic knowledge and mints "
        "new FaultTreeEntry objects for the fleet store."
    ),
)
async def ingest_offline_conversations(
    conversations: list[dict],
    store: FleetKnowledgeStore = Depends(get_store),
) -> TrainingResponse:
    all_entries: list[FaultTreeEntry] = []

    for conv in conversations:
        equipment = conv.get("equipment_type", "unknown")
        logger.info("offline-conversations: processing conversation for %s", equipment)
        prompt = _build_conversation_learning_prompt(conv)
        try:
            raw = await _gemini_generate(prompt, endpoint_name="/api/training/offline-conversations")
            parsed = json.loads(_extract_json(raw))
        except Exception:
            logger.exception("offline-conversations: failed for one conversation, skipping")
            continue

        for item in parsed:
            try:
                entry = FaultTreeEntry(
                    fault_id=item.get("fault_id", f"{equipment}_{uuid.uuid4().hex[:8]}"),
                    symptoms=item.get("symptoms", []),
                    hypotheses=[Hypothesis(**h) for h in item.get("hypotheses", [])],
                    safety_flags=item.get("safety_flags", []),
                    source_session_id=conv.get("session_id"),
                    created_at=datetime.now(timezone.utc),
                )
                store.add_entry(entry)
                all_entries.append(entry)
            except Exception:
                logger.exception("offline-conversations: failed to parse entry %s", item)

    return TrainingResponse(
        status="success",
        new_entries_generated=len(all_entries),
        data=all_entries,
    )


@router.get(
    "/status",
    summary="Training / fleet knowledge status",
    description="Returns the current state of the Fleet Knowledge Store and model training readiness.",
)
async def training_status(store: FleetKnowledgeStore = Depends(get_store)) -> dict:
    entries = store.list_entries()
    by_equipment: dict[str, int] = {}
    for e in entries:
        # derive equipment from fault_id prefix (e.g. diesel_genset_...)
        equip = "_".join(e.fault_id.split("_")[:2]) if "_" in e.fault_id else e.fault_id
        by_equipment[equip] = by_equipment.get(equip, 0) + 1

    return {
        "status": "ready",
        "total_fleet_entries": len(entries),
        "entries_by_equipment": by_equipment,
        "lora_adapter_ready": len(entries) >= 10,  # concept threshold
        "gemini_api_configured": bool(_GEMINI_API_KEY),
        "gemma_cloud_run_configured": bool(_GEMMA_CLOUD_RUN_URL),
        "gemma_cloud_run_url": _GEMMA_CLOUD_RUN_URL or "(not set)",
        "nosignal_cloud_run_url": _secrets.get("cloud_run_nosignal_url", "(not set)"),
    }


@router.post(
    "/gemma-infer",
    summary="Run inference against the Cloud-hosted Gemma 3 4B (GPU)",
    description=(
        "Sends a prompt directly to the **Gemma 3 4B** model running on Google Cloud Run "
        "(NVIDIA L4 GPU). This is the same model the mobile device runs locally — useful "
        "for testing prompts against the cloud-hosted twin before pushing them on-device, "
        "and for generating training data in the retraining pipeline."
    ),
)
async def gemma_infer(body: dict) -> dict:
    prompt: str = body.get("prompt", "")
    if not prompt:
        raise HTTPException(status_code=422, detail="'prompt' field is required")
    try:
        response = await _gemma_generate(prompt, endpoint_name="/api/training/gemma-infer")
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("gemma-infer: call failed")
        raise HTTPException(status_code=502, detail=f"Gemma Cloud Run error: {exc}") from exc
    return {
        "model": "gemma3:4b",
        "endpoint": _GEMMA_CLOUD_RUN_URL,
        "prompt": prompt,
        "response": response,
    }


@router.post(
    "/retrain-from-fleet",
    summary="[DEMO] Generate a LoRA-style training summary from fleet data",
    description=(
        "Aggregates all fleet fault-tree entries and asks Gemini to produce a "
        "consolidated diagnostic knowledge summary — a conceptual stand-in for the "
        "periodic LoRA adapter fine-tune described in ARCHITECTURE.md §4.4. "
        "In production this would trigger a Vertex AI fine-tuning job."
    ),
)
async def retrain_from_fleet(store: FleetKnowledgeStore = Depends(get_store)) -> dict:
    entries = store.list_entries()
    if not entries:
        raise HTTPException(status_code=400, detail="No fleet entries to retrain from.")

    # Summarise into a condensed prompt
    entry_summaries = "\n".join(
        f"- fault_id={e.fault_id}, symptoms={e.symptoms}, "
        f"hypotheses={[h.name for h in e.hypotheses]}"
        for e in entries[:30]  # cap to avoid token overflow
    )
    prompt = (
        "You are a field-service AI trainer. Below are fault-tree entries collected from "
        "a fleet of devices. Produce a concise JSON object summarising key patterns:\n"
        "{\n"
        '  "common_faults": [...],\n'
        '  "top_diagnostic_steps": [...],\n'
        '  "recommended_training_topics": [...],\n'
        '  "lora_adapter_description": "<one sentence>"\n'
        "}\n\n"
        f"Fleet data:\n{entry_summaries}\n\n"
        "Return ONLY the JSON object."
    )

    try:
        raw = await _gemini_generate(prompt, endpoint_name="/api/training/retrain-from-fleet")
        summary = json.loads(_extract_json(raw))
    except Exception as exc:
        logger.exception("retrain-from-fleet: failed")
        raise HTTPException(status_code=502, detail=f"Gemini error: {exc}") from exc

    return {
        "status": "training_summary_generated",
        "entries_used": len(entries),
        "summary": summary,
    }


@router.get(
    "/logs",
    summary="Retrieve detailed training logs from GCS",
    description=(
        "Fetches the raw LLM prompts and responses (training logs) directly from "
        "the Google Cloud Storage bucket. This provides full visibility into exactly "
        "what the models are being asked and how they are responding."
    ),
    response_model=list[TrainingLog],
)
async def get_training_logs(limit: int = 50) -> list[TrainingLog]:
    """Return recent training logs from the GCS bucket."""
    return log_store.list_logs(limit=limit)
