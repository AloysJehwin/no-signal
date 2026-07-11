from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timezone

from cloud.schemas import FaultTreeEntry, HandoffReport, Hypothesis, ValidatedFix

logger = logging.getLogger(__name__)

_MODEL = "gemini-2.5-flash"
_FAULT_ID_RE = re.compile(r"[^a-z0-9_]+")


class DistillationAgent:
    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or os.getenv("GEMINI_API_KEY")
        self._client: object | None = None

    def _client_or_none(self) -> object | None:
        if self._client is not None or not self._api_key:
            return self._client
        try:
            from google import genai

            self._client = genai.Client(api_key=self._api_key)
        except Exception:  # noqa: BLE001
            logger.warning("google-genai unavailable; DistillationAgent will use deterministic fallback")
            self._client = None
        return self._client

    async def distill(self, fix: ValidatedFix, report: HandoffReport) -> FaultTreeEntry:
        client = self._client_or_none()
        if client is not None:
            entry = await self._distill_via_model(client, fix, report)
            if entry is not None:
                return entry
        return _fallback_entry(fix, report)

    async def _distill_via_model(
        self, client: object, fix: ValidatedFix, report: HandoffReport
    ) -> FaultTreeEntry | None:
        prompt = _build_prompt(fix, report)
        try:
            response = client.models.generate_content(  # type: ignore[attr-defined]
                model=_MODEL,
                contents=prompt,
                config={"response_mime_type": "application/json"},
            )
        except Exception:  # noqa: BLE001
            logger.exception("distillation model call failed")
            return None

        raw = (getattr(response, "text", "") or "").strip()
        if not raw:
            return None
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("distillation returned non-JSON; falling back")
            return None

        payload.setdefault("source_session_id", report.session_id)
        payload.setdefault("created_at", datetime.now(timezone.utc).isoformat())
        try:
            return FaultTreeEntry.model_validate(payload)
        except Exception:  # noqa: BLE001
            logger.exception("distilled payload failed schema validation")
            return None


def _fallback_entry(fix: ValidatedFix, report: HandoffReport) -> FaultTreeEntry:
    c = fix.candidate
    hypothesis = Hypothesis(
        name=report.leading_hypothesis,
        diagnostic_step=c.diagnostic_step or "inspect suspected component",
        expected_result=c.expected_result or "issue resolved",
        if_confirmed=c.proposed_fix or "apply proposed fix",
        if_ruled_out="escalate to human expert",
    )
    return FaultTreeEntry(
        fault_id=_fault_id_from(report),
        symptoms=c.symptoms or [report.leading_hypothesis],
        hypotheses=[hypothesis],
        safety_flags=c.safety_flags,
        source_session_id=report.session_id,
        created_at=datetime.now(timezone.utc),
    )


def _fault_id_from(report: HandoffReport) -> str:
    slug = f"{report.equipment_type}_{report.leading_hypothesis}".lower()
    slug = _FAULT_ID_RE.sub("_", slug).strip("_")
    return f"{slug}_{report.session_id[:8]}"


def _build_prompt(fix: ValidatedFix, report: HandoffReport) -> str:
    return (
        "Compress this validated fix into a fault-tree entry JSON with keys: "
        "fault_id, symptoms (list[str]), hypotheses (list of {name, diagnostic_step, "
        "expected_result, if_confirmed, if_ruled_out}), safety_flags (list[str]).\n\n"
        f"Equipment: {report.equipment_type}\n"
        f"Leading hypothesis: {report.leading_hypothesis}\n"
        f"Symptoms: {', '.join(fix.candidate.symptoms) or '(none)'}\n"
        f"Proposed fix: {fix.candidate.proposed_fix}\n"
        f"Diagnostic step: {fix.candidate.diagnostic_step}\n"
        f"Expected result: {fix.candidate.expected_result}\n"
        f"Safety flags: {', '.join(fix.candidate.safety_flags) or '(none)'}\n"
        "Return JSON only."
    )
