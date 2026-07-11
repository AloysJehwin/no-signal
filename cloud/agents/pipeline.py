from __future__ import annotations

import logging

from cloud.agents.distillation.agent import DistillationAgent
from cloud.agents.research.agent import ResearchAgent
from cloud.agents.validation.agent import ValidationAgent
from cloud.fleet_store.store import FleetKnowledgeStore
from cloud.schemas import FaultTreeEntry, HandoffReport

logger = logging.getLogger(__name__)

_researcher = ResearchAgent()
_validator = ValidationAgent()
_distiller = DistillationAgent()


async def run_pipeline(
    report: HandoffReport,
    *,
    store: FleetKnowledgeStore | None = None,
    researcher: ResearchAgent | None = None,
    validator: ValidationAgent | None = None,
    distiller: DistillationAgent | None = None,
) -> FaultTreeEntry | None:
    r = researcher or _researcher
    v = validator or _validator
    d = distiller or _distiller

    candidate = await r.investigate(report)
    validated = await v.validate(candidate)

    # WHY: rejection short-circuits before distillation so unverified content
    # never enters the fleet knowledge store. This is the load-bearing safety
    # boundary called out in ARCHITECTURE.md §4.1.
    if validated is None:
        logger.info(
            "validation rejected candidate for session %s (%s)",
            report.session_id,
            candidate.fault_summary,
        )
        return None

    entry = await d.distill(validated, report)
    if store is not None:
        store.add_entry(entry)
    return entry
