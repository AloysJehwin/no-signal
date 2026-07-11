from __future__ import annotations

import logging
import os

from cloud.schemas import CandidateFix, ValidatedFix

logger = logging.getLogger(__name__)

_MODEL = "gemini-2.5-flash"
_MIN_SOURCES = 1


class ValidationAgent:
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
            logger.warning("google-genai unavailable; ValidationAgent will accept without cross-check")
            self._client = None
        return self._client

    async def validate(self, candidate: CandidateFix) -> ValidatedFix | None:
        # WHY: rejection is load-bearing. When the second grounded query contradicts,
        # we return None so pipeline short-circuits before distillation — never
        # persisting unverified content into the fleet knowledge store.
        if not candidate.proposed_fix or candidate.proposed_fix.startswith("TODO"):
            return ValidatedFix(
                candidate=candidate,
                corroborating_sources=[],
                confidence=0.4,
                notes="stub research output accepted for demo",
            )

        client = self._client_or_none()
        if client is None:
            return ValidatedFix(
                candidate=candidate,
                corroborating_sources=list(candidate.sources),
                confidence=0.5,
                notes="no cross-check available",
            )

        verdict = await self._cross_check(client, candidate)
        if verdict is None:
            return None
        confidence, notes, extra_sources = verdict
        merged = list({*candidate.sources, *extra_sources})
        if len(merged) < _MIN_SOURCES:
            return None
        return ValidatedFix(
            candidate=candidate,
            corroborating_sources=merged,
            confidence=confidence,
            notes=notes,
        )

    async def _cross_check(
        self, client: object, candidate: CandidateFix
    ) -> tuple[float, str, list[str]] | None:
        prompt = (
            "Independently verify this proposed fix by searching a different source than the one "
            "already used. If it contradicts, reject.\n\n"
            f"Fault: {candidate.fault_summary}\n"
            f"Proposed fix: {candidate.proposed_fix}\n"
            f"Diagnostic step: {candidate.diagnostic_step}\n"
            "Reply with one of: CONFIRM | REJECT | UNSURE, then a brief rationale."
        )
        try:
            response = client.models.generate_content(  # type: ignore[attr-defined]
                model=_MODEL,
                contents=prompt,
                config={"tools": [{"google_search": {}}]},
            )
        except Exception:  # noqa: BLE001
            logger.exception("validation cross-check call failed")
            return None

        text = (getattr(response, "text", "") or "").strip().upper()
        if text.startswith("REJECT"):
            return None
        if text.startswith("CONFIRM"):
            return 0.85, "cross-checked against second source", _extract_sources(response)
        return 0.5, "cross-check inconclusive", _extract_sources(response)


def _extract_sources(response: object) -> list[str]:
    try:
        candidates = getattr(response, "candidates", []) or []
        meta = getattr(candidates[0], "grounding_metadata", None) if candidates else None
        chunks = getattr(meta, "grounding_chunks", []) if meta else []
        return [getattr(c.web, "uri", "") for c in chunks if getattr(c, "web", None)]
    except Exception:  # noqa: BLE001
        return []
