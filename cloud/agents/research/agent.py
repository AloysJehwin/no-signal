from __future__ import annotations

import logging
import os

import uuid
from datetime import datetime, timezone

from cloud.api.training import log_store
from cloud.schemas import CandidateFix, HandoffReport, TrainingLog

logger = logging.getLogger(__name__)

_MODEL = "gemini-2.5-flash"


class ResearchAgent:
    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or os.getenv("GEMINI_API_KEY")
        self._client: object | None = None

    def _client_or_none(self) -> object | None:
        # WHY: import lazily so tests/offline demos work without google-genai installed
        if self._client is not None or not self._api_key:
            return self._client
        try:
            from google import genai

            self._client = genai.Client(api_key=self._api_key)
        except Exception:  # noqa: BLE001
            logger.warning("google-genai unavailable; ResearchAgent will return stub")
            self._client = None
        return self._client

    async def investigate(self, report: HandoffReport) -> CandidateFix:
        symptoms = [s.step for s in report.full_history if not s.match]
        client = self._client_or_none()

        if client is None:
            return CandidateFix(
                fault_summary=f"unresolved: {report.leading_hypothesis}",
                proposed_fix="TODO: real Gemini call with web-search tool",
                diagnostic_step="inspect suspected component",
                expected_result="component within manufacturer spec",
                sources=[],
                equipment_type=report.equipment_type,
                symptoms=symptoms,
                safety_flags=["safety_review_required"] if report.safety_flag else [],
            )

        prompt = _build_prompt(report)
        # TODO: wire real tool spec; google-genai types.Tool(google_search=types.GoogleSearch())
        
        error_msg = None
        response_text = ""
        try:
            response = client.models.generate_content(  # type: ignore[attr-defined]
                model=_MODEL,
                contents=prompt,
                config={"tools": [{"google_search": {}}]},
            )
            response_text = (getattr(response, "text", "") or "").strip()
        except Exception as exc:
            error_msg = str(exc)
            raise
        finally:
            log_store.add_log(TrainingLog(
                log_id=uuid.uuid4().hex[:8],
                timestamp=datetime.now(timezone.utc),
                endpoint="/api/sync/ (ResearchAgent)",
                model_used=_MODEL,
                prompt=prompt,
                raw_response=response_text,
                error=error_msg,
            ))

        text = response_text or "no fix identified"
        return CandidateFix(
            fault_summary=f"{report.equipment_type}: {report.leading_hypothesis}",
            proposed_fix=text,
            diagnostic_step="see proposed_fix",
            expected_result="issue resolved",
            sources=_extract_sources(response),
            equipment_type=report.equipment_type,
            symptoms=symptoms,
            safety_flags=["safety_review_required"] if report.safety_flag else [],
        )


def _build_prompt(report: HandoffReport) -> str:
    ruled_out = ", ".join(report.ruled_out) or "(none)"
    history = "\n".join(
        f"- tried '{s.step}', expected {s.expected}, got {s.reported}"
        for s in report.full_history
    )
    return (
        f"A field technician could not resolve a {report.equipment_type} fault.\n"
        f"Leading hypothesis: {report.leading_hypothesis} (confidence {report.confidence}).\n"
        f"Ruled out: {ruled_out}.\n"
        f"History:\n{history}\n\n"
        "Search manufacturer docs and repair forums. Propose a specific fix "
        "with a single verifiable diagnostic step and expected result."
    )


def _extract_sources(response: object) -> list[str]:
    try:
        candidates = getattr(response, "candidates", []) or []
        meta = getattr(candidates[0], "grounding_metadata", None) if candidates else None
        chunks = getattr(meta, "grounding_chunks", []) if meta else []
        return [getattr(c.web, "uri", "") for c in chunks if getattr(c, "web", None)]
    except Exception:  # noqa: BLE001
        return []
